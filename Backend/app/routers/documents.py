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
import uuid
from pathlib import Path

import aiofiles
import aiofiles.os
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse
from starlette.datastructures import UploadFile as StarletteUploadFile

from .. import jobs
from ..config import ALLOWED_FILENAME_EXTENSIONS, ALLOWED_MIME_TYPES, settings
from ..database import get_db
from ..dependencies import get_current_user
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


def _sniffed_mime(chunk: bytes) -> str | None:
    for prefix, mime_type in MAGIC_PREFIXES:
        if chunk.startswith(prefix):
            return mime_type
    return None


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
        stored_extension = ALLOWED_MIME_TYPES[content_type]

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

        # The stored original is kept forever under its document id.
        document_id = generate_document_id()
        stored_path = settings.originals_dir / f"{document_id}.{stored_extension}"
        try:
            await aiofiles.os.rename(temp_path, stored_path)
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
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Remove a document: its DB row and the three S3 package objects."""
    validate_identifiers(user.id.hex, document_id)

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

    # Best-effort S3 cleanup; the DB row is removed regardless.
    try:
        from .. import aws

        if aws.s3 is not None:
            bucket = await aws.s3.Bucket(row.s3_bucket)
            for suffix in ("ciphertext.bin", "signature.bin", "manifest.json"):
                await bucket.delete_objects(
                    Delete={"Objects": [{"Key": f"{row.s3_prefix}/{suffix}"}], "Quiet": True}
                )
    except Exception:
        logger.exception("S3 cleanup failed for document %s", document_id)

    await db.delete(row)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{document_id}/events")
async def document_events(
    document_id: str,
    user: User = Depends(get_current_user),
) -> EventSourceResponse:
    """SSE stream of one document's processing status.

    Buffered events are replayed first (so a client connecting after
    UPLOADED still sees it), then live events are streamed until a terminal
    READY/ERROR event closes the stream.
    """
    job = jobs.get_job(document_id)
    if job is None or job.user_uuid != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Unknown document upload"
        )

    async def event_stream():
        # Snapshot the buffer and register the subscriber queue without an
        # await in between, so no event can be missed or duplicated.
        replayed = list(job.events)
        queue: asyncio.Queue[dict[str, object]] | None = None
        if not job.done:
            queue = asyncio.Queue()
            job.queues.add(queue)
        try:
            for event in replayed:
                yield {
                    "event": str(event["status"]),
                    "data": json.dumps(event),
                }
            if job.done:
                return
            assert queue is not None
            while True:
                event = await queue.get()
                yield {
                    "event": str(event["status"]),
                    "data": json.dumps(event),
                }
                if event["status"] in jobs.TERMINAL_STATUSES:
                    return
        finally:
            if queue is not None:
                job.queues.discard(queue)

    return EventSourceResponse(event_stream())
