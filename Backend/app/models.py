from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

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

    documents: Mapped[list[Document]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    chat_histories: Mapped[list[ChatHistory]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r}>"


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        UniqueConstraint("user_id", "file_sha256", name="uq_documents_user_file_sha256"),
        UniqueConstraint(
            "user_id", "original_filename", name="uq_documents_user_original_filename"
        ),
    )

    ## 32-hex token from generate_document_id() (protect.ipynb); primary key,
    ## so it is the index used to look documents up.
    document_id: Mapped[str] = mapped_column(String(32), primary_key=True)

    ## Owning user; deleting the user cascades to all their documents.
    user_id: Mapped[uuid.UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    ## S3 location of the encrypted package: all three objects
    ## (ciphertext.bin, signature.bin, manifest.json) live under this prefix.
    s3_bucket: Mapped[str] = mapped_column(String(255), nullable=False)
    s3_prefix: Mapped[str] = mapped_column(String(512), nullable=False)

    ## Original upload metadata (display name may carry a "(1)"/"(2)" suffix
    ## when the same file name was uploaded twice).
    original_filename: Mapped[str] = mapped_column(String(512), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(255), nullable=False)
    original_size: Mapped[int] = mapped_column(BigInteger, nullable=False)

    ## SHA-256 of the plaintext upload, used for per-user deduplication.
    file_sha256: Mapped[str] = mapped_column(String(64), nullable=False)

    ## SHA-256 of the encrypted copy, recorded from the signed manifest.
    ciphertext_sha256: Mapped[str] = mapped_column(String(64), nullable=False)

    is_ready: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )
    ingestion_status: Mapped[str | None] = mapped_column(String(32))
    ingestion_error: Mapped[str | None] = mapped_column(Text)
    qdrant_point_ids: Mapped[list[str]] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb"), nullable=False
    )

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

    user: Mapped[User] = relationship(back_populates="documents")
    images: Mapped[list[DocumentImage]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Document id={self.document_id} user_id={self.user_id}>"


class DocumentImage(Base):
    __tablename__ = "images"

    document_id: Mapped[str] = mapped_column(
        String(32),
        ForeignKey("documents.document_id", ondelete="CASCADE"),
        primary_key=True,
    )
    image_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    ## Raw JPEG bytes (resized to max 1024px, quality 80) — see
    ## image_repository.process_base64_image.
    image_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    image_type: Mapped[str | None] = mapped_column(String(64))
    summary: Mapped[str | None] = mapped_column(Text)
    page_number: Mapped[int | None] = mapped_column(Integer)
    coordinates: Mapped[dict | list | None] = mapped_column(JSONB)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now(), nullable=False
    )

    document: Mapped[Document] = relationship(back_populates="images")

    def __repr__(self) -> str:
        return f"<DocumentImage document_id={self.document_id} image_id={self.image_id}>"


def generate_chat_id(user_id: uuid.UUID | str) -> str:
    """Chat id: ch-{first 5 chars of the user id}-{UUID4}."""
    return f"ch-{str(user_id)[:5]}-{uuid.uuid4()}"


def generate_message_id(chat_id: str) -> str:
    """Message id: msg-{first 5 chars of the chat id}-{UUID4}."""
    return f"msg-{chat_id[:5]}-{uuid.uuid4()}"


class ChatHistory(Base):
    __tablename__ = "chat_histories"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), default="New Chat", nullable=False)

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

    user: Mapped[User] = relationship(back_populates="chat_histories")
    messages: Mapped[list[Message]] = relationship(
        back_populates="chat_history",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )

    def __repr__(self) -> str:
        return f"<ChatHistory id={self.id} user_id={self.user_id}>"


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    chat_history_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("chat_histories.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # "User" | "AI"
    content: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now(), nullable=False
    )

    chat_history: Mapped[ChatHistory] = relationship(back_populates="messages")
    citations: Mapped[list[MessageCitation]] = relationship(
        back_populates="message", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Message id={self.id} role={self.role}>"


class MessageCitation(Base):
    __tablename__ = "message_citations"

    id: Mapped[uuid.UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    message_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("messages.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    ## "E{int}" evidence badge shown next to the answer text.
    evidence_id: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), nullable=False)
    doc_id: Mapped[str | None] = mapped_column(String(32))
    file_name: Mapped[str | None] = mapped_column(String(512))
    content_type: Mapped[str | None] = mapped_column(String(32))  # text | table | image
    ## Evidence content for text/table citations (chunk text or raw table
    ## HTML); NULL for image citations.
    content: Mapped[str | None] = mapped_column(Text)
    page_number: Mapped[int | None] = mapped_column(Integer)
    coordinates: Mapped[dict | list | None] = mapped_column(JSONB)
    score: Mapped[float] = mapped_column(Float, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now(), nullable=False
    )

    message: Mapped[Message] = relationship(back_populates="citations")

    def __repr__(self) -> str:
        return f"<MessageCitation id={self.id} evidence_id={self.evidence_id}>"
