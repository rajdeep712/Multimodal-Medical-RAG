"""Bulk persistence of relevant document images (single multi-row insert)."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import delete, insert

from ..models import DocumentImage

logger = logging.getLogger(__name__)


async def replace_document_images(
    session,
    *,
    document_id: str,
    user_id,
    images: list[dict[str, Any]],
) -> int:
    """Replace this document's image rows with the selected relevant images.

    All rows are written in ONE multi-row INSERT statement, as required, so
    ingestion stays fast for image-heavy documents.
    """
    await session.execute(
        delete(DocumentImage).where(DocumentImage.document_id == document_id)
    )

    if not images:
        return 0

    rows = [
        {
            "document_id": document_id,
            "image_id": image["image_id"],
            "user_id": user_id,
            # HANDWRITING rows carry a whole-page render instead of the
            # cropped element (image_base64_for_db set by the pipeline).
            "image_base64": image.get("image_base64_for_db") or image["base64Image"],
            "image_type": image.get("image_type"),
            "summary": image.get("summary"),
            "page_number": image.get("page_number"),
            "coordinates": image.get("coordinates"),
        }
        for image in images
    ]

    await session.execute(insert(DocumentImage).values(rows))
    logger.info(
        "Stored %s relevant image rows for document %s", len(rows), document_id
    )
    return len(rows)
