from __future__ import annotations

from fastapi import HTTPException, status

from .auth0 import Auth0Client
from .config import settings
from .crypto import TokenCipher

token_cipher = TokenCipher(settings.token_encryption_key)

_auth0_client: Auth0Client | None = None


def get_auth0_client() -> Auth0Client:
    global _auth0_client
    try:
        settings.require_auth0()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    if _auth0_client is None:
        _auth0_client = Auth0Client(settings)
    return _auth0_client


async def close_auth0_client() -> None:
    global _auth0_client
    if _auth0_client is not None:
        await _auth0_client.close()
        _auth0_client = None
