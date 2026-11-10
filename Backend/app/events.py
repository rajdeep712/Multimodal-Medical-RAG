"""Redis pub/sub transport for document lifecycle events.

The Celery worker publishes PROCESSING / INDEXED / ERROR events here after it
has updated PostgreSQL (which remains the source of truth); the FastAPI SSE
endpoints subscribe and forward the events to the browser.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncIterator

import redis.asyncio as redis

from .config import settings

logger = logging.getLogger(__name__)

CHANNEL_PREFIX = "medical-rag:documents:"

## Shared client for the FastAPI process (one event loop). The Celery worker
## builds task-local clients instead because each task runs its own loop.
_client: redis.Redis | None = None


def document_event_channel(user_id: str) -> str:
    return f"{CHANNEL_PREFIX}{user_id}"


def get_events_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(settings.events_redis_url, decode_responses=True)
    return _client


def create_task_redis() -> redis.Redis:
    """Fresh client for a Celery task with its own event loop."""
    return redis.from_url(settings.events_redis_url, decode_responses=True)


async def close_events_redis() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def publish_document_event(
    user_id: str,
    document_id: str,
    status: str,
    *,
    client: redis.Redis | None = None,
    **data: Any,
) -> None:
    payload = {"document_id": document_id, "status": status, **data}
    if "is_ready" not in payload:
        payload["is_ready"] = status == "INDEXED"
    channel = document_event_channel(user_id)
    owned = client is None
    if client is None:
        client = create_task_redis()
    try:
        await client.publish(channel, json.dumps(payload))
    finally:
        if owned:
            await client.aclose()


async def subscribe_user_events(user_id: str) -> AsyncIterator[dict[str, Any]]:
    """Yield live events for one user until the subscriber is cancelled.

    Uses a short poll timeout instead of an unbounded listen() so the caller
    can check for client disconnects between events.
    """
    client = get_events_redis()
    pubsub = client.pubsub()
    channel = document_event_channel(user_id)
    await pubsub.subscribe(channel)
    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if not message or message.get("type") != "message":
                continue
            raw = message.get("data")
            if not raw:
                continue
            try:
                yield json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("Discarding malformed document event payload")
    except asyncio.CancelledError:
        raise
    finally:
        try:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()
        except Exception:
            pass
