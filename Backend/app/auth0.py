from __future__ import annotations

from typing import Any

import httpx

from .config import Settings


class Auth0Error(Exception):
    def __init__(self, status_code: int, error: str, description: str) -> None:
        self.status_code = status_code
        self.error = error
        self.description = description
        super().__init__(f"{error}: {description}")


class Auth0Client:
    """Thin async client for the Auth0 Authentication API."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = httpx.AsyncClient(
            base_url=f"https://{settings.auth0_domain}",
            timeout=httpx.Timeout(15.0, connect=10.0),
            headers={"Accept": "application/json", "User-Agent": "medical-rag-api/1.0"},
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def signup(
        self,
        *,
        email: str,
        password: str,
        name: str | None = None,
        username: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "client_id": self._settings.auth0_client_id,
            "email": email,
            "password": password,
            "connection": self._settings.auth0_connection,
        }
        if name:
            payload["name"] = name
        if username:
            payload["username"] = username

        response = await self._client.post("/dbconnections/signup", json=payload)
        return self._handle(response)

    async def login(self, *, email: str, password: str) -> dict[str, Any]:
        response = await self._client.post(
            "/oauth/token",
            json={
                "grant_type": "http://auth0.com/oauth/grant-type/password-realm",
                "realm": self._settings.auth0_connection,
                "client_id": self._settings.auth0_client_id,
                "client_secret": self._settings.auth0_client_secret,
                "username": email,
                "password": password,
                "audience": self._settings.auth0_audience,
                "scope": "openid profile email offline_access",
            },
        )
        return self._handle(response)

    async def refresh(self, refresh_token: str) -> dict[str, Any]:
        response = await self._client.post(
            "/oauth/token",
            json={
                "grant_type": "refresh_token",
                "client_id": self._settings.auth0_client_id,
                "client_secret": self._settings.auth0_client_secret,
                "refresh_token": refresh_token,
            },
        )
        return self._handle(response)

    async def userinfo(self, access_token: str) -> dict[str, Any]:
        response = await self._client.get(
            "/userinfo", headers={"Authorization": f"Bearer {access_token}"}
        )
        return self._handle(response)

    async def revoke(self, refresh_token: str) -> None:
        response = await self._client.post(
            "/oauth/revoke",
            data={
                "client_id": self._settings.auth0_client_id,
                "client_secret": self._settings.auth0_client_secret,
                "token": refresh_token,
            },
        )
        self._handle(response)

    @staticmethod
    def _handle(response: httpx.Response) -> dict[str, Any]:
        if response.is_success:
            if not response.content:
                return {}
            try:
                data = response.json()
            except ValueError:
                return {"raw": response.text}
            return data if isinstance(data, dict) else {"data": data}

        error = "auth0_error"
        description = response.text or "Unknown Auth0 error"
        try:
            body = response.json()
            if isinstance(body, dict):
                error = body.get("error", error)
                description = body.get("error_description", description)
        except ValueError:
            pass
        raise Auth0Error(response.status_code, str(error), str(description))
