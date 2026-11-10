from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Response

from .config import settings

LEGACY_SESSION_COOKIE_PATH = "/api/auth"


def _delete_cookie(response: Response, key: str, path: str) -> None:
    response.delete_cookie(
        key=key,
        path=path,
        domain=settings.cookie_domain,
        secure=settings.cookie_secure,
        httponly=True,
        samesite=settings.cookie_samesite,
    )


def _seconds_until(expires_at: datetime) -> int:
    now = datetime.now(timezone.utc)
    return max(0, int((expires_at - now).total_seconds()))


def set_access_cookie(response: Response, access_token: str, expires_in: int) -> None:
    response.set_cookie(
        key=settings.access_cookie_name,
        value=access_token,
        max_age=expires_in,
        path=settings.access_cookie_path,
        domain=settings.cookie_domain,
        secure=settings.cookie_secure,
        httponly=True,
        samesite=settings.cookie_samesite,
    )


def set_session_cookie(
    response: Response, session_token: str, expires_at: datetime
) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=session_token,
        max_age=_seconds_until(expires_at),
        path=settings.session_cookie_path,
        domain=settings.cookie_domain,
        secure=settings.cookie_secure,
        httponly=True,
        samesite=settings.cookie_samesite,
    )
    if settings.session_cookie_path != LEGACY_SESSION_COOKIE_PATH:
        _delete_cookie(
            response, settings.session_cookie_name, LEGACY_SESSION_COOKIE_PATH
        )


def clear_auth_cookies(response: Response) -> None:
    _delete_cookie(response, settings.access_cookie_name, settings.access_cookie_path)
    _delete_cookie(response, settings.session_cookie_name, settings.session_cookie_path)
    if settings.session_cookie_path != LEGACY_SESSION_COOKIE_PATH:
        _delete_cookie(
            response, settings.session_cookie_name, LEGACY_SESSION_COOKIE_PATH
        )
