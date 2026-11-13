from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(
    settings.async_database_url,
    connect_args=settings.async_database_connect_args,
    pool_pre_ping=True,
    pool_recycle=300,
)

SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    from . import models  # noqa: F401  (register models on Base.metadata)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        await connection.execute(
            text(
                "ALTER TABLE documents "
                "ADD COLUMN IF NOT EXISTS is_ready BOOLEAN NOT NULL DEFAULT FALSE"
            )
        )
        await connection.execute(
            text(
                "ALTER TABLE documents "
                "ADD COLUMN IF NOT EXISTS ingestion_status VARCHAR(32)"
            )
        )
        await connection.execute(
            text(
                "ALTER TABLE documents "
                "ADD COLUMN IF NOT EXISTS ingestion_error TEXT"
            )
        )
        await connection.execute(
            text(
                "ALTER TABLE documents "
                "ADD COLUMN IF NOT EXISTS qdrant_point_ids JSONB NOT NULL DEFAULT '[]'::jsonb"
            )
        )
        await connection.execute(
            text("ALTER TABLE images ADD COLUMN IF NOT EXISTS image_data BYTEA")
        )
        await connection.execute(
            text(
                "ALTER TABLE message_citations "
                "ADD COLUMN IF NOT EXISTS file_name VARCHAR(512)"
            )
        )
        await connection.execute(
            text(
                "ALTER TABLE message_citations "
                "ADD COLUMN IF NOT EXISTS content TEXT"
            )
        )
        # FK columns do not get indexes automatically in Postgres — the chat
        # history lookup and the persist-side join must be index scans.
        await connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_messages_chat_history_id "
                "ON messages (chat_history_id)"
            )
        )
        await connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_message_citations_message_id "
                "ON message_citations (message_id)"
            )
        )

    await _migrate_images_to_bytea()


async def _migrate_images_to_bytea() -> None:
    """Convert legacy images.image_base64 (TEXT) rows to image_data (BYTEA).

    Existing base64 payloads are decoded, resized to max 1024px and
    re-encoded as JPEG via the same processor the worker uses; then the old
    text column is dropped. Idempotent: a no-op once image_base64 is gone.
    """
    from sqlalchemy import select, update

    from .models import DocumentImage

    async with engine.begin() as connection:
        has_old_column = await connection.scalar(
            text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = 'images' AND column_name = 'image_base64'"
            )
        )
        if not has_old_column:
            return

        rows = await connection.execute(
            text(
                "SELECT document_id, image_id, image_base64 FROM images "
                "WHERE image_data IS NULL"
            )
        )
        legacy = rows.fetchall()
        if legacy:
            from .ingestion.image_repository import process_base64_image

            cache: dict[str, bytes] = {}
            for document_id, image_id, base64_payload in legacy:
                data = cache.get(base64_payload)
                if data is None:
                    data = process_base64_image(base64_payload)
                    cache[base64_payload] = data
                await connection.execute(
                    update(DocumentImage)
                    .where(
                        DocumentImage.document_id == document_id,
                        DocumentImage.image_id == image_id,
                    )
                    .values(image_data=data)
                )

        await connection.execute(text("ALTER TABLE images DROP COLUMN image_base64"))
