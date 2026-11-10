"""Async Qdrant access (notebook cells 36 and 45)."""

from __future__ import annotations

import logging

from qdrant_client import AsyncQdrantClient, models

from ..config import settings

logger = logging.getLogger(__name__)

TEXT_VECTOR_SIZE = 1024
IMAGE_VECTOR_SIZE = 512


class QdrantStore:
    """Thin wrapper around AsyncQdrantClient for the medical_documents collection."""

    def __init__(self, client: AsyncQdrantClient | None = None) -> None:
        self._owns_client = client is None
        self.client = client or AsyncQdrantClient(
            url=settings.qdrant_url,
            api_key=settings.qdrant_api_key or None,
        )

    async def ensure_collection(self) -> None:
        """Create the collection with both named vectors only when missing."""
        collections = await self.client.get_collections()
        exists = any(c.name == settings.qdrant_collection for c in collections.collections)
        if exists:
            return

        await self.client.create_collection(
            collection_name=settings.qdrant_collection,

            vectors_config={
                "text_vector": models.VectorParams(
                    size=TEXT_VECTOR_SIZE,
                    distance=models.Distance.COSINE
                ),

                "image_vector": models.VectorParams(
                    size=IMAGE_VECTOR_SIZE,
                    distance=models.Distance.COSINE
                )
            }
        )
        logger.info("Created Qdrant collection %s", settings.qdrant_collection)

    async def upsert(self, points: list[models.PointStruct]) -> None:
        await self.client.upsert(
            collection_name=settings.qdrant_collection,
            points=points,
            wait=True
        )

    async def delete_points(self, point_ids: list[str]) -> None:
        if not point_ids:
            return
        await self.client.delete(
            collection_name=settings.qdrant_collection,
            points_selector=models.PointIdsList(points=point_ids),
            wait=True,
        )

    async def delete_document_points(self, user_id: str, doc_id: str) -> None:
        """Delete every point of one document, by payload filter."""
        await self.client.delete(
            collection_name=settings.qdrant_collection,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="user_id",
                            match=models.MatchValue(value=user_id),
                        ),
                        models.FieldCondition(
                            key="doc_id",
                            match=models.MatchValue(value=doc_id),
                        ),
                    ]
                )
            ),
            wait=True,
        )

    async def close(self) -> None:
        if self._owns_client:
            await self.client.close()


def make_point_id(user_id: str, doc_id: str, element_id: str) -> str:
    """
    Generate deterministic UUIDs (notebook cell 47).
    Re-uploading the same element updates its existing point.
    """
    import uuid as uuid_module

    return str(
        uuid_module.uuid5(
            uuid_module.NAMESPACE_URL,
            f"{user_id}:{doc_id}:{element_id}"
        )
    )


def get_ingestion_timestamp() -> str:
    """Notebook cell 46."""
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()
