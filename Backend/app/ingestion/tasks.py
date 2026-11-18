"""Celery task entry points for document ingestion."""

from __future__ import annotations

import asyncio
import logging
import threading

import logfire

from ..celery_app import celery_app
from ..config import settings
from .errors import TransientIngestionError

logger = logging.getLogger(__name__)

# Thread-level cap on documents being indexed at once. Safe across the
# per-task asyncio event loops (a threading semaphore, not asyncio). This
# bounds parallelism no matter how the worker is launched — keep the worker's
# --concurrency in sync with settings.ingestion_max_parallel_docs.
_ingestion_slots = threading.BoundedSemaphore(
    max(1, settings.ingestion_max_parallel_docs)
)


@celery_app.task(
    name="app.ingestion.tasks.ingest_document",
    bind=True,
    autoretry_for=(TransientIngestionError,),
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    max_retries=2,
)
def ingest_document(self, document_id: str, user_id: str) -> str | None:
    """Run the async ingestion pipeline for one secured document.

    The task id equals the document id, so deletion can revoke an in-flight
    task via celery_app.control.revoke(document_id). Transient infrastructure
    failures (network / S3 / Qdrant / embeddings) raise TransientIngestionError
    and are retried with exponential backoff while the document stays
    PROCESSING; the pipeline marks ERROR itself on the final attempt. Re-runs
    are idempotent — Qdrant point ids are deterministic.
    """
    from .pipeline import run_ingestion

    retrying = self.request.retries < self.max_retries
    try:
        with logfire.span(
            "celery_task_ingest_document",
            document_id=document_id,
            user_id=user_id,
            task_id=self.request.id,
            attempt=self.request.retries + 1,
        ):
            logfire.info(
                "ingestion task picked up",
                document_id=document_id,
                user_id=user_id,
                attempt=self.request.retries + 1,
            )
            with _ingestion_slots:
                result = asyncio.run(
                    run_ingestion(document_id, user_id, retrying=retrying)
                )
            logfire.info("ingestion task finished", document_id=document_id, result=result)
            return result
    except TransientIngestionError:
        # Hand to Celery's autoretry for the backoff schedule; the document
        # was intentionally left in PROCESSING (no ERROR marking yet).
        logfire.warning(
            "transient ingestion failure — scheduling retry",
            document_id=document_id,
            attempt=self.request.retries + 1,
        )
        raise
    except Exception:
        # run_ingestion handles its own status updates and cleanup; this guard
        # only stops other unexpected crashes from being retried or masked.
        logfire.error("ingestion task crashed", document_id=document_id)
        logger.exception("Ingestion task crashed for document %s", document_id)
        try:
            from .. import events

            asyncio.run(
                events.publish_document_event(
                    user_id, document_id, "ERROR", is_ready=False,
                    error="Indexing task crashed unexpectedly",
                )
            )
        except Exception:
            logger.exception(
                "Could not publish crash event for document %s", document_id
            )
        return "ERROR"
