from __future__ import annotations

import logging
from typing import Any

import jwt
from fastapi import Depends, HTTPException, Request, Response, status
from jwt import PyJWKClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from .auth0 import Auth0Error
from .config import settings
from .cookies import set_access_cookie, set_session_cookie
from .database import get_db
from .exceptions import SessionExpiredError
from .models import User
from .services import get_auth0_client
from .sessions import refresh_session

logger = logging.getLogger(__name__)

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


async def get_token_claims(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    token = request.cookies.get(settings.access_cookie_name)
    detail = "Missing access token cookie"

    if token:
        try:
            settings.require_auth0()
        except RuntimeError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
            ) from exc

        try:
            return await run_in_threadpool(_decode_access_token, token)
        except jwt.ExpiredSignatureError:
            detail = "Access token has expired"
        except (jwt.PyJWTError, jwt.PyJWKClientError):
            detail = "Access token is invalid"
        except Exception as exc:  # network/JWKS retrieval failures
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to validate the access token right now",
            ) from exc

    session_token = request.cookies.get(settings.session_cookie_name)
    if not session_token:
        raise _unauthorized(detail)

    try:
        refreshed = await refresh_session(
            session_token,
            db,
            get_auth0_client(),
        )
    except SessionExpiredError:
        raise
    except Auth0Error as exc:
        logger.warning("Unable to refresh the access token: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to refresh the session right now",
        ) from exc

    set_access_cookie(response, refreshed.access_token, refreshed.expires_in)
    set_session_cookie(response, session_token, refreshed.refresh_expires_at)

    try:
        return await run_in_threadpool(
            _decode_access_token, refreshed.access_token
        )
    except (jwt.PyJWTError, jwt.PyJWKClientError) as exc:
        logger.error("Refreshed access token is invalid for user %s", refreshed.user.id)
        raise SessionExpiredError("Refreshed access token is invalid") from exc
    except Exception as exc:  # network/JWKS retrieval failures
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to validate the refreshed access token right now",
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
