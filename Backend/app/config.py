from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent

# Allowed upload types: MIME type -> extension used for the stored file name.
ALLOWED_MIME_TYPES: dict[str, str] = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
}

ALLOWED_FILENAME_EXTENSIONS: set[str] = {".pdf", ".png", ".jpg", ".jpeg"}


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

    aws_region: str
    medical_rag_bucket: str
    kms_encryption_key_id: str
    kms_signing_key_id: str
    s3_sse_kms_key_id: str
    s3_prefix: str = "medical-documents"

    max_upload_bytes: int = 10 * 1024 * 1024
    max_stored_pdf_bytes: int = 50 * 1024 * 1024
    max_image_pixels: int = 50_000_000
    uploads_dir: Path = BASE_DIR / "uploads"

    celery_broker_url: str = "redis://127.0.0.1:6379/0"
    celery_result_backend: str = "redis://127.0.0.1:6379/1"
    document_events_redis_url: str | None = None

    qdrant_url: str = ""
    qdrant_api_key: str = ""
    qdrant_collection: str = "medical_documents"

    text_embedding_base_url: str = "http://127.0.0.1:1234/v1"
    text_embedding_model: str = "text-embedding-medembed-large-v0.1"
    text_embedding_api_key: str = ""

    image_analysis_base_url: str = "https://api.xkiro.com/v1"
    image_analysis_model: str = "mistralai/mistral-large-2512"
    image_analysis_api_key: str = ""

    pii_api_url: str = ""
    pii_api_timeout_seconds: float = 180.0
    biomedclip_images_batch_url: str = "http://127.0.0.1:8001/v1/embeddings/images/batch"

    ingestion_batch_size: int = 3
    image_ingestion_batch_size: int = 4
    image_analysis_concurrency: int = 5
    unstructured_warmup_enabled: bool = True

    logfire_api_key: str = ""
    logfire_environment: str = "development"

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
    session_cookie_path: str = "/api"

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

    @property
    def events_redis_url(self) -> str:
        return self.document_events_redis_url or self.celery_broker_url

    @property
    def originals_dir(self) -> Path:
        return self.uploads_dir / "originals"

    @property
    def encrypted_dir(self) -> Path:
        return self.uploads_dir / "encrypted"

    def ensure_upload_dirs(self) -> None:
        self.originals_dir.mkdir(parents=True, exist_ok=True)
        self.encrypted_dir.mkdir(parents=True, exist_ok=True)

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
