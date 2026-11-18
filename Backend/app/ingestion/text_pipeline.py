"""Table and text embedding/Qdrant upload (notebook cells 51 and 54, async)."""

from __future__ import annotations

import logging
from typing import Any

import httpx
import logfire
from qdrant_client import models

from ..config import settings
from .embeddings import embed_texts
from .pii import detect_pii_batch
from .qdrant_store import QdrantStore, get_ingestion_timestamp, make_point_id

logger = logging.getLogger(__name__)

EMBEDDING_MODEL_NAME = "MedEmbed-Large-v0.1"


async def _upload_chunks(
    items: list[dict[str, Any]],
    *,
    content_type: str,
    payload_text_key: str,
    store: QdrantStore,
    embedding_model,
    pii_client: httpx.AsyncClient,
    doc_id: str,
    user_id: str,
    batch_size: int,
) -> list[str]:
    """
    Shared body of the notebook's upload_table_chunks/upload_text_chunks.

    PII runs ONCE for all chunks (the tunnel round trip dominates — per-batch
    calls multiplied the latency), then batches only embed; points accumulate
    and Qdrant receives a single upsert per phase instead of one per batch.
    Returns every upserted point id.
    """
    ingestion_time = get_ingestion_timestamp()

    total = len(items)
    if total == 0:
        return []

    # ==================== Detect and redact PII for all chunks at once ======
    pii_results = await detect_pii_batch(pii_client, [item["text"] for item in items])
    for item, pii_result in zip(items, pii_results):
        item["text"] = pii_result["redacted_text"]

    logfire.info(
        "PII batch redacted",
        document_id=doc_id,
        content_type=content_type,
        batch_size=total,
        redacted_previews=[
            item["text"][:200] for item in items[:5]
        ],
    )
    # ========================================================================

    points: list[models.PointStruct] = []

    for start in range(0, total, batch_size):
        batch = items[start:start + batch_size]

        # 1. Generate embeddings
        embedding_texts = [item["text"] for item in batch]
        embeddings = await embed_texts(embedding_model, embedding_texts)

        logfire.info(
            "text embeddings generated",
            document_id=doc_id,
            content_type=content_type,
            batch_size=len(batch),
            vector_dim=len(embeddings[0]) if embeddings else 0,
        )

        # 2. Construct Qdrant points
        for item, embedding in zip(batch, embeddings):
            element_id = item["element_id"]

            point_id = make_point_id(
                user_id,
                doc_id,
                element_id
            )

            payload = {
                # User and document identification
                "user_id": user_id,
                "doc_id": doc_id,

                # Element identification
                "element_id": element_id,

                # Content classification
                "content_type": content_type,
                "modality": "text",
                "source_type": "unstructured",

                # Original document information
                "file_name": item.get("file_name"),
                "mime_type": "application/pdf",

                # Location information
                "page_number": item.get("page_number"),
                "coordinates": item.get("coordinates"),

                # Actual embedding content
                payload_text_key: item[payload_text_key],

                # Ingestion information
                "ingested_at": ingestion_time,
                "last_modified": (
                    item["last_modified"].isoformat()
                    if hasattr(
                        item.get("last_modified"),
                        "isoformat"
                    )
                    else item.get("last_modified")
                ),

                # Embedding model information
                "embedding_model": EMBEDDING_MODEL_NAME
            }

            points.append(
                models.PointStruct(
                    id=point_id,

                    vector={
                        "text_vector": embedding
                    },

                    payload=payload
                )
            )

        logger.info(
            "Embedded %s/%s %s chunks (document %s)",
            len(points), total, content_type, doc_id,
        )

    # 3. Single Qdrant upsert for the whole phase (wait=True kept: retrieval
    # may run the moment INDEXED is published).
    if points:
        await store.upsert(points)

    logfire.info(
        "text/table phase upserted to Qdrant",
        document_id=doc_id,
        content_type=content_type,
        uploaded=len(points),
        total=total,
        point_ids=[point.id for point in points],
        element_ids=[point.payload.get("element_id") for point in points],
    )
    logger.info(
        "Successfully uploaded %s %s chunks for document %s.",
        len(points), content_type, doc_id,
    )
    return [point.id for point in points]


async def upload_table_chunks(
    tables: list[dict[str, Any]],
    *,
    store: QdrantStore,
    embedding_model,
    pii_client: httpx.AsyncClient,
    doc_id: str,
    user_id: str,
    batch_size: int = settings.ingestion_batch_size,
) -> list[str]:
    """
    Embed table chunks in batches and upload each
    completed batch to Qdrant immediately.
    """
    return await _upload_chunks(
        tables,
        content_type="table",
        payload_text_key="text_as_html",
        store=store,
        embedding_model=embedding_model,
        pii_client=pii_client,
        doc_id=doc_id,
        user_id=user_id,
        batch_size=batch_size,
    )


async def upload_text_chunks(
    texts: list[dict[str, Any]],
    *,
    store: QdrantStore,
    embedding_model,
    pii_client: httpx.AsyncClient,
    doc_id: str,
    user_id: str,
    batch_size: int = settings.ingestion_batch_size,
) -> list[str]:
    """
    Embed text chunks in batches and upload each
    completed batch to Qdrant immediately.
    """
    return await _upload_chunks(
        texts,
        content_type="text",
        payload_text_key="text",
        store=store,
        embedding_model=embedding_model,
        pii_client=pii_client,
        doc_id=doc_id,
        user_id=user_id,
        batch_size=batch_size,
    )
