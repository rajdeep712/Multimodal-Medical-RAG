"""Image analysis + BioMedCLIP embeddings (notebook cells 26-31 and 62, async).

The image LLM is called ONCE per document through the notebook's parallel
process_all (asyncio.gather + semaphore); the batched upload then reuses those
results for filtering, embeddings and a single Qdrant upsert.
"""

from __future__ import annotations

import asyncio
import base64
import io
import logging
from typing import Any

import httpx
import logfire
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from qdrant_client import models

from ..config import settings
from .embeddings import embed_texts
from .errors import TransientIngestionError
from .pii import post_with_retry
from .qdrant_store import get_ingestion_timestamp, make_point_id

logger = logging.getLogger(__name__)

IMAGE_BATCH_SIZE = settings.image_ingestion_batch_size

IMAGE_FALLBACK_RESULT = {
    "classification": "IRRELEVANT",
    "image_type": "OTHER",
    "summary": "",
}

# Images smaller than this are logos/decorations by definition — skipping them
# avoids burning a vision-LLM call on each one.
MIN_ANALYSIS_SIDE_PX = 64


def downscale_image_base64(image_base64: str, max_side: int = 1024) -> str:
    """Downscale a base64 image so its longest side is ~max_side (JPEG q85).

    The vision LLM, BioMedCLIP and the DB rows all work at ≤1024-1600px, so
    full-resolution payloads only cost bytes and latency. Undecodable input is
    returned unchanged — downstream steps have their own fallbacks.
    """
    try:
        from PIL import Image

        raw = base64.b64decode(image_base64)
        with Image.open(io.BytesIO(raw)) as img:
            img = img.convert("RGB")
            width, height = img.size
            longest = max(width, height)
            if longest <= max_side:
                return image_base64
            scale = max_side / longest
            img = img.resize(
                (max(1, round(width * scale)), max(1, round(height * scale))),
                Image.LANCZOS,
            )
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=85)
            return base64.b64encode(buffer.getvalue()).decode("ascii")
    except Exception as error:
        logger.warning("Could not downscale an extracted image (%s); sending as-is", error)
        return image_base64


def _is_tiny_image(image_base64: str) -> bool:
    """True when the image is smaller than MIN_ANALYSIS_SIDE_PX on any side."""
    try:
        from PIL import Image

        raw = base64.b64decode(image_base64)
        with Image.open(io.BytesIO(raw)) as img:
            return img.width < MIN_ANALYSIS_SIDE_PX or img.height < MIN_ANALYSIS_SIDE_PX
    except Exception:
        return False


def build_image_chain(*, http_async_client: httpx.AsyncClient | None = None):
    """Notebook cells 26 and 28: the image analysis chain (prompt | model | json parser)."""
    model = ChatOpenAI(
        model=settings.image_analysis_model,
        base_url=settings.image_analysis_base_url,
        api_key=settings.image_analysis_api_key or "not-needed",
        temperature=0,
        http_async_client=http_async_client,
    )

    prompt_template = """You are an image analysis component in a Medical Document RAG (Retrieval-Augmented Generation) ingestion pipeline.

Your task is to analyze images extracted from medical reports, laboratory reports, prescriptions, and other healthcare-related documents.

### 1. Image Analysis

For each image:

1. Identify the type and contents of the image.
2. Determine whether it contains potentially useful medical or clinical information.
3. Classify it into one of the specified image categories.
4. Generate an appropriate summary based on the image type.
5. Preserve the accuracy of visible medical information. Never invent missing content, measurements, or details.

### 2. Classification Categories

Classify each image into one of the following:

- **RELEVANT:** Contains medical or clinical information that could be useful for understanding the patient's medical records.
- **IRRELEVANT:** Contains logos, decorative graphics, generic icons, watermarks, or unrelated visual content that does not need to be stored in the vector database.
- **UNCERTAIN:** The image is unclear, incomplete, or its medical relevance cannot be determined confidently.

### 3. Image Type Categories

Choose exactly one of the following:

- HANDWRITING
- MEDICAL_SCAN
- CLINICAL_PHOTOGRAPH
- DIAGNOSTIC_GRAPH
- CHART
- MEDICAL_ILLUSTRATION
- DOCUMENT_SCREENSHOT
- LOGO
- ICON
- DECORATIVE_IMAGE
- OTHER

### 4. Summary Generation Instructions

The summary field must be generated according to the identified image type.

**A. HANDWRITING**

This category is primarily intended for handwritten prescriptions, doctor's notes, handwritten medical instructions, and other handwritten medical content.

- Transcribe ONLY the handwritten content visible in the image.
- The summary must contain only the corrected transcription. Do not include any introductory text, headers, labels, explanations, descriptions, or concluding statements.
- Correct obvious spelling mistakes and recognize common medical terminology, drug names, dosage expressions, and abbreviations when their intended meaning is clear.
- Expand medical abbreviations and short forms into their commonly accepted full forms wherever you can do so confidently.
- Correct incorrectly recognized drug names and medical terms only when the intended word can be identified with sufficient confidence.
- Preserve the original meaning, dosage, frequency, units, and instructions.
- Do not guess illegible words, drug names, dosages, or measurements. Mark unclear portions as `[illegible]` rather than inventing a transcription.
- Preserve the original order and structure of the handwritten content as much as possible.

**Important:** For HANDWRITING, the summary field must contain ONLY the transcribed handwritten content. It must never contain phrases such as "The image contains handwritten text", "Transcription:", or "The prescription reads".

**B. All Other Image Types**

For all other image categories:

- Provide a short, informative description of the visible content.
- Identify the type of medical image, chart, graph, illustration, or document shown.
- Include relevant visible labels, annotations, measurements, and other clinical information when readable.
- Avoid unnecessary visual descriptions, speculation, or diagnostic conclusions.
- Do not infer medical findings that cannot be directly established from the image.

### 5. Important Rules

- Medical images do not need to contain readable text to be classified as RELEVANT.
- Clinical graphs and charts containing patient measurements or medical trends should be considered RELEVANT.
- A hospital logo alone should be classified as IRRELEVANT.
- Do not classify an image as RELEVANT merely because it appears inside a medical document.
- If the image contains both relevant medical information and decorative elements, prioritize the medical information.
- When uncertain about the content or transcription, do not fabricate information.

### 6. Output Format

Return ONLY valid JSON. Do not include Markdown code fences, explanations, or additional text.

Use exactly the following structure:

{{
  "classification": "RELEVANT | IRRELEVANT | UNCERTAIN",
  "image_type": "HANDWRITING | MEDICAL_SCAN | CLINICAL_PHOTOGRAPH | DIAGNOSTIC_GRAPH | CHART | MEDICAL_ILLUSTRATION | DOCUMENT_SCREENSHOT | LOGO | ICON | DECORATIVE_IMAGE | OTHER",
  "summary": "Image-specific summary or handwritten transcription"
}}

For IRRELEVANT images, return an empty string in the summary field.

Ensure that the output is valid JSON and that all three fields are always present."""

    messages = [
        (
            "user",
            [
                {"type": "text", "text": prompt_template},
                {
                    "type": "image_url",
                    "image_url": {"url": "data:image/jpeg;base64,{image}"},
                },
            ],
        )
    ]

    json_parser = JsonOutputParser()

    prompt = ChatPromptTemplate.from_messages(messages)
    return prompt | model | json_parser


async def process_all(chain, images: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Notebook cell 30: analyze all images in parallel under a semaphore.

    Tiny images (sub-64px logos/decorations) skip the LLM. Infrastructure
    failures must trigger an ingestion retry, never masquerade as IRRELEVANT.
    """
    semaphore = asyncio.Semaphore(settings.image_analysis_concurrency)

    async def analyze(image_base64: str):
        if _is_tiny_image(image_base64):
            logger.info(
                "Skipping LLM analysis of a tiny image (%spx min side)",
                MIN_ANALYSIS_SIDE_PX,
            )
            return dict(IMAGE_FALLBACK_RESULT)
        async with semaphore:
            try:
                return await chain.ainvoke(image_base64)
            except Exception as error:
                logger.warning("Image analysis failed (%s); ingestion will retry", type(error).__name__)
                raise TransientIngestionError(
                    f"Image analysis failed ({type(error).__name__}); retry ingestion"
                ) from error

    results = await asyncio.gather(
        *(analyze(img['base64Image']) for img in images), return_exceptions=True,
    )
    # Drain every image request before the task closes its HTTP client.
    for result in results:
        if isinstance(result, BaseException):
            raise result

    return results


def is_relevant_result(result: dict[str, Any]) -> bool:
    """Notebook cell 62 filter, with its exact operator precedence:
    RELEVANT or (UNCERTAIN and summary has no [illegible] markers)."""
    return bool(
        result["classification"] == "RELEVANT"
        or result["classification"] == "UNCERTAIN"
        and not ("[illegible]" in result["summary"])
    )


async def build_image_chunks(
    images: list[dict[str, Any]],
    analysis_results: list[dict[str, Any]],
    *,
    embedding_model,
    clip_client: httpx.AsyncClient,
    doc_id: str,
    user_id: str,
    image_batch_size: int = IMAGE_BATCH_SIZE,
) -> tuple[list[models.PointStruct], list[dict[str, Any]]]:
    """Filter images and prepare vectors; the orchestrator publishes after S3.

    Returns (unpublished Qdrant points, selected image items).
    """
    ingestion_time = get_ingestion_timestamp()

    total_images = len(images)
    uploaded_count = 0
    all_points: list[models.PointStruct] = []
    selected_images: list[dict[str, Any]] = []

    for start in range(0, total_images, image_batch_size):
        batch = images[start:start + image_batch_size]
        batch_results = analysis_results[start:start + image_batch_size]

        summaries = []
        for index, (item, result) in enumerate(zip(batch, batch_results)):
            if is_relevant_result(result):
                item["summary"] = result["summary"]
                item["image_type"] = result["image_type"]

                summaries.append((index, result["summary"]))

                logfire.info(
                    "image accepted for indexing",
                    document_id=doc_id,
                    image_id=item.get("image_id"),
                    classification=result.get("classification"),
                    image_type=result.get("image_type"),
                )
            else:
                # Trace exactly why an image did not reach Qdrant / the DB.
                logfire.info(
                    "image skipped by LLM relevance filter",
                    document_id=doc_id,
                    image_id=item.get("image_id"),
                    page_number=item.get("page_number"),
                    classification=result.get("classification"),
                    image_type=result.get("image_type"),
                    summary=result.get("summary"),
                    reason=(
                        "UNCERTAIN with [illegible] markers in summary"
                        if result.get("classification") == "UNCERTAIN"
                        else f"classified {result.get('classification')}"
                    ),
                )

        if not summaries:
            logfire.info(
                "no images accepted in batch",
                document_id=doc_id,
                batch_image_ids=[item.get("image_id") for item in batch],
            )
            continue

        # 2. Generate embeddings for the summaries
        summary_embeddings = await embed_texts(embedding_model, [summary for _, summary in summaries])

        clip_response = await post_with_retry(
            clip_client,
            settings.biomedclip_images_batch_url,
            {"images": [batch[index]['base64Image'] for index, _ in summaries]},
            label="biomedclip-embeddings",
            timeout=180,
        )
        clip_response.raise_for_status()
        clip_results = clip_response.json()
        image_embeddings = clip_results["embeddings"]

        points = []

        for (index, _), summ_em, img_em in zip(summaries, summary_embeddings, image_embeddings):
            item = batch[index]
            image_id = item["image_id"]

            point_id = make_point_id(
                user_id,
                doc_id,
                image_id
            )

            payload = {
                # User and document identification
                "user_id": user_id,
                "doc_id": doc_id,

                # Element identification
                "image_id": image_id,
                "image_type": item.get("image_type"),

                # Content classification
                "content_type": "image",
                "modality": "text",
                "source_type": "unstructured",

                # Original document information
                "file_name": item.get("file_name"),
                "mime_type": "application/pdf",

                # Location information
                "page_number": item.get("page_number"),
                "coordinates": item.get("coordinates"),

                # Actual embedding content
                "summary": item["summary"],

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
                "embedding_model": "BioMedCLIP"
            }

            points.append(
                models.PointStruct(
                    id=point_id,

                    vector={
                        "text_vector": summ_em,
                        "image_vector": img_em,
                    },

                    payload=payload
                )
            )

            selected_images.append(item)

        # 4. Accumulate — a single Qdrant upsert for the whole phase follows
        # (one cloud round trip instead of one per batch; wait=True kept).
        if not points:
            continue

        all_points.extend(points)
        uploaded_count = len(all_points)

        logfire.info(
            "image batch embedded",
            document_id=doc_id,
            uploaded=uploaded_count,
            total_images=total_images,
            image_ids=[point.payload.get("image_id") for point in points],
        )

        logger.info(
            "Embedded %s/%s image chunks (document %s)",
            uploaded_count, total_images, doc_id,
        )

    point_ids = [point.id for point in all_points]

    logfire.info(
        "image vectors prepared for S3 publication",
        document_id=doc_id,
        uploaded=len(all_points),
        total_images=total_images,
        point_ids=point_ids,
    )
    logger.info(
        "Prepared %s image chunks for document %s.",
        uploaded_count, doc_id,
    )
    return all_points, selected_images
