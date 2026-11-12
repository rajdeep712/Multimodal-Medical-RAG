"""Hybrid multimodal retrieval — verbatim async port of retrieval.ipynb.

Query embeddings come from the local MedEmbed model (text_vector, 1024-d)
and the BioMedCLIP text endpoint (image_vector, 512-d); the two Prefetch
searches are fused server-side with Reciprocal Rank Fusion, filtered by the
mandatory user_id plus optional doc_ids / ingestion date range.
"""

from __future__ import annotations

import logging
from datetime import datetime

import httpx
from qdrant_client import models
from sqlalchemy import select, tuple_

import logfire

from .config import settings
from .ingestion.embeddings import build_embedding_model
from .ingestion.pii import post_with_retry

logger = logging.getLogger(__name__)


async def embed_query_texts(query: str, http_client: httpx.AsyncClient) -> tuple[list[float], list[float]]:
    """Generate both query embeddings: 1024-d MedEmbed + 512-d BioMedCLIP text.

    Notebook cells 3-5: text_embedding via the local OpenAI-compatible
    embedding model; img_embedding via the BioMedCLIP text endpoint.
    """
    embedding_model = build_embedding_model()
    text_embedding = await embedding_model.aembed_query(query)

    clip_response = await post_with_retry(
        http_client,
        settings.biomedclip_text_url,
        {"text": query},
        label="biomedclip-text-embedding",
        timeout=180,
    )
    clip_response.raise_for_status()
    image_embedding = clip_response.json()["embedding"]

    if len(text_embedding) != 1024:
        raise ValueError("Expected 1024D text embedding")
    if len(image_embedding) != 512:
        raise ValueError("Expected 512D BioMedCLIP embedding")

    return text_embedding, image_embedding


async def hybrid_multimodal_search(
    client,
    collection_name: str,
    text_embedding: list[float],
    biomedclip_text_embedding: list[float],
    user_id: str,
    doc_ids: list[str] | None = None,
    ingestion_from: datetime | None = None,
    ingestion_to: datetime | None = None,
    top_k: int | None = None,
    prefetch_limit: int | None = None,
):
    """Notebook cell 8, verbatim: two Prefetch searches fused with RRF."""
    if top_k is None:
        top_k = settings.retrieval_top_k
    if prefetch_limit is None:
        prefetch_limit = settings.retrieval_prefetch_limit

    # Mandatory user filter
    conditions = [
        models.FieldCondition(
            key="user_id",
            match=models.MatchValue(value=user_id)
        )
    ]

    # Filter by multiple document IDs
    if doc_ids:
        conditions.append(
            models.FieldCondition(
                key="doc_id",
                match=models.MatchAny(any=doc_ids)
            )
        )

    # Ingestion date range
    if ingestion_from or ingestion_to:
        date_range = models.DatetimeRange(
            gte=ingestion_from,
            lte=ingestion_to
        )

        conditions.append(
            models.FieldCondition(
                key="ingested_at",
                range=date_range
            )
        )

    query_filter = models.Filter(must=conditions)

    # Independent searches
    prefetch = [
        models.Prefetch(
            query=text_embedding,
            using="text_vector",
            filter=query_filter,
            limit=prefetch_limit
        ),
        models.Prefetch(
            query=biomedclip_text_embedding,
            using="image_vector",
            filter=query_filter,
            limit=prefetch_limit
        ),
    ]

    # Server-side Reciprocal Rank Fusion
    results = await client.query_points(
        collection_name=collection_name,
        prefetch=prefetch,
        query=models.FusionQuery(
            fusion=models.Fusion.RRF
        ),
        limit=top_k,
        with_payload=True,
        with_vectors=False
    )

    return results.points


def select_context_points(
    points,
    max_images: int | None = None,
):
    """Notebook cell 13, verbatim: separate evidence items from citations.

    - Images (content_type == "image"): keep only the top `max_images`.
      Points arrive sorted by RRF score, so first-seen = best.
    - Everything else (text / tables): keep all of them.
    """
    if max_images is None:
        max_images = settings.retrieval_max_images

    ret_points = []   # all text / table points
    # top `max_images` image points
    citations = []
    images_to_fetch = []  ## Images table is indexed by doc_id + image_id, so we can fetch them in one go with this separate list

    for index, point in enumerate(points):
        if point.payload.get("content_type") == "image":
            if len(images_to_fetch) < max_images:
                ret_points.append({
                    "evidence_id": "E" + str(index+1),
                    "type": "image",
                    "image_id": point.payload.get("image_id"),
                })
                images_to_fetch.append((point.payload.get("doc_id"), point.payload.get("image_id")))
        else:
            if point.payload.get("content_type") == "table":
                ret_points.append({
                    "evidence_id": "E" + str(index+1),
                    "type": "table",
                    "content": point.payload.get("text_as_html"),
                })
            else:
                ret_points.append({
                    "evidence_id": "E" + str(index+1),
                    "type": "text",
                    "content": point.payload.get("text"),
                })

        citations.append({
            "id": "E" + str(index+1),
            "user_id": point.payload.get("user_id"),
            "file_name": point.payload.get("file_name"),
            "doc_id": point.payload.get("doc_id"),
            "content_type": point.payload.get("content_type"),
            "page_number": point.payload.get("page_number"),
            "coordinates": point.payload.get("coordinates"),
            "score": point.score
        })

    return ret_points, citations, images_to_fetch


async def fetch_images_base64(
    images_to_fetch: list[tuple[str, str]],
):
    """Notebook cell 17, verbatim: fetch the stored JPEG bytes for the
    selected images in a SINGLE DB call and base64-encode them for the LLM.

    Returns one entry per input, in the SAME order; a row missing from the
    DB (e.g. deleted) comes back with image_base64=None so the alignment is
    preserved.
    """
    import base64

    from sqlalchemy import tuple_ as sa_tuple_

    from .database import SessionLocal
    from .models import DocumentImage

    if not images_to_fetch:
        return []

    stmt = (
        select(
            DocumentImage.document_id,
            DocumentImage.image_id,
            DocumentImage.image_data,
        )
        .where(
            sa_tuple_(DocumentImage.document_id, DocumentImage.image_id).in_(images_to_fetch)
        )
    )

    async with SessionLocal() as db:
        rows = (await db.execute(stmt)).all()

    base64_by_key = {
        (row.document_id, row.image_id): base64.b64encode(row.image_data).decode("ascii")
        for row in rows
    }

    class _ImageRow:
        def __init__(self, image_id: str, image_base64: str | None):
            self.image_id = image_id
            self.image_base64 = image_base64

    return [
        _ImageRow(
            image_id=image_id,
            image_base64=base64_by_key.get((doc_id, image_id)),
        )
        for doc_id, image_id in images_to_fetch
    ]
