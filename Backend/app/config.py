from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    postgres_connection_string: str
    auth0_domain: str = ""
    auth0_client_id: str = ""
    auth0_client_secret: str = ""
    auth0_audience: str = ""
    auth0_connection: str = "Username-Password-Authentication"

    token_encryption_key: str
    refresh_token_max_lifetime_days: int = 30
    access_token_leeway_seconds: int = 30
    allowed_origins: str = "http://localhost:3000"

    cookie_secure: bool = False
    cookie_samesite: str = "lax"
    cookie_domain: str | None = None
    access_cookie_name: str = "rag_access_token"
    session_cookie_name: str = "rag_session_token"
    access_cookie_path: str = "/api"
    session_cookie_path: str = "/api/auth"

    @field_validator("auth0_domain")
    @classmethod
    def normalize_domain(cls, value: str) -> str:
        value = value.strip()
        if value.startswith("https://"):
            value = value[len("https://") :]
        if value.startswith("http://"):
            value = value[len("http://") :]
        return value.rstrip("/")

    @field_validator("auth0_client_id", "auth0_client_secret", "auth0_audience", "auth0_connection")
    @classmethod
    def strip_auth0_values(cls, value: str) -> str:
        return value.strip()

    @field_validator("cookie_samesite")
    @classmethod
    def normalize_cookie_samesite(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in {"lax", "strict", "none"}:
            raise ValueError("COOKIE_SAMESITE must be lax, strict, or none")
        return value

    @field_validator("cookie_domain")
    @classmethod
    def empty_cookie_domain_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @property
    def issuer(self) -> str:
        return f"https://{self.auth0_domain}/"

    @property
    def jwks_url(self) -> str:
        return f"https://{self.auth0_domain}/.well-known/jwks.json"

    @property
    def origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def async_database_url(self) -> str:
        parts = urlsplit(self.postgres_connection_string)
        query = [
            (key, value)
            for key, value in parse_qsl(parts.query)
            if key not in {"channel_binding", "sslmode"}
        ]
        scheme = "postgresql+asyncpg" if parts.scheme == "postgresql" else parts.scheme
        return urlunsplit((scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))

    @property
    def async_database_connect_args(self) -> dict[str, object]:
        query = dict(parse_qsl(urlsplit(self.postgres_connection_string).query))
        sslmode = query.get("sslmode")
        if not sslmode:
            return {}
        if sslmode == "disable":
            return {"ssl": False}
        if sslmode in {"allow", "prefer", "require", "verify-ca", "verify-full"}:
            return {"ssl": sslmode}
        return {}

    def require_auth0(self) -> None:
        missing = [
            name
            for name, value in {
                "AUTH0_DOMAIN": self.auth0_domain,
                "AUTH0_CLIENT_ID": self.auth0_client_id,
                "AUTH0_CLIENT_SECRET": self.auth0_client_secret,
                "AUTH0_AUDIENCE": self.auth0_audience,
            }.items()
            if not value
        ]
        if missing:
            raise RuntimeError(
                "Auth0 is not configured. Add the following values to Backend/.env: "
                + ", ".join(missing)
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
