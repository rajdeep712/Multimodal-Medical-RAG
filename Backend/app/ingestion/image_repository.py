"""Bulk persistence of relevant document images (single multi-row insert).

Stored payloads are raw JPEG bytes: each base64 image (cropped element, or
the whole rendered page for HANDWRITING rows) is decoded, resized so its
longest side is at most 1024px and re-encoded as JPEG (quality 80) before it
reaches PostgreSQL as BYTEA.
"""

from __future__ import annotations

import base64
import logging
from io import BytesIO
from typing import Any

from PIL import Image
from sqlalchemy import delete, insert

from ..models import DocumentImage

logger = logging.getLogger(__name__)

MAX_STORED_IMAGE_SIDE = 1024
JPEG_QUALITY = 80


def process_base64_image(base64_payload: str) -> bytes:
    """Decode a base64 image, cap it at 1024px and compress it to JPEG bytes."""
    raw = base64.b64decode(base64_payload)
    with Image.open(BytesIO(raw)) as source:
        image = source.convert("RGB")
        image.thumbnail((MAX_STORED_IMAGE_SIDE, MAX_STORED_IMAGE_SIDE))
        buffer = BytesIO()
        image.save(buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True)
        return buffer.getvalue()


async def replace_document_images(
    session,
    *,
    document_id: str,
    user_id,
    images: list[dict[str, Any]],
) -> int:
    """Replace this document's image rows with the selected relevant images.

    All rows are written in ONE multi-row INSERT statement, as required, so
    ingestion stays fast for image-heavy documents. Identical source images
    (e.g. HANDWRITING rows sharing one whole-page render) are processed once.
    """
    await session.execute(
        delete(DocumentImage).where(DocumentImage.document_id == document_id)
    )

    if not images:
        return 0

    processed_cache: dict[str, bytes] = {}
    rows = []
    for image in images:
        # HANDWRITING rows carry a whole-page render instead of the cropped
        # element (image_base64_for_db set by the pipeline).
        source_base64 = image.get("image_base64_for_db") or image["base64Image"]
        image_data = processed_cache.get(source_base64)
        if image_data is None:
            image_data = process_base64_image(source_base64)
            processed_cache[source_base64] = image_data
        rows.append(
            {
                "document_id": document_id,
                "image_id": image["image_id"],
                "user_id": user_id,
                "image_data": image_data,
                "image_type": image.get("image_type"),
                "summary": image.get("summary"),
                "page_number": image.get("page_number"),
                "coordinates": image.get("coordinates"),
            }
        )

    await session.execute(insert(DocumentImage).values(rows))
    logger.info(
        "Stored %s relevant image rows for document %s", len(rows), document_id
    )
    return len(rows)
