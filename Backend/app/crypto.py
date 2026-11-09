from __future__ import annotations

import base64
import hashlib
import os
import secrets

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_AAD = b"medical-rag:auth0:refresh-token"
_VERSION = "v1"
_NONCE_BYTES = 12


class TokenCipher:
    """AES-256-GCM encryption for OAuth refresh tokens at rest."""

    def __init__(self, key: str) -> None:
        try:
            raw_key = base64.urlsafe_b64decode(key.encode("ascii"))
        except Exception as exc:
            raise ValueError("TOKEN_ENCRYPTION_KEY must be base64-urlsafe encoded") from exc
        if len(raw_key) != 32:
            raise ValueError("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes")
        self._aesgcm = AESGCM(raw_key)

    def encrypt(self, plaintext: str) -> str:
        nonce = os.urandom(_NONCE_BYTES)
        ciphertext = self._aesgcm.encrypt(nonce, plaintext.encode("utf-8"), _AAD)
        payload = base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii")
        return f"{_VERSION}:{payload}"

    def decrypt(self, token: str) -> str:
        version, separator, payload = token.partition(":")
        if not separator or version != _VERSION:
            raise ValueError("Unsupported encrypted token format")
        raw = base64.urlsafe_b64decode(payload.encode("ascii"))
        nonce, ciphertext = raw[:_NONCE_BYTES], raw[_NONCE_BYTES:]
        plaintext = self._aesgcm.decrypt(nonce, ciphertext, _AAD)
        return plaintext.decode("utf-8")


def generate_session_token() -> str:
    return secrets.token_urlsafe(48)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
