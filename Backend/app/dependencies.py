from __future__ import annotations

from typing import Any

import jwt
from fastapi import Depends, HTTPException, Request, status
from jwt import PyJWKClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from .config import settings
from .database import get_db
from .models import User

_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(
            settings.jwks_url,
            cache_keys=True,
            cache_jwk_set=True,
            lifespan=3600,
            timeout=10,
        )
    return _jwks_client


def _decode_access_token(token: str) -> dict[str, Any]:
    signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=settings.auth0_audience,
        issuer=settings.issuer,
        leeway=settings.access_token_leeway_seconds,
        options={"require": ["exp", "iat", "iss", "aud", "sub"]},
    )


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


async def verify_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if origin and origin not in settings.origin_list:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Request origin is not allowed",
        )


async def get_token_claims(request: Request) -> dict[str, Any]:
    token = request.cookies.get(settings.access_cookie_name)
    if not token:
        raise _unauthorized("Missing access token cookie")

    try:
        settings.require_auth0()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc

    try:
        return await run_in_threadpool(_decode_access_token, token)
    except jwt.ExpiredSignatureError as exc:
        raise _unauthorized("Access token has expired") from exc
    except (jwt.PyJWTError, jwt.PyJWKClientError) as exc:
        raise _unauthorized("Access token is invalid") from exc
    except Exception as exc:  # network/JWKS retrieval failures
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to validate the access token right now",
        ) from exc


async def get_session_token(request: Request) -> str:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise _unauthorized("Missing session cookie")
    return token


def get_optional_session_token(request: Request) -> str | None:
    return request.cookies.get(settings.session_cookie_name)


async def get_current_user(
    claims: dict[str, Any] = Depends(get_token_claims),
    db: AsyncSession = Depends(get_db),
) -> User:
    sub = claims.get("sub")
    if not sub:
        raise _unauthorized("Access token is missing the subject claim")

    user = await db.scalar(select(User).where(User.auth0_sub == sub))
    if user is None:
        raise _unauthorized("User is not registered in this application")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive")
    return user


def require_scope(scope: str):
    async def _checker(claims: dict[str, Any] = Depends(get_token_claims)) -> dict[str, Any]:
        scopes = str(claims.get("scope", "")).split()
        if scope not in scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required scope: {scope}",
            )
        return claims

    return _checker
