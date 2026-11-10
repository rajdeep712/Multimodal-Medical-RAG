from __future__ import annotations

import hmac
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth0 import Auth0Client, Auth0Error
from ..config import settings
from ..cookies import clear_auth_cookies, set_access_cookie, set_session_cookie
from ..crypto import generate_session_token, hash_session_token
from ..database import get_db
from ..dependencies import (
    get_current_user,
    get_optional_session_token,
    get_session_token,
    verify_origin,
)
from ..models import User
from ..schemas import (
    LoginRequest,
    SessionResponse,
    SignupRequest,
    SignupResponse,
    UserResponse,
)
from ..services import get_auth0_client, token_cipher
from ..sessions import (
    RefreshedSession,
    clear_refresh_cache,
    clear_session,
    refresh_session,
)

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(verify_origin)])


def _auth0_http_error(exc: Auth0Error) -> HTTPException:
    if exc.error == "invalid_user_password":
        return HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )
    if exc.error == "invalid_signup":
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )
    if exc.error == "mfa_required":
        return HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="MFA is required. Complete authentication through Auth0 Universal Login.",
        )

    description = exc.description or ""
    lowered = description.lower()
    if "invalid audience" in lowered or "not authorized to access resource server" in lowered:
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Auth0 rejected AUTH0_AUDIENCE. In Auth0 Dashboard > Applications > APIs, "
                "check your API Identifier for a leading or trailing space. If it contains "
                "whitespace, delete and recreate the API with a clean identifier, then "
                "authorize this application for it under the application's APIs tab. "
                "AUTH0_AUDIENCE must match the identifier exactly. "
                f"Auth0 said: {description}"
            ),
        )

    if exc.status_code == 400:
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.description)
    if exc.status_code in (401, 403):
        return HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Auth0 rejected the credentials"
        )
    logger.error("Auth0 request failed: %s", exc)
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY, detail="Authentication provider error"
    )


def _require_auth0() -> None:
    try:
        settings.require_auth0()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc


async def _upsert_user(
    db: AsyncSession, profile: dict[str, Any], *, mark_login: bool = True
) -> User:
    sub = profile.get("sub")
    email = profile.get("email")
    if not sub or not email:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Auth0 did not return the required user profile fields",
        )

    normalized_email = str(email).strip().lower()
    now = datetime.now(timezone.utc)

    user = await db.scalar(select(User).where(User.auth0_sub == sub))
    if user is None:
        user = await db.scalar(
            select(User).where(func.lower(User.email) == normalized_email)
        )
        if user is not None and user.auth0_sub != sub:
            user.auth0_sub = sub

    if user is None:
        user = User(auth0_sub=sub, email=normalized_email)
        db.add(user)

    user.email = normalized_email
    user.email_verified = bool(profile.get("email_verified", False))
    if "name" in profile:
        user.name = profile.get("name")
    if "nickname" in profile:
        user.nickname = profile.get("nickname")
    if "picture" in profile:
        user.picture = profile.get("picture")
    if "|" in sub:
        user.provider = sub.split("|", 1)[0]
    if mark_login:
        user.last_login_at = now

    await db.flush()
    await db.refresh(user)
    return user


async def _issue_session(
    user: User, tokens: dict[str, Any], auth0: Auth0Client
) -> tuple[str, datetime]:
    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "Auth0 did not return a refresh token. Enable 'Allow Offline Access' on the API "
                "and the 'Refresh Token' grant type on the application."
            ),
        )

    new_token = str(refresh_token)
    if user.refresh_token_encrypted:
        try:
            previous_token = token_cipher.decrypt(user.refresh_token_encrypted)
            if not hmac.compare_digest(previous_token, new_token):
                await auth0.revoke(previous_token)
        except Exception as exc:
            logger.warning("Unable to revoke previous refresh token for user %s: %s", user.id, exc)

    now = datetime.now(timezone.utc)
    session_token = generate_session_token()
    user.session_token_hash = hash_session_token(session_token)
    user.refresh_token_encrypted = token_cipher.encrypt(new_token)
    user.refresh_token_expires_at = now + timedelta(
        days=settings.refresh_token_max_lifetime_days
    )
    user.refresh_token_updated_at = now
    return session_token, user.refresh_token_expires_at


def _session_response(
    user: User, tokens: dict[str, Any], refresh_expires_at: datetime
) -> SessionResponse:
    if not tokens.get("access_token"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Auth0 did not return an access token",
        )
    expires_in = int(tokens.get("expires_in", 0))
    if expires_in <= 0:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Auth0 returned an invalid access token lifetime",
        )
    now = datetime.now(timezone.utc)
    return SessionResponse(
        user=UserResponse.model_validate(user),
        access_expires_at=now + timedelta(seconds=expires_in),
        session_expires_at=refresh_expires_at,
    )


def _refreshed_session_response(result: RefreshedSession) -> SessionResponse:
    return SessionResponse(
        user=UserResponse.model_validate(result.user),
        access_expires_at=datetime.now(timezone.utc)
        + timedelta(seconds=result.expires_in),
        session_expires_at=result.refresh_expires_at,
    )


def _set_auth_cookies(
    response: Response,
    tokens: dict[str, Any],
    session_token: str,
    refresh_expires_at: datetime,
) -> None:
    set_access_cookie(
        response,
        str(tokens["access_token"]),
        int(tokens["expires_in"]),
    )
    set_session_cookie(response, session_token, refresh_expires_at)


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    payload: SignupRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    auth0: Auth0Client = Depends(get_auth0_client),
) -> SignupResponse:
    _require_auth0()

    try:
        signup_result = await auth0.signup(
            email=str(payload.email),
            password=payload.password,
            name=payload.name,
            username=payload.username,
        )
    except Auth0Error as exc:
        raise _auth0_http_error(exc) from exc

    signup_sub = signup_result.get("user_id") or signup_result.get("_id")
    signup_user: User | None = None
    if signup_sub:
        signup_sub = str(signup_sub)
        if "|" not in signup_sub:
            signup_sub = f"auth0|{signup_sub}"
        signup_user = await _upsert_user(
            db,
            {
                "sub": signup_sub,
                "email": str(payload.email),
                "email_verified": bool(signup_result.get("email_verified", False)),
                "name": payload.name,
            },
            mark_login=False,
        )
        await db.commit()
        await db.refresh(signup_user)
    else:
        logger.warning("Auth0 signup response did not include a user id: %s", signup_result)

    try:
        tokens = await auth0.login(email=str(payload.email), password=payload.password)
    except Auth0Error as exc:
        logger.warning("Account created but automatic login failed: %s", exc)
        return SignupResponse(
            message=(
                "Account created. Automatic login failed, so please log in manually "
                "(the account may require email verification)."
            ),
            user=UserResponse.model_validate(signup_user) if signup_user else None,
        )

    profile = await auth0.userinfo(str(tokens["access_token"]))
    user = await _upsert_user(db, profile)
    session_token, refresh_expires_at = await _issue_session(user, tokens, auth0)
    await db.commit()
    await db.refresh(user)

    session = _session_response(user, tokens, refresh_expires_at)
    _set_auth_cookies(response, tokens, session_token, refresh_expires_at)
    return SignupResponse(
        message="Account created and logged in",
        user=session.user,
        authenticated=True,
    )


@router.post("/login", response_model=SessionResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    auth0: Auth0Client = Depends(get_auth0_client),
) -> SessionResponse:
    _require_auth0()

    try:
        tokens = await auth0.login(email=str(payload.email), password=payload.password)
    except Auth0Error as exc:
        raise _auth0_http_error(exc) from exc

    profile = await auth0.userinfo(str(tokens["access_token"]))
    user = await _upsert_user(db, profile)
    session_token, refresh_expires_at = await _issue_session(user, tokens, auth0)
    await db.commit()
    await db.refresh(user)

    session = _session_response(user, tokens, refresh_expires_at)
    _set_auth_cookies(response, tokens, session_token, refresh_expires_at)
    return session


@router.post("/refresh", response_model=SessionResponse)
async def refresh(
    response: Response,
    session_token: str = Depends(get_session_token),
    db: AsyncSession = Depends(get_db),
    auth0: Auth0Client = Depends(get_auth0_client),
) -> SessionResponse:
    _require_auth0()

    try:
        result = await refresh_session(session_token, db, auth0)
    except Auth0Error as exc:
        raise _auth0_http_error(exc) from exc

    set_access_cookie(response, result.access_token, result.expires_in)
    set_session_cookie(response, session_token, result.refresh_expires_at)
    return _refreshed_session_response(result)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    session_token: str | None = Depends(get_optional_session_token),
    db: AsyncSession = Depends(get_db),
    auth0: Auth0Client = Depends(get_auth0_client),
) -> Response:
    _require_auth0()

    if session_token:
        clear_refresh_cache(session_token)
        token_hash = hash_session_token(session_token)
        user = await db.scalar(select(User).where(User.session_token_hash == token_hash))
        if user is not None:
            if user.refresh_token_encrypted:
                try:
                    refresh_token = token_cipher.decrypt(user.refresh_token_encrypted)
                    await auth0.revoke(refresh_token)
                except Exception as exc:
                    logger.warning(
                        "Unable to revoke refresh token for user %s: %s", user.id, exc
                    )
            clear_session(user)
            await db.commit()

    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_auth_cookies(response)
    return response


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(user)
