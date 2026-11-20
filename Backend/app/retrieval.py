"""Hybrid multimodal retrieval — verbatim async port of retrieval.ipynb.

Query embeddings come from the local MedEmbed model (text_vector, 1024-d)
and the BioMedCLIP text endpoint (image_vector, 512-d); the two Prefetch
searches are fused server-side with Reciprocal Rank Fusion, filtered by the
mandatory user_id plus optional doc_ids / ingestion date range.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime

import httpx
from qdrant_client import models

import logfire

from .config import settings
from .ingestion.embeddings import get_embedding_model
from .ingestion.pii import post_with_retry
from .ingestion.image_repository import sign_image_references
from . import aws

logger = logging.getLogger(__name__)


async def embed_query_texts(query: str, http_client: httpx.AsyncClient) -> tuple[list[float], list[float]]:
    """Generate both query embeddings: 1024-d MedEmbed + 512-d BioMedCLIP text.

    Notebook cells 3-5: text_embedding via the local OpenAI-compatible
    embedding model; img_embedding via the BioMedCLIP text endpoint.
    Both calls run in PARALLEL — they are independent, and this is the
    first-token-latency critical path of the chat stream.
    """
    embedding_model = get_embedding_model()

    async def _clip_embedding() -> list[float]:
        clip_response = await post_with_retry(
            http_client,
            settings.biomedclip_text_url,
            {"text": query},
            label="biomedclip-text-embedding",
            timeout=180,
        )
        clip_response.raise_for_status()
        image_embedding = clip_response.json()["embedding"]
        if len(image_embedding) != 512:
            raise ValueError("Expected 512D BioMedCLIP embedding")
        return image_embedding

    text_embedding, image_embedding = await asyncio.gather(
        embedding_model.aembed_query(query),
        _clip_embedding(),
    )

    if len(text_embedding) != 1024:
        raise ValueError("Expected 1024D text embedding")

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
    selected_images = []

    for index, point in enumerate(points):
        if point.payload.get("content_type") == "image":
            if len(selected_images) < max_images:
                image = {
                    "evidence_id": "E" + str(index+1),
                    "type": "image",
                    "image_id": point.payload.get("image_id"),
                    "doc_id": point.payload.get("doc_id"),
                    "user_id": point.payload.get("user_id"),
                    "image_s3_bucket": point.payload.get("image_s3_bucket"),
                    "image_s3_key": point.payload.get("image_s3_key"),
                }
                ret_points.append(image)
                selected_images.append(image)
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

    return ret_points, citations, selected_images


async def sign_context_images(images: list[dict], *, user_id: str) -> None:
    """Sign only selected image references; no SQL query or S3 object download."""
    if images:
        await sign_image_references(aws.api_s3_client(), images, user_id=user_id)
