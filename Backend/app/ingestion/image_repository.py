"""Private S3 image storage and scoped, short-lived download URLs."""
from __future__ import annotations

import asyncio
import base64
import hashlib
import re
import uuid
from io import BytesIO
from typing import Any

from PIL import Image

from ..config import settings

MAX_STORED_IMAGE_SIDE = 1024
JPEG_QUALITY = 80


def process_base64_image(base64_payload: str) -> bytes:
    """Keep existing image sizing/format (also used by legacy DB setup)."""
    with Image.open(BytesIO(base64.b64decode(base64_payload))) as source:
        image = source.convert("RGB")
        image.thumbnail((MAX_STORED_IMAGE_SIDE, MAX_STORED_IMAGE_SIDE))
        buffer = BytesIO()
        image.save(buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True)
        return buffer.getvalue()


def document_image_prefix(user_id: str, document_id: str) -> str:
    user_id = str(uuid.UUID(str(user_id)))
    if not re.fullmatch(r"[A-Za-z0-9_-]+", document_id):
        raise ValueError("Invalid image document ID")
    _, prefix = settings.image_s3_location
    return f"{prefix + '/' if prefix else ''}{user_id}/{document_id}/images/"


async def upload_document_images(
    client, images: list[dict[str, Any]], *, user_id: str, document_id: str,
    uploaded_keys: list[str],
) -> None:
    """Upload concurrently, tracking attempted keys for failure rollback."""
    if not images:
        return
    bucket, _ = settings.image_s3_location
    prefix = document_image_prefix(user_id, document_id)
    semaphore = asyncio.Semaphore(settings.image_s3_upload_concurrency)

    async def upload(item):
        async with semaphore:
            key = prefix + hashlib.sha256(str(item["image_id"]).encode()).hexdigest() + ".jpg"
            data = await asyncio.to_thread(
                process_base64_image,
                item.get("image_base64_for_storage") or item["base64Image"],
            )
            # A lost PUT response may hide a successful write. Include its key
            # in rollback even when the request reports an error or times out.
            uploaded_keys.append(key)
            await client.put_object(
                Bucket=bucket, Key=key, Body=data, ContentType="image/jpeg",
                ServerSideEncryption="aws:kms", SSEKMSKeyId=settings.s3_sse_kms_key_id,
                BucketKeyEnabled=True,
            )
            item["image_s3_bucket"] = bucket
            item["image_s3_key"] = key

    tasks = [asyncio.create_task(upload(item)) for item in images]
    try:
        results = await asyncio.gather(*tasks, return_exceptions=True)
    except BaseException:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise
    for result in results:
        if isinstance(result, BaseException):
            raise result


async def delete_image_keys(client, bucket: str, keys: list[str]) -> None:
    """S3 supports batch deletion of up to 1,000 objects per request."""
    keys = list(dict.fromkeys(keys))
    for start in range(0, len(keys), 1000):
        response = await client.delete_objects(
            Bucket=bucket,
            Delete={"Objects": [{"Key": key} for key in keys[start:start + 1000]], "Quiet": True},
        )
        if response.get("Errors"):
            raise RuntimeError("S3 image cleanup failed; retry deletion")


async def delete_document_images(client, *, user_id: str, document_id: str) -> None:
    # Allow deleting old DB-backed documents before the new bucket is set.
    if not settings.image_s3_url.strip() or "YOUR_IMAGE_BUCKET" in settings.image_s3_url:
        return
    bucket, _ = settings.image_s3_location
    prefix = document_image_prefix(user_id, document_id)
    paginator = client.get_paginator("list_objects_v2")
    async for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        await delete_image_keys(client, bucket, [item["Key"] for item in page.get("Contents", [])])


async def sign_image_references(client, images: list[dict], *, user_id: str) -> None:
    """Attach ephemeral URLs in memory; never fetch image bytes or query SQL."""
    if not images:
        return
    bucket, _ = settings.image_s3_location
    for image in images:
        image.pop("image_url", None)
        if str(image.get("user_id")) != str(user_id):
            raise ValueError("Image does not belong to the current user")
        key = image.get("image_s3_key")
        prefix = document_image_prefix(user_id, image.get("doc_id") or "")
        if (image.get("image_s3_bucket") != bucket or not isinstance(key, str)
                or not re.fullmatch(re.escape(prefix) + r"[a-f0-9]{64}\.jpg", key)):
            raise ValueError("Image storage reference is missing or outside the authorized document")
        image["image_url"] = await client.generate_presigned_url(
            "get_object", Params={"Bucket": bucket, "Key": key},
            ExpiresIn=settings.image_presigned_url_ttl_seconds, HttpMethod="GET",
        )
