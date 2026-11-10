"""Celery task entry points for document ingestion."""

from __future__ import annotations

import asyncio
import logging

import logfire

from ..celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.ingestion.tasks.ingest_document", bind=True, max_retries=0)
def ingest_document(self, document_id: str, user_id: str) -> str | None:
    """Run the async ingestion pipeline for one secured document.

    The task id equals the document id, so deletion can revoke an in-flight
    task via celery_app.control.revoke(document_id).
    """
    from .pipeline import run_ingestion

    try:
        with logfire.span(
            "celery_task_ingest_document",
            document_id=document_id,
            user_id=user_id,
            task_id=self.request.id,
        ):
            logfire.info("ingestion task picked up", document_id=document_id, user_id=user_id)
            result = asyncio.run(run_ingestion(document_id, user_id))
            logfire.info("ingestion task finished", document_id=document_id, result=result)
            return result
    except Exception:
        # run_ingestion handles its own status updates and cleanup; this guard
        # only stops Celery from retrying or masking the error.
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
