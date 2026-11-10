from __future__ import annotations

from fastapi import Request, status
from fastapi.responses import JSONResponse

from .cookies import clear_auth_cookies


class SessionExpiredError(Exception):
    """Raised when the server-side session can no longer be refreshed."""

    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


async def session_expired_handler(
    _: Request, exc: SessionExpiredError
) -> JSONResponse:
    response = JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content={"detail": exc.detail},
    )
    clear_auth_cookies(response)
    return response
