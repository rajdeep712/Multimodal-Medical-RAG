"""Celery application for the document ingestion workers.

Run the worker from Backend/ with:
    .venv/Scripts/python.exe -m celery -A app.celery_app:celery_app worker --pool=solo --concurrency=1
"""

from __future__ import annotations

import logging

from celery import Celery
from celery.signals import worker_process_init, worker_process_shutdown

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


@worker_process_shutdown.connect
def shutdown_worker_process(**_kwargs) -> None:
    logger.info("Ingestion worker shutting down.")
