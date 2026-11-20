"""Celery application for the document ingestion workers.

Run the worker from Backend/ with (threads pool so several documents ingest
in parallel; keep --concurrency in sync with settings.ingestion_max_parallel_docs):
    .venv/Scripts/python.exe -m celery -A app.celery_app:celery_app worker --pool=threads --concurrency=3
"""

from __future__ import annotations

import asyncio
import logging

from celery import Celery
from celery.concurrency import get_implementation
from celery.signals import worker_init, worker_process_init, worker_process_shutdown, worker_ready

from .config import settings

logger = logging.getLogger(__name__)

celery_app = Celery(
    "medical_rag",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    imports=("app.ingestion.tasks",),
)


@worker_process_init.connect
def init_worker_process(**_kwargs) -> None:
    """Configure tracing and load the heavy unstructured models once per worker process."""
    try:
        from .observability import configure_observability

        configure_observability("medical-rag-ingest-worker")
    except Exception:
        logger.exception("observability configuration failed")

    try:
        from .ingestion.warmup import warm_unstructured

        if settings.unstructured_warmup_enabled:
            warm_unstructured()
    except Exception:
        logger.exception("unstructured warmup failed; first task will load models lazily")


@worker_init.connect
def init_thread_worker(sender=None, **_kwargs) -> None:
    """Warm the shared models before a threads worker starts consuming tasks.

    Threads share one process/model cache and do not emit worker_process_init.
    Solo and prefork pools already invoke that signal themselves.
    """
    if sender is None:
        return
    pool_cls = get_implementation(sender.pool_cls)
    if pool_cls.__module__ == "celery.concurrency.thread":
        init_worker_process()


@worker_ready.connect
def sweep_stale_ingestions(**_kwargs) -> None:
    """Recover ingestions orphaned by an API crash or a lost broker message.

    - SECURED rows: the DB row was committed but the Celery enqueue never
      happened (or was lost) — re-enqueue. Re-runs are idempotent because the
      Qdrant point ids are deterministic.
    - PROCESSING rows: the broker message was lost mid-run (a worker *crash*
      is already covered by acks_late + reject_on_worker_lost) — mark ERROR so
      the UI stops showing an endless spinner. Not re-enqueued: that could
      race a still-running ingestion's final image-replace write.
    """
    try:
        asyncio.run(_sweep_stale_ingestions_async())
    except Exception:
        logger.exception("Stuck-ingestion sweep failed")


async def _sweep_stale_ingestions_async() -> None:
    from datetime import timedelta

    from sqlalchemy import func, select, text
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from .models import Document

    engine = create_async_engine(
        settings.async_database_url,
        connect_args=settings.async_database_connect_args,
        pool_pre_ping=True,
    )
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with session_factory() as session:
            stale = (
                await session.execute(
                    select(Document)
                    .where(
                        Document.ingestion_status.in_(["SECURED", "PROCESSING"]),
                        # DB-side comparison: robust regardless of tz handling.
                        Document.updated_at
                        < func.now()
                        - text(f"interval '{int(settings.stuck_ingestion_minutes)} minutes'"),
                    )
                    .order_by(Document.updated_at.asc())
                )
            ).scalars().all()

        if not stale:
            logger.info("Stuck-ingestion sweep: nothing to recover")
            return

        from . import events
        from .ingestion.tasks import ingest_document  # lazy: avoid import cycle at startup

        requeued = 0
        for doc in stale:
            if doc.ingestion_status == "SECURED":
                ingest_document.apply_async(
                    args=[doc.document_id, str(doc.user_id)], task_id=doc.document_id
                )
                logger.warning(
                    "Sweep: re-enqueued orphaned SECURED document %s (user %s)",
                    doc.document_id, doc.user_id,
                )
                requeued += 1
            else:
                async with session_factory() as session:
                    row = await session.get(Document, doc.document_id)
                    if row is None or row.ingestion_status != "PROCESSING":
                        continue  # something already changed it
                    row.is_ready = False
                    row.ingestion_status = "ERROR"
                    row.ingestion_error = "Ingestion was interrupted — please re-upload"
                    row.qdrant_point_ids = []
                    await session.commit()
                await events.publish_document_event(
                    str(doc.user_id),
                    doc.document_id,
                    "ERROR",
                    is_ready=False,
                    error="Ingestion was interrupted — please re-upload",
                )
                logger.warning(
                    "Sweep: marked stale PROCESSING document %s (user %s) as ERROR",
                    doc.document_id, doc.user_id,
                )

        logger.info("Stuck-ingestion sweep done: %s re-enqueued, rest marked ERROR", requeued)
    finally:
        await engine.dispose()


@worker_process_shutdown.connect
def shutdown_worker_process(**_kwargs) -> None:
    logger.info("Ingestion worker shutting down.")
