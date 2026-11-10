"""Server-side refresh-token handling shared by the auth route and dependencies.

Access tokens are short-lived (15 minutes by default). Rather than returning a
401 to the browser and asking it to call /auth/refresh, the backend refreshes
the access token itself whenever a protected request arrives with a missing,
expired, or invalid access cookie but a valid session cookie.

The refresh operation is serialized and the newly minted access token is cached
briefly so that concurrent requests with the same expired cookie share one
Auth0 call. A multi-worker deployment would need a distributed lock/cache, but
this application already assumes a single uvicorn worker for its job registry.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .auth0 import Auth0Client, Auth0Error
from .crypto import hash_session_token
from .exceptions import SessionExpiredError
from .models import User
from .services import token_cipher

logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 60.0
_CACHE_MIN_REMAINING_SECONDS = 5.0


@dataclass(slots=True)
class RefreshedSession:
    user: User
    access_token: str
    expires_in: int
    refresh_expires_at: datetime


@dataclass(slots=True)
class _CachedAccess:
    access_token: str
    token_expires_at: float
    cache_expires_at: float


_refresh_lock = asyncio.Lock()
_access_cache: dict[str, _CachedAccess] = {}


def _prune_cache() -> None:
    now = time.monotonic()
    for key, cached in tuple(_access_cache.items()):
        if cached.cache_expires_at <= now:
            _access_cache.pop(key, None)


def clear_refresh_cache(session_token: str) -> None:
    _access_cache.pop(hash_session_token(session_token), None)


def clear_session(user: User) -> None:
    user.session_token_hash = None
    user.refresh_token_encrypted = None
    user.refresh_token_expires_at = None
    user.refresh_token_updated_at = None


async def refresh_session(
    session_token: str,
    db: AsyncSession,
    auth0: Auth0Client,
) -> RefreshedSession:
    """Refresh a session's access token, serializing concurrent refreshes.

    Raises SessionExpiredError when the session/refresh token is definitively
    unusable, and Auth0Error/HTTPException for transient upstream failures so
    callers can return 502/503 without clearing the user's cookies.
    """
    token_hash = hash_session_token(session_token)

    async with _refresh_lock:
        _prune_cache()

        user = await db.scalar(
            select(User).where(User.session_token_hash == token_hash)
        )
        if user is None or not user.refresh_token_encrypted:
            _access_cache.pop(token_hash, None)
            raise SessionExpiredError("Invalid or expired session")

        now = datetime.now(timezone.utc)
        if user.refresh_token_expires_at is None or user.refresh_token_expires_at <= now:
            clear_session(user)
            await db.commit()
            _access_cache.pop(token_hash, None)
            raise SessionExpiredError(
                "Refresh token has expired. Please log in again."
            )

        cached = _access_cache.get(token_hash)
        if cached is not None:
            remaining = int(cached.token_expires_at - time.monotonic())
            if remaining >= _CACHE_MIN_REMAINING_SECONDS:
                return RefreshedSession(
                    user=user,
                    access_token=cached.access_token,
                    expires_in=remaining,
                    refresh_expires_at=user.refresh_token_expires_at,
                )
            _access_cache.pop(token_hash, None)

        try:
            refresh_token = token_cipher.decrypt(user.refresh_token_encrypted)
        except Exception:
            logger.error("Unable to decrypt refresh token for user %s", user.id)
            clear_session(user)
            await db.commit()
            _access_cache.pop(token_hash, None)
            raise SessionExpiredError(
                "Stored refresh token is corrupted. Please log in again."
            ) from None

        try:
            tokens = await auth0.refresh(refresh_token)
        except Auth0Error as exc:
            if exc.status_code in (400, 401, 403):
                clear_session(user)
                await db.commit()
                _access_cache.pop(token_hash, None)
                raise SessionExpiredError(
                    "Refresh token is expired or has been revoked. Please log in again."
                ) from exc
            raise

        access_token = tokens.get("access_token")
        try:
            expires_in = int(tokens.get("expires_in", 0))
        except (TypeError, ValueError):
            expires_in = 0

        if not isinstance(access_token, str) or not access_token or expires_in <= 0:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Auth0 returned an invalid access token",
            )

        if "refresh_token" in tokens:
            user.refresh_token_encrypted = token_cipher.encrypt(
                str(tokens["refresh_token"])
            )
            user.refresh_token_updated_at = now

        await db.commit()
        await db.refresh(user)

        refresh_expires_at = user.refresh_token_expires_at
        if refresh_expires_at is None:
            clear_session(user)
            await db.commit()
            _access_cache.pop(token_hash, None)
            raise SessionExpiredError(
                "Refresh token has expired. Please log in again."
            )

        token_expires_at = time.monotonic() + expires_in
        _access_cache[token_hash] = _CachedAccess(
            access_token=access_token,
            token_expires_at=token_expires_at,
            cache_expires_at=min(
                time.monotonic() + _CACHE_TTL_SECONDS,
                token_expires_at - _CACHE_MIN_REMAINING_SECONDS,
            ),
        )

        logger.info("Refreshed access token for user %s", user.id)
        return RefreshedSession(
            user=user,
            access_token=access_token,
            expires_in=expires_in,
            refresh_expires_at=refresh_expires_at,
        )
