"""Shared ingestion error types."""

from __future__ import annotations


class TransientIngestionError(Exception):
    """A retryable infrastructure failure (network / S3 / Qdrant / embeddings / PII).

    The pipeline raises this instead of marking the document ERROR when the
    failure looks transient AND another Celery attempt remains; the task's
    ``autoretry_for`` then schedules the exponential backoff. Re-runs are
    idempotent because Qdrant point ids are deterministic.
    """
