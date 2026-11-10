"""Per-document processing jobs and their SSE event streams.

Each uploaded document gets a DocumentJob that buffers every status event
(UPLOADED -> ENCRYPTING -> PREPARING -> SECURED -> PROCESSING -> INDEXED or
ERROR) so an SSE subscriber can connect after the first events were emitted
and still replay them. The encrypt/S3 upload pipeline runs as a detached
asyncio task; uploads never wait on it. Once the document is SECURED in
PostgreSQL and S3, the indexing stage is handed to a Celery worker, whose
events arrive through the Redis pub/sub bus (events.py).
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from pathlib import Path
from typing import Any

import aiofiles
import aiofiles.os
import logfire
from sqlalchemy import select

from . import events
from .config import settings
from .database import SessionLocal
from .models import Document
from .protection import prepare_document, upload_document

logger = logging.getLogger(__name__)

JOB_TTL_SECONDS = 30 * 60
MAX_FILENAME_SUFFIX_ATTEMPTS = 1000

STATUS_UPLOADED = "UPLOADED"
STATUS_ENCRYPTING = "ENCRYPTING"
STATUS_PREPARING = "PREPARING"
STATUS_SECURED = "SECURED"
STATUS_PROCESSING = "PROCESSING"
STATUS_INDEXED = "INDEXED"
STATUS_ERROR = "ERROR"
STATUS_DELETED = "DELETED"

TERMINAL_STATUSES = {STATUS_INDEXED, STATUS_ERROR, STATUS_DELETED}


class DocumentJob:
    """Tracks one document's pipeline and broadcasts its status events."""

    def __init__(
        self,
        *,
        document_id: str,
        user_uuid: uuid.UUID,
        original_filename: str,
        file_sha256: str,
        size: int,
        mime_type: str,
    ) -> None:
        self.document_id = document_id
        self.user_uuid = user_uuid
        self.original_filename = original_filename
        self.file_sha256 = file_sha256
        self.size = size
        self.mime_type = mime_type
        self.events: list[dict[str, Any]] = []
        self.queues: set[asyncio.Queue[dict[str, Any]]] = set()
        self.done = False

    def emit(self, status: str, **data: Any) -> None:
        event = {"document_id": self.document_id, "status": status, **data}
        self.events.append(event)
        if status in TERMINAL_STATUSES:
            self.done = True
        for queue in self.queues:
            queue.put_nowait(event)

    async def emit_and_publish(self, status: str, **data: Any) -> None:
        """Emit to direct SSE subscribers and publish for Redis subscribers."""
        self.emit(status, **data)
        try:
            await events.publish_document_event(
                str(self.user_uuid),
                self.document_id,
                status,
                client=events.get_events_redis(),
                **data,
            )
        except Exception:
            logger.warning(
                "Could not publish %s event for %s to Redis", status, self.document_id
            )


## document_id -> job. Single uvicorn worker assumed; a multi-worker deploy
## would need this registry (and the SSE fan-out) in Redis instead.
_registry: dict[str, DocumentJob] = {}

## Display filenames currently reserved by in-flight uploads, per user, so two
## concurrently dropped files with the same name both get a unique name.
_inflight_filenames: dict[uuid.UUID, set[str]] = {}

_registry_lock = asyncio.Lock()

## Strong references so spawned pipeline tasks are never garbage collected.
_background_tasks: set[asyncio.Task[None]] = set()


async def register_job(job: DocumentJob) -> None:
    async with _registry_lock:
        _registry[job.document_id] = job


def get_job(document_id: str) -> DocumentJob | None:
    return _registry.get(document_id)


async def _remove_job_later(document_id: str) -> None:
    await asyncio.sleep(JOB_TTL_SECONDS)
    async with _registry_lock:
        _registry.pop(document_id, None)


async def _filename_exists_in_db(user_uuid: uuid.UUID, filename: str) -> bool:
    async with SessionLocal() as session:
        existing = await session.scalar(
            select(Document.document_id).where(
                Document.user_id == user_uuid,
                Document.original_filename == filename,
            )
        )
        return existing is not None


async def reserve_filename(user_uuid: uuid.UUID, base_name: str) -> str | None:
    """Pick the display filename for a new upload.

    Returns the base name, or base(1).ext, base(2).ext ... skipping names that
    are already stored for this user or currently reserved by another upload.
    The returned name stays reserved until release_filename() is called.
    """
    async with _registry_lock:
        in_flight = _inflight_filenames.setdefault(user_uuid, set())
        stem = Path(base_name).stem or base_name
        suffix = Path(base_name).suffix

        candidate = base_name
        for counter in range(MAX_FILENAME_SUFFIX_ATTEMPTS):
            if counter > 0:
                candidate = f"{stem}({counter}){suffix}"
            if candidate in in_flight:
                continue
            if await _filename_exists_in_db(user_uuid, candidate):
                continue
            in_flight.add(candidate)
            return candidate
        return None


def release_filename(user_uuid: uuid.UUID, filename: str) -> None:
    reserved = _inflight_filenames.get(user_uuid)
    if reserved is not None:
        reserved.discard(filename)
        if not reserved:
            _inflight_filenames.pop(user_uuid, None)


def spawn_pipeline(
    job: DocumentJob,
    *,
    input_path: Path,
) -> asyncio.Task[None]:
    task = asyncio.create_task(
        run_document_pipeline(
            job,
            input_path=input_path,
        )
    )
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return task


async def run_document_pipeline(job: DocumentJob, *, input_path: Path) -> None:
    """Encrypt the stored original, upload the package to S3, persist the row.

    Emits ENCRYPTING -> PREPARING -> SECURED; after the SECURED commit the
    indexing stage is enqueued to Celery. On any failure emits ERROR. The
    encrypted temporary file is deleted after the S3 upload (success or
    failure); the stored original is kept until the ingestion worker finishes.
    """
    document_id = job.document_id
    user_id = str(job.user_uuid)
    encrypted_path = settings.encrypted_dir / f"{document_id}.ciphertext"

    with logfire.span(
        "upload_encrypt_pipeline",
        document_id=document_id,
        user_id=user_id,
        original_filename=job.original_filename,
        size=job.size,
        mime_type=job.mime_type,
    ):
        try:
            job.emit(STATUS_ENCRYPTING)

            prepared = await prepare_document(
                input_path=str(input_path),
                user_id=user_id,
                document_id=document_id,
                source_mime_type=job.mime_type,
                source_size=job.size,
                original_filename=job.original_filename,
            )

            job.emit(STATUS_PREPARING)

            upload_result = await upload_document(
                prepared=prepared,
                bucket=settings.medical_rag_bucket,
                user_id=user_id,
                document_id=document_id,
            )

            manifest = prepared["manifest"]
            s3_prefix = f"{settings.s3_prefix}/{user_id}/{document_id}"

            # The encrypted copy now lives in S3; remove the local temporary.
            try:
                await aiofiles.os.remove(encrypted_path)
            except FileNotFoundError:
                pass

            async with SessionLocal() as session:
                session.add(
                    Document(
                        document_id=document_id,
                        user_id=job.user_uuid,
                        s3_bucket=upload_result["bucket"],
                        s3_prefix=s3_prefix,
                        original_filename=job.original_filename,
                        mime_type=manifest["document"]["mime_type"],
                        original_size=manifest["document"]["original_size"],
                        file_sha256=job.file_sha256,
                        ciphertext_sha256=manifest["ciphertext"]["sha256"],
                        is_ready=False,
                        ingestion_status=STATUS_SECURED,
                    )
                )
                await session.commit()

            secured_payload = dict(
                original_filename=job.original_filename,
                mime_type=manifest["document"]["mime_type"],
                size=manifest["document"]["original_size"],
                stored_mime_type=manifest["document"]["stored_mime_type"],
                stored_size=manifest["document"]["stored_size"],
                s3_bucket=upload_result["bucket"],
                s3_prefix=s3_prefix,
                is_ready=False,
            )
            await job.emit_and_publish(STATUS_SECURED, **secured_payload)
            logfire.info(
                "document secured",
                document_id=document_id,
                user_id=user_id,
                s3_prefix=s3_prefix,
                stored_mime_type=secured_payload["stored_mime_type"],
                stored_size=secured_payload["stored_size"],
            )
            logger.info("Document %s secured (user %s)", document_id, user_id)

            # Hand the document to the ingestion worker. The task id equals the
            # document id so deletion can revoke an in-flight task.
            try:
                from .ingestion.tasks import ingest_document

                ingest_document.apply_async(
                    args=[document_id, user_id],
                    task_id=document_id,
                )
            except Exception as enqueue_error:
                logger.exception(
                    "Could not enqueue ingestion for %s", document_id
                )
                logfire.error(
                    "ingestion enqueue failed",
                    document_id=document_id,
                    error=str(enqueue_error) or enqueue_error.__class__.__name__,
                )
                await _mark_ingestion_error(document_id, user_id, str(enqueue_error) or enqueue_error.__class__.__name__)
                await job.emit_and_publish(
                    STATUS_ERROR,
                    is_ready=False,
                    error="Document secured, but the indexing service is unavailable",
                )

        except Exception as exc:
            logger.exception("Document pipeline failed for %s", document_id)
            logfire.error(
                "upload/encrypt pipeline failed",
                document_id=document_id,
                error=str(exc) or exc.__class__.__name__,
            )
            try:
                await aiofiles.os.remove(encrypted_path)
            except Exception:
                pass
            await job.emit_and_publish(
                STATUS_ERROR, error=str(exc) or exc.__class__.__name__
            )

        finally:
            release_filename(job.user_uuid, job.original_filename)
            asyncio.create_task(_remove_job_later(document_id))


async def _mark_ingestion_error(document_id: str, user_id: str, error: str) -> None:
    try:
        async with SessionLocal() as session:
            row = await session.get(Document, document_id)
            if row is not None:
                row.is_ready = False
                row.ingestion_status = STATUS_ERROR
                row.ingestion_error = error
                await session.commit()
    except Exception:
        logger.exception("Could not persist ingestion error for %s", document_id)
