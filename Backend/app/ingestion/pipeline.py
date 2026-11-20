"""Ingestion orchestration: extraction -> PII -> embeddings -> Qdrant -> DB.

The Celery task (tasks.py) runs this coroutine via asyncio.run, so every task
gets its own event loop, SQLAlchemy engine and Redis client.
"""

from __future__ import annotations

import asyncio
import logging
import tempfile
from pathlib import Path
from contextlib import AsyncExitStack

import aiofiles
import aiofiles.os
import httpx
from botocore.exceptions import (
    ClientError, ConnectionClosedError, ConnectTimeoutError,
    EndpointConnectionError, ReadTimeoutError,
)
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .. import aws, events
from ..config import settings
from ..document_decryption import (
    download_encrypted_package,
    verify_and_decrypt_document,
)
from ..models import Document
from .content import extract_content, render_pages_base64
from .embeddings import build_embedding_model
from .errors import TransientIngestionError
from .image_pipeline import (
    build_image_chain,
    downscale_image_base64,
    is_relevant_result,
    process_all,
    build_image_chunks,
)
from .image_repository import delete_image_keys, upload_document_images
from .pii import detect_pii_batch  # noqa: F401  (re-exported for tests)
from .qdrant_store import QdrantStore
from .text_pipeline import upload_table_chunks, upload_text_chunks

logger = logging.getLogger(__name__)

# Infrastructure failures where another attempt could plausibly succeed.
# FileNotFoundError is excluded on purpose: a missing source file is permanent.
TRANSIENT_EXCEPTIONS = (
    httpx.HTTPError,
    ConnectionError,
    TimeoutError,
    OSError,
    ClientError,
    EndpointConnectionError,
    ConnectionClosedError,
    ConnectTimeoutError,
    ReadTimeoutError,
    OperationalError,
)


async def _resolve_pdf(document_id: str, user_id: str, s3_bucket: str, s3_prefix: str) -> tuple[Path, tempfile.TemporaryDirectory | None]:
    """Prefer the stored local original; fall back to decrypting the S3 package."""
    local_pdf = settings.originals_dir / f"{document_id}.pdf"
    if local_pdf.is_file():
        return local_pdf, None

    logger.info(
        "Local original missing for %s; decrypting from S3 package", document_id
    )
    temporary_directory = tempfile.TemporaryDirectory(prefix="medilens-ingest-")
    temporary_path = Path(temporary_directory.name)
    pdf_path = temporary_path / "document.pdf"
    try:
        async with aws.task_aws_clients() as (s3_resource, kms_client):
            package = await download_encrypted_package(
                bucket=s3_bucket, prefix=s3_prefix,
                output_directory=temporary_path, s3_resource=s3_resource,
            )
            await verify_and_decrypt_document(
                package=package, output_path=pdf_path,
                user_id=user_id, document_id=document_id, kms_client=kms_client,
            )
    except BaseException:
        temporary_directory.cleanup()
        raise
    return pdf_path, temporary_directory


async def run_ingestion(
    document_id: str, user_id: str, retrying: bool = False
) -> str | None:
    """Process one secured document and mark it INDEXED (or ERROR).

    ``retrying`` is True while another Celery attempt remains: transient
    failures then raise TransientIngestionError (document stays PROCESSING,
    Celery schedules the backoff) instead of marking ERROR. Returns the final
    status string for the Celery result backend.
    """
    import logfire

    async def _traced() -> str | None:
        with logfire.span(
            "ingest_document",
            _span_name="ingest_document",
            document_id=document_id,
            user_id=user_id,
        ) as span:
            status = await _run_ingestion_inner(document_id, user_id, retrying)
            span.set_attribute("ingestion_result", status or "unknown")
            return status

    try:
        # Watchdog: a hung embedding/Qdrant/PII call must not stall this
        # document (and, with bounded worker concurrency, the queue behind
        # it) forever. Timeouts count as transient → retried → then ERROR.
        return await asyncio.wait_for(
            _traced(), timeout=settings.ingestion_timeout_seconds
        )
    except (asyncio.TimeoutError, TimeoutError) as exc:
        raise TransientIngestionError(
            f"Ingestion timed out after {settings.ingestion_timeout_seconds:.0f}s"
        ) from exc


async def _run_ingestion_inner(
    document_id: str, user_id: str, retrying: bool = False
) -> str | None:
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
    temp_directory: tempfile.TemporaryDirectory | None = None
    point_ids: list[str] = []
    task_resources = AsyncExitStack()
    image_client = None
    uploaded_image_keys: list[str] = []
    images_committed = False

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
                )
                return "SKIPPED"
            original_filename = doc.original_filename
            doc.ingestion_status = "PROCESSING"
            doc.ingestion_error = None
            await session.commit()

        await events.publish_document_event(
            user_id, document_id, "PROCESSING"
        )

        pdf_path, temp_directory = await _resolve_pdf(
            document_id, user_id, doc.s3_bucket, doc.s3_prefix
        )

        tables, texts, images = await extract_content(
            pdf_path, image_upload=doc.mime_type in {"image/png", "image/jpeg"},
        )
        for item in (*tables, *texts, *images):
            item["file_name"] = original_filename
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

        # Downscale extracted images before any network hop: the vision LLM,
        # BioMedCLIP and the DB rows all cap at ~1024-1600px anyway, so
        # shipping full-resolution base64 only adds latency.
        for image_item in images:
            image_item["base64Image"] = downscale_image_base64(
                image_item.get("base64Image") or ""
            )

        # Explicit clients bypass LangChain's process-wide default HTTP cache.
        # Each document's transports belong to its asyncio.run() event loop.
        analysis_http = await task_resources.enter_async_context(httpx.AsyncClient(timeout=180))
        embedding_http = await task_resources.enter_async_context(httpx.AsyncClient(timeout=180))
        chain = build_image_chain(http_async_client=analysis_http)
        embedding_model = build_embedding_model(http_async_client=embedding_http)
        await store.ensure_collection()

        async with httpx.AsyncClient(timeout=settings.pii_api_timeout_seconds) as pii_client, \
                httpx.AsyncClient(timeout=180) as clip_client:
            # Text/table embedding starts immediately and runs CONCURRENTLY
            # with the image LLM analysis (they share nothing but the embedding
            # client); the image upload follows analysis because it consumes
            # its results. The finally-style awaits keep the client context
            # open until every task finishes, even if analysis fails.
            table_task = asyncio.create_task(
                upload_table_chunks(
                    tables,
                    store=store,
                    embedding_model=embedding_model,
                    pii_client=pii_client,
                    doc_id=document_id,
                    user_id=user_id,
                )
            )
            text_task = asyncio.create_task(
                upload_text_chunks(
                    texts,
                    store=store,
                    embedding_model=embedding_model,
                    pii_client=pii_client,
                    doc_id=document_id,
                    user_id=user_id,
                )
            )
            try:
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

                image_points, selected_images = await build_image_chunks(
                    images,
                    analysis_results,
                    embedding_model=embedding_model,
                    clip_client=clip_client,
                    doc_id=document_id,
                    user_id=user_id,
                )
            finally:
                batch_results = await asyncio.gather(table_task, text_task, return_exceptions=True)
                for result in batch_results:
                    if isinstance(result, BaseException):
                        raise result
                table_ids, text_ids = batch_results

        image_ids = [point.id for point in image_points]
        point_ids = [*table_ids, *text_ids, *image_ids]

        # HANDWRITING objects store the WHOLE rendered page instead
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
        if handwriting_page_numbers:
            # One PyMuPDF open renders every needed page (per-page opens
            # re-parsed the whole PDF for each handwriting page).
            rendered_pages = await render_pages_base64(
                pdf_path, sorted(handwriting_page_numbers)
            )
            for page_number, page_b64 in rendered_pages.items():
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
                image["image_base64_for_storage"] = page_b64

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
            # The delete endpoint takes the same row lock. No document can be
            # deleted between the S3 upload and publishing its search points.
            doc = await session.get(Document, document_id, with_for_update=True)
            if doc is None:
                # Deleted while processing: roll the index back to a clean state.
                await store.delete_document_points(user_id, document_id)
                logger.info("Document %s deleted during ingestion; cleaned Qdrant", document_id)
                await events.publish_document_event(
                    user_id, document_id, "DELETED", is_ready=False,
                )
                return "SKIPPED"

            if selected_images:
                # Fail clearly on the placeholder before opening AWS connections.
                _ = settings.image_s3_location
                image_client = await task_resources.enter_async_context(aws.task_s3_client())
                await upload_document_images(
                    image_client, selected_images, document_id=document_id,
                    user_id=user_id, uploaded_keys=uploaded_image_keys,
                )
                images_by_id = {image["image_id"]: image for image in selected_images}
                for point in image_points:
                    image = images_by_id[point.payload["image_id"]]
                    point.payload.update({
                        "image_s3_bucket": image["image_s3_bucket"],
                        "image_s3_key": image["image_s3_key"],
                    })
                await store.upsert(image_points)
            doc.is_ready = True
            doc.ingestion_status = "INDEXED"
            doc.ingestion_error = None
            doc.qdrant_point_ids = point_ids
            await session.commit()
            images_committed = True

        try:
            await events.publish_document_event(
                user_id, document_id, "INDEXED", is_ready=True,
            )
        except Exception:
            # A notification failure must not undo committed storage/index data.
            logger.exception("Could not publish INDEXED event for %s", document_id)
        logger.info(
            "Document %s indexed with %s Qdrant points", document_id, len(point_ids)
        )
        return "INDEXED"

    except (Exception, asyncio.CancelledError) as exc:
        if images_committed:
            # Cancellation after commit (e.g. while sending the notification)
            # must not remove the index for an already-INDEXED document.
            if isinstance(exc, asyncio.CancelledError):
                raise
            logger.exception("Post-commit ingestion notification failed for %s", document_id)
            return "INDEXED"
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

        if isinstance(exc, asyncio.CancelledError):
            raise

        # Transient infrastructure failure with another Celery attempt left:
        # leave the document PROCESSING and let the task's autoretry schedule
        # the backoff. The final attempt falls through to the ERROR marking.
        is_transient = isinstance(exc, (TransientIngestionError, *TRANSIENT_EXCEPTIONS)) and not isinstance(
            exc, FileNotFoundError
        )
        if is_transient and retrying:
            logger.warning(
                "Transient ingestion failure for %s (attempt will be retried): %s",
                document_id, exc,
            )
            raise TransientIngestionError(
                str(exc) or exc.__class__.__name__
            ) from exc

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
            )
        except Exception:
            logger.exception("Could not persist the ingestion error for %s", document_id)

        return "ERROR"

    finally:
        # Also runs for cancellation/watchdog timeouts, after all PUT tasks
        # have drained. Never roll back images after the INDEXED commit.
        if image_client is not None and uploaded_image_keys and not images_committed:
            try:
                bucket, _ = settings.image_s3_location
                await delete_image_keys(image_client, bucket, uploaded_image_keys)
            except Exception:
                logger.exception("Could not clean up S3 images for %s", document_id)
        await task_resources.aclose()
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
        try:
            await store.close()
        except Exception:
            pass
        await engine.dispose()
