"""One-time unstructured hi-res model warmup at worker process start."""

from __future__ import annotations

import logging
import os
import tempfile
from io import BytesIO

import img2pdf
from PIL import Image
from unstructured.partition.pdf import partition_pdf

logger = logging.getLogger(__name__)


def _build_tiny_pdf(temp_directory: str) -> str:
    """Render a minimal one-page PDF with Pillow + img2pdf."""
    image = Image.new("RGB", (300, 300), "white")
    buffer = BytesIO()
    image.save(buffer, format="PNG")

    # mkstemp leaks an open handle on Windows; close it before writing.
    fd, pdf_path = tempfile.mkstemp(suffix=".pdf", dir=temp_directory)
    os.close(fd)
    with open(pdf_path, "wb") as target:
        target.write(img2pdf.convert(buffer.getvalue()))
    return pdf_path


def warm_unstructured() -> None:
    """Load the hi-res partition models with a tiny one-page PDF."""
    logger.info("Warming up unstructured hi-res models...")
    with tempfile.TemporaryDirectory(prefix="medilens-warmup-") as temp_directory:
        pdf_path = _build_tiny_pdf(temp_directory)
        partition_pdf(
            filename=pdf_path,
            infer_table_structure=True,
            strategy="hi_res",
            extract_image_block_types=["Image"],
            extract_image_block_to_payload=True,
            chunking_strategy="by_title",
            max_characters=10000,
            combine_text_under_n_chars=2000,
            new_after_n_chars=6000,
        )
    logger.info("unstructured warmup complete.")
