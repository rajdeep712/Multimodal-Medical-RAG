from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    auth0_sub: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    email_verified: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )

    name: Mapped[str | None] = mapped_column(String(255))
    nickname: Mapped[str | None] = mapped_column(String(255))
    picture: Mapped[str | None] = mapped_column(Text)
    provider: Mapped[str | None] = mapped_column(String(50))

    role: Mapped[str] = mapped_column(
        String(32), default="user", server_default=text("'user'"), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true"), nullable=False
    )

    session_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    refresh_token_encrypted: Mapped[str | None] = mapped_column(Text)
    refresh_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    refresh_token_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r}>"
