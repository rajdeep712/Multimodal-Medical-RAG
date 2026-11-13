"""Chat history + streaming RAG answer endpoints.

Workflow (per the approved design):

POST /api/chats                       -> stores the user message (creating the
                                         chat record on the first query) and
                                         returns {chat_id, message_id, stream_token}
GET  /api/chats/{chat_id}/stream?token=...
                                      -> SSE: chat_id (new chats only) ->
                                         delta* (answer streaming) ->
                                         citations (only the evidence the
                                         answer cited) -> done
GET  /api/chats                       -> the user's chat histories (newest first)
GET  /api/chats/{chat_id}             -> one chat with its messages + citations
PATCH /api/chats/{chat_id}            -> rename
DELETE /api/chats/{chat_id}           -> delete (cascades messages/citations)
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

import logfire

from .. import events  # noqa: F401  (kept for parity; chat SSE is direct)
from ..config import settings
from ..database import SessionLocal, get_db
from ..dependencies import get_current_user
from ..ingestion.content import render_page_base64  # noqa: F401
from ..ingestion.embeddings import build_embedding_model
from ..ingestion.pii import post_with_retry
from ..ingestion.qdrant_store import QdrantStore
from ..models import (
    ChatHistory,
    Message,
    MessageCitation,
    User,
    generate_message_id,
)
from ..retrieval import (
    embed_query_texts,
    fetch_images_base64,
    hybrid_multimodal_search,
    select_context_points,
)

logger = logging.getLogger(__name__)

router = APIRouter()

PENDING_STREAM_TTL_SECONDS = 600

# [[cite:E1]] / [[cite E1]] / [[cite:E1, E4]] — the same tolerant citation
# format the frontend markdown parser accepts.
_CITE_GROUP_RE = re.compile(r"\[\[\s*cite[:\s]+([^\]]*?)\s*\]\]", re.IGNORECASE)
_EVIDENCE_ID_RE = re.compile(r"E\d+")


def _used_evidence_ids(content: str) -> set[str]:
    """The evidence ids the answer actually cited, e.g. {'E1', 'E4'}."""
    used: set[str] = set()
    for group in _CITE_GROUP_RE.findall(content):
        for token in re.split(r"[,\s]+", group):
            token = token.strip().upper()
            if _EVIDENCE_ID_RE.fullmatch(token):
                used.add(token)
    return used

# token -> pending answer job. Single uvicorn worker assumed; SSE answers run
# in the same process that issued the token.
_pending_streams: dict[str, dict[str, Any]] = {}

# Shared httpx client for the BioMedCLIP text endpoint — a fresh client per
# query would open a new TCP connection during inference (latency critical).
_biomedclip_http_client: httpx.AsyncClient | None = None


def _get_biomedclip_http_client() -> httpx.AsyncClient:
    global _biomedclip_http_client
    if _biomedclip_http_client is None or _biomedclip_http_client.is_closed:
        _biomedclip_http_client = httpx.AsyncClient(timeout=200)
    return _biomedclip_http_client


async def close_biomedclip_http_client() -> None:
    global _biomedclip_http_client
    if _biomedclip_http_client is not None and not _biomedclip_http_client.is_closed:
        await _biomedclip_http_client.aclose()
    _biomedclip_http_client = None


# chat_id -> cancel event for an ACTIVE answer stream. The stop endpoint sets
# it; the stream generator checks it at every cancellation point.
_cancel_events: dict[str, asyncio.Event] = {}


@router.post("/{chat_id}/stop", status_code=status.HTTP_200_OK)
async def stop_chat_stream(
    chat_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Stop an in-flight answer: cancel pending retrieval or abort the LLM
    stream midway; whatever content was generated is persisted by the stream
    generator's cleanup."""
    chat = await db.scalar(
        select(ChatHistory.id).where(
            ChatHistory.id == chat_id,
            ChatHistory.user_id == user.id,
        )
    )
    if chat is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown chat")

    cancel_event = _cancel_events.pop(chat_id, None)
    if cancel_event is not None:
        cancel_event.set()
    # Best-effort: also close the SSE connection server-side by flagging the
    # stream; the generator's cancellation points handle the rest.
    return {"stopped": True}


class ChatCreateRequest(BaseModel):
    query: str = Field(min_length=1, max_length=8000)
    chat_id: str | None = None
    doc_ids: list[str] | None = None
    ingestion_from: datetime | None = None
    ingestion_to: datetime | None = None


class ChatRenameRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)


def _prune_pending() -> None:
    now = time.time()
    expired = [
        token
        for token, job in _pending_streams.items()
        if now - job["created_at"] > PENDING_STREAM_TTL_SECONDS
    ]
    for token in expired:
        _pending_streams.pop(token, None)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_chat_query(
    payload: ChatCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Store the user query (creating the chat record on the first query) and
    hand back a one-time token for the SSE answer stream."""
    query = payload.query.strip()
    if not query:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Query is empty"
        )

    is_new_chat = payload.chat_id is None
    if payload.chat_id is not None:
        chat = await db.scalar(
            select(ChatHistory).where(
                ChatHistory.id == payload.chat_id,
                ChatHistory.user_id == user.id,
            )
        )
        if chat is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Unknown chat"
            )
        chat_id = chat.id
    else:
        chat = ChatHistory(
            id=f"ch-{str(user.id)[:5]}-{uuid.uuid4()}",
            user_id=user.id,
            title=query[:60].strip() or "New Chat",
        )
        db.add(chat)
        await db.flush()
        chat_id = chat.id

    user_message = Message(
        id=f"msg-{chat_id[:5]}-{uuid.uuid4()}",
        chat_history_id=chat_id,
        role="User",
        content=query,
    )
    db.add(user_message)
    await db.commit()

    stream_token = uuid.uuid4().hex
    _prune_pending()
    _pending_streams[stream_token] = {
        "created_at": time.time(),
        "chat_id": chat_id,
        "user_id": str(user.id),
        "query": query,
        "doc_ids": payload.doc_ids or None,
        "ingestion_from": payload.ingestion_from,
        "ingestion_to": payload.ingestion_to,
        "is_new_chat": is_new_chat,
    }

    return {
        "chat_id": chat_id,
        "message_id": user_message.id,
        "stream_token": stream_token,
        "is_new_chat": is_new_chat,
    }


@router.get("/{chat_id}/stream")
async def stream_chat_answer(
    chat_id: str,
    token: str,
    request: Request,
    user: User = Depends(get_current_user),
) -> EventSourceResponse:
    """SSE stream for one pending query.

    Event order: chat_id (new chats only) -> delta* -> citations -> done,
    where citations contains only the evidence the answer actually cited
    ([[cite:E#]] markers). The AI message and those citation rows are
    persisted even if the client disconnects mid-stream.
    """
    job = _pending_streams.pop(token, None)
    if (
        job is None
        or job["chat_id"] != chat_id
        or job["user_id"] != str(user.id)
        or time.time() - job["created_at"] > PENDING_STREAM_TTL_SECONDS
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Unknown or expired stream"
        )

    async def event_stream():
        ai_message_id = f"msg-{chat_id[:5]}-{uuid.uuid4()}"
        content_parts: list[str] = []
        ret_points: list[dict[str, Any]] = []
        citations: list[dict[str, Any]] = []
        content_by_evidence: dict[str, str | None] = {}
        persisted = False
        stream_error: str | None = None

        async def persist_answer() -> None:
            """Persist the AI message (partial content included) + only the
            citations the answer actually used ([[cite:E#]] markers)."""
            full_content = "".join(content_parts)
            if not full_content.strip():
                return
            used = _used_evidence_ids(full_content)
            used_citations = [c for c in citations if c["id"] in used]
            async with SessionLocal() as session:
                session.add(
                    Message(
                        id=ai_message_id,
                        chat_history_id=chat_id,
                        role="AI",
                        content=full_content,
                    )
                )
                for citation in used_citations:
                    session.add(
                        MessageCitation(
                            message_id=ai_message_id,
                            evidence_id=citation["id"],
                            user_id=uuid.UUID(job["user_id"]),
                            doc_id=citation.get("doc_id"),
                            file_name=citation.get("file_name"),
                            content_type=citation.get("content_type"),
                            content=content_by_evidence.get(citation["id"]),
                            page_number=citation.get("page_number"),
                            coordinates=citation.get("coordinates"),
                            score=citation.get("score") or 0.0,
                        )
                    )
                await session.commit()
            logfire.info(
                "chat answer persisted",
                chat_id=chat_id,
                message_id=ai_message_id,
                content_length=len(full_content),
                citations=len(used_citations),
            )

        try:
            cancel_event = asyncio.Event()
            _cancel_events[chat_id] = cancel_event

            def _cancelled() -> bool:
                return cancel_event.is_set()

            if job["is_new_chat"]:
                yield {
                    "event": "chat_id",
                    "data": json.dumps({"chat_id": chat_id}),
                }

            with logfire.span(
                "chat_answer_stream",
                chat_id=chat_id,
                user_id=job["user_id"],
                query=job["query"][:200],
            ):
                # Shared client: no new TCP handshake to the CLIP service
                # during inference.
                text_embedding, clip_embedding = await embed_query_texts(
                    job["query"], _get_biomedclip_http_client()
                )
                if _cancelled():
                    _cancel_events.pop(chat_id, None)
                    return

                # Shared client: the TLS connection to the cloud cluster is
                # established once and reused across queries.
                store = QdrantStore(shared=True)
                try:
                    points = await hybrid_multimodal_search(
                        store.client,
                        collection_name=settings.qdrant_collection,
                        text_embedding=text_embedding,
                        biomedclip_text_embedding=clip_embedding,
                        user_id=job["user_id"],
                        doc_ids=job["doc_ids"],
                        ingestion_from=job["ingestion_from"],
                        ingestion_to=job["ingestion_to"],
                    )
                finally:
                    await store.close()
                if _cancelled():
                    _cancel_events.pop(chat_id, None)
                    return

                ret_points, citations, images_to_fetch = select_context_points(points)
                image_rows = await fetch_images_base64(images_to_fetch)
                if _cancelled():
                    _cancel_events.pop(chat_id, None)
                    return
                content_by_evidence = {
                    point["evidence_id"]: point.get("content") for point in ret_points
                }

                # LLM stream with a deterministic abort: closing the generator
                # closes the underlying provider HTTP connection midway.
                llm_gen = _stream_answer(job["query"], ret_points, image_rows)
                stopped_midway = False
                try:
                    async for delta in llm_gen:
                        content_parts.append(delta)
                        yield {"event": "delta", "data": json.dumps({"delta": delta})}
                        if _cancelled():
                            stopped_midway = True
                            break
                finally:
                    await llm_gen.aclose()

                if stopped_midway:
                    # Persist the partial answer + its used citations, then end
                    # the stream (the frontend has already stopped listening).
                    await persist_answer()
                    persisted = True
                    _cancel_events.pop(chat_id, None)
                    yield {
                        "event": "stopped",
                        "data": json.dumps(
                            {"message_id": ai_message_id, "content_length": len("".join(content_parts))}
                        ),
                    }
                    return

                # The sources panel shows only the evidence the answer actually
                # cited, emitted once the full response has been streamed.
                used = _used_evidence_ids("".join(content_parts))
                used_citations = [c for c in citations if c["id"] in used]

                citations_payload = []
                for citation in used_citations:
                    coordinates = citation.get("coordinates")
                    if isinstance(coordinates, dict):
                        coordinates = [coordinates]
                    citations_payload.append(
                        {
                            "id": citation["id"],
                            "documentId": citation.get("doc_id"),
                            "documentName": citation.get("file_name"),
                            "pageNumber": citation.get("page_number"),
                            "contentType": citation.get("content_type"),
                            "coordinates": coordinates or [],
                            "excerpt": content_by_evidence.get(citation["id"]),
                            "score": citation.get("score"),
                        }
                    )

                logfire.info(
                    "chat citations ready",
                    chat_id=chat_id,
                    retrieved_points=len(points),
                    citations=len(citations_payload),
                    evidence_items=len(ret_points),
                )

                yield {
                    "event": "citations",
                    "data": json.dumps({"citations": citations_payload}),
                }

            # Persist BEFORE the done event — awaiting inside the finally of a
            # generator that is being closed (GeneratorExit) silently fails.
            await persist_answer()
            persisted = True
            yield {
                "event": "done",
                "data": json.dumps(
                    {"message_id": ai_message_id, "content_length": len("".join(content_parts))}
                ),
            }
        except asyncio.CancelledError:
            stream_error = "client disconnected"
        except Exception as exc:
            logger.exception("Chat answer stream failed for %s", chat_id)
            logfire.error("chat answer stream failed", chat_id=chat_id, error=str(exc))
            stream_error = str(exc) or exc.__class__.__name__
            yield {
                "event": "error",
                "data": json.dumps({"error": stream_error}),
            }
        finally:
            _cancel_events.pop(chat_id, None)
            # Partial answer (client disconnected mid-stream): schedule the
            # persistence as a detached task — awaiting inside the finally of
            # a closing async generator would silently fail.
            if not persisted and "".join(content_parts).strip():
                asyncio.create_task(persist_answer())
                logfire.info(
                    "scheduled partial-answer persistence",
                    chat_id=chat_id,
                    content_length=len("".join(content_parts)),
                )

    event_response = EventSourceResponse(event_stream())
    return event_response


async def _stream_answer(query: str, ret_points: list[dict], image_rows):
    from ..chat_llm import stream_answer as llm_stream_answer

    async for delta in llm_stream_answer(query, ret_points, image_rows):
        yield delta


@router.get("")
async def list_chats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """The user's chat histories, most recently updated first."""
    rows = await db.scalars(
        select(ChatHistory)
        .where(ChatHistory.user_id == user.id)
        .order_by(ChatHistory.updated_at.desc())
    )
    return [
        {
            "id": row.id,
            "title": row.title,
            "createdAt": row.created_at.isoformat(),
            "updatedAt": row.updated_at.isoformat(),
        }
        for row in rows
    ]


@router.get("/{chat_id}")
async def get_chat(
    chat_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """One chat with its messages and their citations — a SINGLE joined query
    over chat_histories → messages → message_citations."""
    stmt = (
        select(
            ChatHistory.id,
            ChatHistory.title,
            ChatHistory.created_at,
            ChatHistory.updated_at,
            Message.id.label("message_id"),
            Message.role.label("message_role"),
            Message.content.label("message_content"),
            Message.created_at.label("message_created_at"),
            MessageCitation.evidence_id,
            MessageCitation.doc_id,
            MessageCitation.file_name,
            MessageCitation.content_type,
            MessageCitation.content,
            MessageCitation.page_number,
            MessageCitation.coordinates,
            MessageCitation.score,
        )
        .join(Message, Message.chat_history_id == ChatHistory.id, isouter=True)
        .join(
            MessageCitation,
            MessageCitation.message_id == Message.id,
            isouter=True,
        )
        .where(
            ChatHistory.id == chat_id,
            ChatHistory.user_id == user.id,
        )
        .order_by(Message.created_at.asc(), Message.id.asc())
    )
    rows = (await db.execute(stmt)).all()
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Unknown chat"
        )

    first = rows[0]
    chat_title = first.title
    chat_created_at = first.created_at
    chat_updated_at = first.updated_at

    # Group the joined rows: messages by id, citations attached to their
    # message and sorted numerically by evidence id (E2 after E10 handling).
    messages_by_id: dict[str, dict[str, Any]] = {}
    citations_by_message: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        if row.message_id is None:
            continue  # chat with zero messages
        if row.message_id not in messages_by_id:
            messages_by_id[row.message_id] = {
                "id": row.message_id,
                "role": row.message_role.lower(),
                "content": row.message_content,
                "createdAt": row.message_created_at.isoformat(),
                "citations": [],
            }
        if row.evidence_id is not None:
            coordinates = row.coordinates
            if isinstance(coordinates, dict):
                coordinates = [coordinates]
            citations_by_message.setdefault(row.message_id, []).append(
                {
                    "id": row.evidence_id,
                    "documentId": row.doc_id,
                    "documentName": row.file_name,
                    "pageNumber": row.page_number,
                    "contentType": row.content_type,
                    "excerpt": row.content,
                    "coordinates": coordinates or [],
                    "score": row.score,
                }
            )

    messages = []
    for message in messages_by_id.values():
        message["citations"] = sorted(
            citations_by_message.get(message["id"], []),
            key=lambda c: int(c["id"][1:]) if c["id"][1:].isdigit() else 0,
        )
        messages.append(message)

    return {
        "id": first.id,
        "title": chat_title,
        "createdAt": chat_created_at.isoformat(),
        "updatedAt": chat_updated_at.isoformat(),
        "messages": messages,
    }


@router.patch("/{chat_id}")
async def rename_chat(
    chat_id: str,
    payload: ChatRenameRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    chat = await db.scalar(
        select(ChatHistory).where(
            ChatHistory.id == chat_id,
            ChatHistory.user_id == user.id,
        )
    )
    if chat is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Unknown chat"
        )
    chat.title = payload.title.strip()
    await db.commit()
    return {"id": chat.id, "title": chat.title}


@router.delete("/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat(
    chat_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    chat = await db.scalar(
        select(ChatHistory).where(
            ChatHistory.id == chat_id,
            ChatHistory.user_id == user.id,
        )
    )
    if chat is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Unknown chat"
        )
    await db.delete(chat)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
