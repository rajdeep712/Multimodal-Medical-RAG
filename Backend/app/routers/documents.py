"""Document upload endpoints.

POST /api/documents/upload     multipart field "file" -> 201 + DocumentUploadResponse
POST /api/documents/duplicates {sha256} -> DuplicateCheckResponse
GET  /api/documents/{document_id}/events  -> per-document SSE status stream

The upload endpoint reads the multipart body manually (via request.form())
instead of declaring an UploadFile parameter, so FastAPI resolves the auth
dependency BEFORE any file byte is read from the request. Multiple files can
upload concurrently; each gets its own pipeline task and SSE stream.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import tempfile
import uuid
from pathlib import Path
from urllib.parse import quote

import aiofiles
import aiofiles.os
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile as StarletteUploadFile

from .. import events, jobs
from ..config import ALLOWED_FILENAME_EXTENSIONS, ALLOWED_MIME_TYPES, settings
from ..database import get_db
from ..dependencies import get_current_user
from ..document_conversion import ImageConversionError, convert_image_to_pdf
from ..document_decryption import (
    DocumentRequestCancelled,
    SecurityError,
    download_encrypted_package,
    verify_and_decrypt_document,
)
from ..models import Document, User
from ..protection import generate_document_id, validate_identifiers
from ..schemas import (
    DocumentResponse,
    DocumentUploadResponse,
    DuplicateCheckRequest,
    DuplicateCheckResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()

CHUNK_SIZE = 1024 * 1024

## Multipart framing adds a bit of overhead on top of the file bytes, so allow
## some slack when rejecting early on Content-Length.
CONTENT_LENGTH_SLACK = 64 * 1024

## Magic bytes of the allowed file types, used to verify the actual content.
MAGIC_PREFIXES: tuple[tuple[bytes, str], ...] = (
    (b"%PDF", "application/pdf"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
)


async def _silent_remove(path: Path) -> None:
    try:
        await aiofiles.os.remove(path)
    except Exception:
        pass


async def _remove_if_present(path: Path) -> None:
    try:
        await aiofiles.os.remove(path)
    except FileNotFoundError:
        pass


def _sniffed_mime(chunk: bytes) -> str | None:
    for prefix, mime_type in MAGIC_PREFIXES:
        if chunk.startswith(prefix):
            return mime_type
    return None


def _safe_pdf_filename(original_filename: str, document_id: str) -> str:
    stem = Path(original_filename or "").stem
    stem = re.sub(r"[^A-Za-z0-9._ -]+", "_", stem).strip(" .")
    return f"{stem or document_id}.pdf"


@router.post("/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentUploadResponse:
    """Receive one document, store it, and kick off encryption in the background.

    The frontend uploads each dropped file as its own request (concurrently),
    tracks upload progress client-side, then subscribes to
    GET /documents/{document_id}/events for the UPLOADED -> ENCRYPTING ->
    PREPARING -> READY stream.
    """
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            declared_size = int(content_length)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Content-Length header"
            ) from None
        if declared_size > settings.max_upload_bytes + CONTENT_LENGTH_SLACK:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File exceeds the {settings.max_upload_bytes // (1024 * 1024)} MB limit",
            )

    form = await request.form()
    upload = form.get("file")
    if not isinstance(upload, StarletteUploadFile):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide the document in the multipart 'file' field",
        )
    try:
        temp_path: Path | None = None
        original_filename = Path(upload.filename or "").name
        if not original_filename:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="The uploaded file has no name",
            )

        extension = Path(original_filename).suffix.lower()
        content_type = (upload.content_type or "").lower().split(";", 1)[0].strip()

        if content_type not in ALLOWED_MIME_TYPES or extension not in ALLOWED_FILENAME_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Only PDF, PNG and JPEG documents can be uploaded",
            )

        # Stream the body to a temporary file while hashing it, enforcing the
        # size cap and sniffing the magic bytes of the first chunk.
        temp_path = settings.originals_dir / f"{uuid.uuid4().hex}.part"
        sha256 = hashlib.sha256()
        total_size = 0
        first_chunk = True
        try:
            async with aiofiles.open(temp_path, "wb") as target:
                while True:
                    chunk = await upload.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    total_size += len(chunk)
                    if total_size > settings.max_upload_bytes:
                        raise HTTPException(
                            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail=(
                                f"File exceeds the "
                                f"{settings.max_upload_bytes // (1024 * 1024)} MB limit"
                            ),
                        )
                    if first_chunk:
                        if _sniffed_mime(chunk) != content_type:
                            raise HTTPException(
                                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                                detail="File content does not match an allowed type (PDF, PNG or JPEG)",
                            )
                        first_chunk = False
                    sha256.update(chunk)
                    await target.write(chunk)
        finally:
            await upload.close()

        if total_size == 0:
            await _silent_remove(temp_path)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="The uploaded file is empty"
            )

        file_sha256 = sha256.hexdigest()

        # Reject documents whose content this user has already stored.
        existing_document_id = await db.scalar(
            select(Document.document_id).where(
                Document.user_id == user.id,
                Document.file_sha256 == file_sha256,
            )
        )
        if existing_document_id is not None:
            await _silent_remove(temp_path)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "A document with identical content was already uploaded "
                    f"(document_id {existing_document_id})"
                ),
                headers={"X-Existing-Document-Id": str(existing_document_id)},
            )

        # Reserve a display name, suffixing duplicates with (1), (2), ...
        display_filename = await jobs.reserve_filename(user.id, original_filename)
        if display_filename is None:
            await _silent_remove(temp_path)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Too many documents already use this file name",
            )

        # The canonical stored original is always a PDF under its document id.
        document_id = generate_document_id()
        stored_path = settings.originals_dir / f"{document_id}.pdf"
        try:
            if content_type == "application/pdf":
                await aiofiles.os.rename(temp_path, stored_path)
            else:
                await run_in_threadpool(
                    convert_image_to_pdf,
                    temp_path,
                    stored_path,
                    content_type,
                )
                await _silent_remove(temp_path)
        except ImageConversionError as exc:
            jobs.release_filename(user.id, display_filename)
            await _silent_remove(temp_path)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(exc),
            ) from exc
        except Exception:
            jobs.release_filename(user.id, display_filename)
            await _silent_remove(temp_path)
            raise

        job = jobs.DocumentJob(
            document_id=document_id,
            user_uuid=user.id,
            original_filename=display_filename,
            file_sha256=file_sha256,
            size=total_size,
            mime_type=content_type,
        )
        job.emit(
            jobs.STATUS_UPLOADED,
            original_filename=display_filename,
            size=total_size,
            mime_type=content_type,
            sha256=file_sha256,
        )
        await jobs.register_job(job)
        jobs.spawn_pipeline(job, input_path=stored_path)

        return DocumentUploadResponse(
            document_id=document_id,
            original_filename=display_filename,
            size=total_size,
            mime_type=content_type,
            sha256=file_sha256,
        )
    except HTTPException:
        # Rejecting mid-stream (or any later validation) can leave the temp
        # file behind; every success path has already moved/removed it, and
        # _silent_remove ignores missing files.
        if temp_path is not None:
            await _silent_remove(temp_path)
        raise
    except Exception as exc:
        logger.exception("Document upload failed")
        if temp_path is not None:
            await _silent_remove(temp_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to store the uploaded document",
        ) from exc


@router.post("/duplicates", response_model=DuplicateCheckResponse)
async def check_duplicate(
    payload: DuplicateCheckRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DuplicateCheckResponse:
    """Let the frontend skip an upload entirely when the hash is already known.

    The client computes the file's SHA-256 (e.g. via SubtleCrypto) before
    uploading; the server-side check in /upload remains authoritative.
    """
    document_id = await db.scalar(
        select(Document.document_id).where(
            Document.user_id == user.id,
            Document.file_sha256 == payload.sha256.lower(),
        )
    )
    return DuplicateCheckResponse(
        exists=document_id is not None,
        document_id=document_id,
    )


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[DocumentResponse]:
    """List the current user's uploaded documents, newest first."""
    rows = await db.scalars(
        select(Document)
        .where(Document.user_id == user.id)
        .order_by(Document.created_at.desc())
    )
    return [
        DocumentResponse(
            document_id=row.document_id,
            original_filename=row.original_filename,
            mime_type=row.mime_type,
            size=row.original_size,
            s3_bucket=row.s3_bucket,
            s3_prefix=row.s3_prefix,
            is_ready=row.is_ready,
            ingestion_status=row.ingestion_status,
            ingestion_error=row.ingestion_error,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.get("/{document_id}/content")
async def get_document_content(
    document_id: str,
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Verify, decrypt and stream one document's canonical PDF."""
    try:
        validate_identifiers(str(user.id), document_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Unknown document"
        ) from None

    row = await db.scalar(
        select(Document).where(
            Document.document_id == document_id,
            Document.user_id == user.id,
        )
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Unknown document"
        )

    temporary_directory = tempfile.TemporaryDirectory(prefix="medilens-content-")
    temporary_path = Path(temporary_directory.name)
    pdf_path = temporary_path / "document.pdf"

    def cleanup() -> None:
        temporary_directory.cleanup()

    try:
        package = await download_encrypted_package(
            bucket=row.s3_bucket,
            prefix=row.s3_prefix,
            output_directory=temporary_path,
            is_disconnected=request.is_disconnected,
        )
        await verify_and_decrypt_document(
            package=package,
            output_path=pdf_path,
            user_id=str(user.id),
            document_id=document_id,
            is_disconnected=request.is_disconnected,
        )

        filename = _safe_pdf_filename(row.original_filename, document_id)
        headers = {
            "Content-Disposition": (
                f"inline; filename=\"{filename}\"; "
                f"filename*=UTF-8''{quote(filename)}"
            ),
            "Content-Length": str(pdf_path.stat().st_size),
            "Cache-Control": "private, no-store",
            "Pragma": "no-cache",
            "X-Content-Type-Options": "nosniff",
        }

        async def stream_pdf():
            try:
                async with aiofiles.open(pdf_path, "rb") as source:
                    while True:
                        if await request.is_disconnected():
                            break
                        chunk = await source.read(CHUNK_SIZE)
                        if not chunk:
                            break
                        yield chunk
            finally:
                cleanup()

        content_response = StreamingResponse(
            stream_pdf(),
            media_type="application/pdf",
            headers=headers,
        )
        content_response.headers.raw.extend(response.headers.raw)
        return content_response
    except DocumentRequestCancelled:
        cleanup()
        raise HTTPException(status_code=499, detail="Client disconnected") from None
    except SecurityError as exc:
        cleanup()
        logger.warning("Document integrity check failed for %s: %s", document_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Document integrity verification failed",
        ) from exc
    except HTTPException:
        cleanup()
        raise
    except Exception as exc:
        cleanup()
        logger.exception("Document content retrieval failed for %s", document_id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to load the document from secure storage",
        ) from exc


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: str,
    response: Response,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Remove a document's local files, S3 package, and DB row.

    Cleanup must succeed before the database row is removed. If storage cleanup
    fails, the row remains so the client can retry the deletion.
    """
    try:
        validate_identifiers(user.id.hex, document_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Unknown document"
        ) from None

    row = await db.scalar(
        select(Document).where(
            Document.document_id == document_id,
            Document.user_id == user.id,
        )
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Unknown document"
        )

    from .. import aws

    if aws.s3 is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Document storage is not available right now",
        )

    try:
        await _remove_if_present(settings.originals_dir / f"{document_id}.pdf")
        await _remove_if_present(settings.encrypted_dir / f"{document_id}.ciphertext")
    except Exception as exc:
        logger.exception("Local file cleanup failed for document %s", document_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not remove the stored document files",
        ) from exc

    try:
        bucket = await aws.s3.Bucket(row.s3_bucket)
        delete_response = await bucket.delete_objects(
            Delete={
                "Objects": [
                    {"Key": f"{row.s3_prefix}/{suffix}"}
                    for suffix in ("ciphertext.bin", "signature.bin", "manifest.json")
                ],
                "Quiet": False,
            }
        )
    except Exception as exc:
        logger.exception("S3 cleanup failed for document %s", document_id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not remove the encrypted document from storage",
        ) from exc

    delete_errors = delete_response.get("Errors") or []
    if delete_errors:
        logger.error(
            "S3 reported deletion errors for document %s: %s",
            document_id,
            [
                {
                    "key": item.get("Key"),
                    "code": item.get("Code"),
                    "message": item.get("Message"),
                }
                for item in delete_errors
            ],
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not remove the encrypted document from storage",
        )

    # Stop an in-flight indexing task, then remove the Qdrant points. Legacy
    # documents (never indexed) have no points and no task to revoke.
    try:
        from ..celery_app import celery_app

        celery_app.control.revoke(document_id)
    except Exception:
        logger.warning("Could not revoke ingestion task for %s", document_id)

    # Capture the in-memory job before the row disappears so its SSE
    # subscribers can be terminated with a terminal event.
    job = jobs.get_job(document_id)

    indexed_or_partial = row.qdrant_point_ids or row.ingestion_status in {
        jobs.STATUS_PROCESSING,
        jobs.STATUS_INDEXED,
    }
    if indexed_or_partial:
        try:
            from ..ingestion.qdrant_store import QdrantStore

            store = QdrantStore()
            try:
                await store.delete_points(list(row.qdrant_point_ids or []))
                await store.delete_document_points(str(user.id), document_id)
            finally:
                await store.close()
        except Exception as exc:
            logger.exception("Qdrant cleanup failed for document %s", document_id)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not remove the document from the search index",
            ) from exc

    await db.delete(row)
    await db.commit()
    response.status_code = status.HTTP_204_NO_CONTENT

    # Terminal event: closes any open per-document SSE stream and lets the
    # global stream remove the document from other views. Without this the
    # modal spinner would spin forever after a delete during processing.
    if job is not None and job.user_uuid == user.id:
        await job.emit_and_publish(jobs.STATUS_DELETED, is_ready=False)
    else:
        try:
            await events.publish_document_event(
                str(user.id), document_id, jobs.STATUS_DELETED, is_ready=False
            )
        except Exception:
            logger.warning("Could not publish DELETED event for %s", document_id)

    return response


@router.get("/events")
async def user_document_events(
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
) -> EventSourceResponse:
    """User-wide SSE stream of every document status change.

    The dropdown subscribes here once; events published by the upload
    pipelines and the Celery ingestion worker (via Redis) update each visible
    document in place. Stays open until the client disconnects.
    """

    async def event_stream():
        try:
            async for event in events.subscribe_user_events(str(user.id)):
                if await request.is_disconnected():
                    return
                yield {
                    "event": str(event.get("status", "ERROR")),
                    "data": json.dumps(event),
                }
        except asyncio.CancelledError:
            # Client disconnected; uvicorn cancels the handler task.
            return

    event_response = EventSourceResponse(event_stream())
    event_response.headers.raw.extend(response.headers.raw)
    return event_response


@router.get("/{document_id}/events")
async def document_events(
    document_id: str,
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventSourceResponse:
    """SSE stream of one document's processing status.

    Combines three sources: the in-memory job buffer (upload phase replay),
    a live queue on that job, and Redis events from the ingestion worker. If
    no job exists (server restart or an older document), the current DB state
    is sent as a snapshot and live Redis events follow. The stream closes on
    INDEXED or ERROR.
    """
    try:
        validate_identifiers(str(user.id), document_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Unknown document"
        ) from None

    job = jobs.get_job(document_id)
    row = await db.scalar(
        select(Document).where(
            Document.document_id == document_id,
            Document.user_id == user.id,
        )
    )
    if job is None and row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Unknown document upload"
        )
    if job is not None and job.user_uuid != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Unknown document upload"
        )

    async def event_stream():
        # Snapshot the buffer and register the subscriber queue without an
        # await in between, so no event can be missed or duplicated.
        replayed: list[dict[str, object]] = []
        job_queue: asyncio.Queue[dict[str, object]] | None = None
        if job is not None:
            replayed = list(job.events)
            if not job.done:
                job_queue = asyncio.Queue()
                job.queues.add(job_queue)

        merged: asyncio.Queue[dict[str, object]] = asyncio.Queue()

        async def drain_job_queue() -> None:
            if job_queue is None:
                return
            try:
                while True:
                    merged.put_nowait(await job_queue.get())
            except asyncio.CancelledError:
                raise

        async def drain_redis() -> None:
            try:
                async for event in events.subscribe_user_events(str(user.id)):
                    if event.get("document_id") == document_id:
                        merged.put_nowait(event)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Redis subscription failed for %s", document_id)

        pump_tasks: list[asyncio.Task] = [
            asyncio.create_task(drain_redis())
        ]
        if job_queue is not None:
            pump_tasks.append(asyncio.create_task(drain_job_queue()))

        try:
            for event in replayed:
                if await request.is_disconnected():
                    return
                yield {
                    "event": str(event["status"]),
                    "data": json.dumps(event),
                }

            if job is None and row is not None:
                # No in-memory job (restart or legacy row): send the stored
                # state as the first event, then follow live Redis events.
                snapshot_status = row.ingestion_status or (
                    jobs.STATUS_INDEXED if row.is_ready else jobs.STATUS_SECURED
                )
                snapshot = {
                    "document_id": document_id,
                    "status": snapshot_status,
                    "is_ready": row.is_ready,
                }
                if row.ingestion_error:
                    snapshot["error"] = row.ingestion_error
                if await request.is_disconnected():
                    return
                yield {
                    "event": snapshot_status,
                    "data": json.dumps(snapshot),
                }
                if snapshot_status in jobs.TERMINAL_STATUSES:
                    return

            if job is not None and job.done:
                return

            while True:
                event = await merged.get()
                if await request.is_disconnected():
                    return
                yield {
                    "event": str(event.get("status", jobs.STATUS_ERROR)),
                    "data": json.dumps(event),
                }
                if event.get("status") in jobs.TERMINAL_STATUSES:
                    return
        except asyncio.CancelledError:
            return
        finally:
            if job_queue is not None and job is not None:
                job.queues.discard(job_queue)
            for task in pump_tasks:
                task.cancel()
            # Absorb the cancellations so nothing surfaces as an error.
            await asyncio.gather(*pump_tasks, return_exceptions=True)

    event_response = EventSourceResponse(event_stream())
    event_response.headers.raw.extend(response.headers.raw)
    return event_response
