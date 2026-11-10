"""Ingestion orchestration: extraction -> PII -> embeddings -> Qdrant -> DB.

The Celery task (tasks.py) runs this coroutine via asyncio.run, so every task
gets its own event loop, SQLAlchemy engine and Redis client.
"""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path

import aiofiles
import aiofiles.os
import httpx
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .. import aws, events
from ..config import settings
from ..document_decryption import (
    download_encrypted_package,
    verify_and_decrypt_document,
)
from ..models import Document
from .content import extract_content, render_page_base64
from .embeddings import build_embedding_model
from .image_pipeline import build_image_chain, is_relevant_result, process_all, upload_image_chunks
from .image_repository import replace_document_images
from .pii import detect_pii_batch  # noqa: F401  (re-exported for tests)
from .qdrant_store import QdrantStore
from .text_pipeline import upload_table_chunks, upload_text_chunks

logger = logging.getLogger(__name__)


async def _resolve_pdf(document_id: str, user_id: str, s3_bucket: str, s3_prefix: str) -> tuple[Path, tempfile.TemporaryDirectory | None]:
    """Prefer the stored local original; fall back to decrypting the S3 package."""
    local_pdf = settings.originals_dir / f"{document_id}.pdf"
    if local_pdf.is_file():
        return local_pdf, None

    logger.info(
        "Local original missing for %s; decrypting from S3 package", document_id
    )
    await aws.init_aws()
    temporary_directory = tempfile.TemporaryDirectory(prefix="medilens-ingest-")
    temporary_path = Path(temporary_directory.name)
    package = await download_encrypted_package(
        bucket=s3_bucket,
        prefix=s3_prefix,
        output_directory=temporary_path,
    )
    pdf_path = temporary_path / "document.pdf"
    await verify_and_decrypt_document(
        package=package,
        output_path=pdf_path,
        user_id=user_id,
        document_id=document_id,
    )
    return pdf_path, temporary_directory


async def run_ingestion(document_id: str, user_id: str) -> str | None:
    """Process one secured document and mark it INDEXED (or ERROR).

    Returns the final status string for the Celery result backend.
    """
    import logfire

    with logfire.span(
        "ingest_document",
        _span_name="ingest_document",
        document_id=document_id,
        user_id=user_id,
    ) as span:
        status = await _run_ingestion_inner(document_id, user_id)
        span.set_attribute("ingestion_result", status or "unknown")
        return status


async def _run_ingestion_inner(document_id: str, user_id: str) -> str | None:
    import logfire

    # Task-local engine/session factory: never reuse the FastAPI process pool
    # across event loops.
    engine = create_async_engine(
        settings.async_database_url,
        connect_args=settings.async_database_connect_args,
        pool_pre_ping=True,
    )
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    store = QdrantStore()
    aws_initialized = False
    temp_directory: tempfile.TemporaryDirectory | None = None
    point_ids: list[str] = []

    try:
        async with session_factory() as session:
            doc = await session.get(Document, document_id)
            if doc is None or str(doc.user_id) != user_id:
                logger.info(
                    "Document %s no longer exists; skipping ingestion", document_id
                )
                # Terminal event so any waiting SSE stream closes cleanly.
                await events.publish_document_event(
                    user_id, document_id, "DELETED", is_ready=False,
                    client=events.create_task_redis(),
                )
                return "SKIPPED"
            doc.ingestion_status = "PROCESSING"
            doc.ingestion_error = None
            await session.commit()

        await events.publish_document_event(
            user_id, document_id, "PROCESSING", client=events.create_task_redis()
        )

        pdf_path, temp_directory = await _resolve_pdf(
            document_id, user_id, doc.s3_bucket, doc.s3_prefix
        )
        aws_initialized = aws.kms is not None

        tables, texts, images = await extract_content(pdf_path)
        logger.info(
            "Extracted %s tables / %s texts / %s images from %s",
            len(tables), len(texts), len(images), document_id,
        )
        # Full extraction trace: exactly what unstructured produced.
        logfire.info(
            "unstructured extraction results",
            document_id=document_id,
            tables=[{**item, "text": item["text"][:300]} for item in tables],
            texts=[{**item, "text": item["text"][:300], "coordinates_count": len(item.get("coordinates") or [])} for item in texts],
            images=[{key: item.get(key) for key in ("image_id", "page_number", "file_name")} for item in images],
        )

        chain = build_image_chain()
        # All image LLM calls run once, in parallel (notebook process_all).
        analysis_results = await process_all(chain, images)

        # Trace every raw LLM decision so nothing about image handling is opaque.
        for image_item, result in zip(images, analysis_results):
            logfire.info(
                "image LLM analysis result",
                document_id=document_id,
                image_id=image_item.get("image_id"),
                page_number=image_item.get("page_number"),
                classification=result.get("classification"),
                image_type=result.get("image_type"),
                summary=result.get("summary"),
                selected_for_indexing=is_relevant_result(result),
            )

        embedding_model = build_embedding_model()
        await store.ensure_collection()

        async with httpx.AsyncClient(timeout=settings.pii_api_timeout_seconds) as pii_client, \
                httpx.AsyncClient(timeout=180) as clip_client:
            table_ids = await upload_table_chunks(
                tables,
                store=store,
                embedding_model=embedding_model,
                pii_client=pii_client,
                doc_id=document_id,
                user_id=user_id,
            )
            text_ids = await upload_text_chunks(
                texts,
                store=store,
                embedding_model=embedding_model,
                pii_client=pii_client,
                doc_id=document_id,
                user_id=user_id,
            )
            image_ids, selected_images = await upload_image_chunks(
                images,
                analysis_results,
                store=store,
                embedding_model=embedding_model,
                clip_client=clip_client,
                doc_id=document_id,
                user_id=user_id,
            )

        point_ids = [*table_ids, *text_ids, *image_ids]

        # HANDWRITING rows store the base64 of the WHOLE rendered page instead
        # of the cropped element, so the handwritten note is always shown with
        # its full page context. All handwriting rows on one page share the
        # same rendered page (rendered once per page number).
        handwriting_rows = [
            image for image in selected_images if image.get("image_type") == "HANDWRITING"
        ]
        handwriting_page_numbers = {
            image.get("page_number") for image in handwriting_rows
        } - {None}
        page_base64_map: dict[int, str] = {}
        for page_number in sorted(handwriting_page_numbers):
            page_b64 = await render_page_base64(pdf_path, page_number)
            if page_b64:
                page_base64_map[page_number] = page_b64
            else:
                logger.warning(
                    "Could not render page %s of %s; handwriting row keeps the cropped base64",
                    page_number, document_id,
                )
        for image in handwriting_rows:
            page_b64 = page_base64_map.get(image.get("page_number"))
            if page_b64:
                image["image_base64_for_db"] = page_b64

        logfire.info(
            "handwriting whole-page base64 prepared",
            document_id=document_id,
            handwriting_rows=len(handwriting_rows),
            rendered_pages=sorted(page_base64_map),
        )

        logfire.info(
            "ingestion batches complete",
            document_id=document_id,
            table_points=len(table_ids),
            text_points=len(text_ids),
            image_points=len(image_ids),
            relevant_images_stored=len(selected_images),
            qdrant_point_ids=point_ids,
        )

        async with session_factory() as session:
            doc = await session.get(Document, document_id)
            if doc is None:
                # Deleted while processing: roll the index back to a clean state.
                await store.delete_points(point_ids)
                logger.info("Document %s deleted during ingestion; cleaned Qdrant", document_id)
                await events.publish_document_event(
                    user_id, document_id, "DELETED", is_ready=False,
                    client=events.create_task_redis(),
                )
                return "SKIPPED"

            await replace_document_images(
                session,
                document_id=document_id,
                user_id=doc.user_id,
                images=selected_images,
            )
            doc.is_ready = True
            doc.ingestion_status = "INDEXED"
            doc.ingestion_error = None
            doc.qdrant_point_ids = point_ids
            await session.commit()

        await events.publish_document_event(
            user_id,
            document_id,
            "INDEXED",
            is_ready=True,
            client=events.create_task_redis(),
        )
        logger.info(
            "Document %s indexed with %s Qdrant points", document_id, len(point_ids)
        )
        return "INDEXED"

    except Exception as exc:
        logger.exception("Ingestion failed for document %s", document_id)

        # Best-effort rollback of partially written Qdrant points.
        try:
            if point_ids:
                await store.delete_points(point_ids)
            else:
                await store.delete_document_points(user_id, document_id)
        except Exception:
            logger.exception(
                "Qdrant cleanup failed for document %s", document_id
            )

        try:
            async with session_factory() as session:
                doc = await session.get(Document, document_id)
                if doc is not None:
                    doc.is_ready = False
                    doc.ingestion_status = "ERROR"
                    doc.ingestion_error = str(exc) or exc.__class__.__name__
                    doc.qdrant_point_ids = []
                    await session.commit()
            await events.publish_document_event(
                user_id,
                document_id,
                "ERROR",
                is_ready=False,
                error=str(exc) or exc.__class__.__name__,
                client=events.create_task_redis(),
            )
        except Exception:
            logger.exception("Could not persist the ingestion error for %s", document_id)

        return "ERROR"

    finally:
        # The worker is done with the stored original now; remove it (the
        # encrypted copy always remains in S3 as the source of truth).
        try:
            local_original = settings.originals_dir / f"{document_id}.pdf"
            if await aiofiles.os.path.exists(local_original):
                await aiofiles.os.remove(local_original)
        except Exception:
            logger.exception("Could not remove the processed original for %s", document_id)

        if temp_directory is not None:
            temp_directory.cleanup()
        if aws_initialized:
            try:
                await aws.close_aws()
            except Exception:
                pass
        try:
            await store.close()
        except Exception:
            pass
        await engine.dispose()
