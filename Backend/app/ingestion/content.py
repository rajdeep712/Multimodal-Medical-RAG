"""Unstructured PDF extraction (notebook cells 0, 9, 10 and 13)."""

from __future__ import annotations

import asyncio
import base64
import re
import uuid
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup
from unstructured.partition.pdf import partition_pdf

MAX_CHARS = 1800


def clean_text(text):
    """Normalize whitespace without changing the actual content."""
    return re.sub(r"\s+", " ", text or "").strip()


def parse_table_html(html):
    """
    Convert an Unstructured HTML table into structured key-value records.
    Preserves section headings and handles colspan.
    """

    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table")

    if not table:
        return [], []

    records = []
    warnings = []

    current_section = ""
    table_title = ""

    rows = table.find_all("tr")

    for row_idx, row in enumerate(rows):

        cells = row.find_all(["td", "th"], recursive=False)

        if not cells:
            continue

        # Extract cell text and logical column positions.
        logical_cells = []
        column_position = 0

        for cell in cells:

            value = clean_text(cell.get_text(" ", strip=True))

            colspan = int(cell.get("colspan", 1) or 1)

            logical_cells.append({
                "position": column_position,
                "colspan": colspan,
                "value": value
            })

            column_position += colspan

        non_empty = [
            cell for cell in logical_cells
            if cell["value"]
        ]

        if not non_empty:
            continue

        row_text = " ".join(
            cell["value"] for cell in non_empty
        )

        normalized = row_text.lower()

        # Skip column header rows.
        if (
            "investigation" in normalized
            and "observed value" in normalized
        ):
            continue

        # Identify full-width rows (usually titles or section headings).
        if (
            len(non_empty) == 1
            and non_empty[0]["colspan"] >= 2
        ):

            heading = non_empty[0]["value"]

            if not table_title:
                table_title = heading
            else:
                current_section = heading

            continue

        # Handle ordinary rows using logical column positions.
        test = ""
        observed = ""
        unit = ""
        reference = ""

        for cell in non_empty:

            pos = cell["position"]
            value = cell["value"]

            if pos == 0:
                test = value

            elif pos == 1:
                observed = value

            elif pos == 2:
                unit = value

            elif pos >= 3:
                if reference:
                    reference += " " + value
                else:
                    reference = value

        if not test:
            warnings.append(
                f"Row {row_idx}: Missing test/label; "
                f"raw content: {row_text}"
            )
            continue

        # Avoid treating repeated table headers as measurements.
        if test.lower() in {
            "test", "investigation", "parameter"
        }:
            continue

        # Build a self-contained record.
        record_parts = []

        if table_title:
            record_parts.append(
                f"Table: {table_title}"
            )

        if current_section:
            record_parts.append(
                f"Section: {current_section}"
            )

        record_parts.append(f"Test: {test}")

        if observed:
            record_parts.append(
                f"Observed Value: {observed}"
            )

        if unit:
            record_parts.append(
                f"Unit: {unit}"
            )

        if reference:
            record_parts.append(
                f"Biological Reference Range: {reference}"
            )

        record = "\n".join(record_parts)

        records.append(record)

    return records, warnings


def pack_records(records, max_chars=MAX_CHARS):
    """
    Pack complete key-value records into chunks.
    Never splits an individual record.
    """

    chunks = []
    current_chunk = ""

    for record in records:

        # A single record must fit independently.
        if len(record) > max_chars:
            raise ValueError(
                f"Individual table record exceeds "
                f"{max_chars} characters. "
                f"Record length: {len(record)}. "
                f"Record: {record[:200]}"
            )

        candidate = (
            current_chunk + "\n\n" + record
            if current_chunk
            else record
        )

        if len(candidate) <= max_chars:
            current_chunk = candidate

        else:
            if current_chunk:
                chunks.append(current_chunk)

            current_chunk = record

    if current_chunk:
        chunks.append(current_chunk)

    return chunks


def get_table_coordinates(chunk):
    """
    Get the original table coordinates.
    The same coordinates will be assigned to every child chunk.
    """

    orig_elements = getattr(
        chunk.metadata, "orig_elements", None
    ) or []

    for element in orig_elements:

        coordinates = getattr(
            element.metadata, "coordinates", None
        )

        if coordinates:
            return coordinates.to_dict()

    # Fallback to table metadata.
    coordinates = getattr(
        chunk.metadata, "coordinates", None
    )

    return coordinates.to_dict() if coordinates else None


def transform_table(chunk, max_chars=MAX_CHARS):
    """
    Convert an Unstructured Table element into
    token-limited structured embedding chunks.
    """

    html = getattr(
        chunk.metadata, "text_as_html", None
    )

    if not html:
        raise ValueError(
            "Table HTML is missing. Cannot safely "
            "construct structured key-value records."
        )

    records, warnings = parse_table_html(html)

    embedding_chunks = pack_records(
        records,
        max_chars=max_chars
    )

    coordinates = get_table_coordinates(chunk)

    results = []

    for idx, text in enumerate(embedding_chunks):

        results.append({
            "type": "Table",
            "element_id": f"{chunk._element_id}_{idx}",
            "table_id": chunk._element_id,
            "text": text,
            "text_as_html": html,
            "page_number": chunk.metadata.page_number,
            "file_name": chunk.metadata.filename,
            "coordinates": coordinates,
            "last_modified": chunk.metadata.last_modified,
        })

    return results


def split_content(chunks):
    """Notebook cell 10: separate tables from composite text chunks."""
    tables = []
    texts = []    ## Composite Elements

    for chunk in chunks:
        if "Table" in str(type(chunk)):
            table_results = transform_table(
                chunk,
                max_chars=1800
            )

            tables.extend(table_results)

        if "CompositeElement" in str(type((chunk))):
            orig_elements = getattr(chunk.metadata, "orig_elements", None) or []
            if not orig_elements:
                continue

            total_text = ""
            coordinates = []
            for element in orig_elements:
                if len(total_text) > 1800:
                    texts.append({
                        'type': 'Text',
                        'element_id': uuid.uuid4().hex + "_" + str(len(texts)),
                        'text': total_text,
                        'page_number': element.metadata.page_number,
                        'file_name': element.metadata.filename,
                        'coordinates': coordinates,
                        'last_modified': element.metadata.last_modified,
                    })

                    total_text = ""
                    coordinates = []

                if "Image" not in str(type(element)):
                    total_text += (element.text + "\n\n")
                    coordinates.append(element.metadata.coordinates.to_dict() if element.metadata.coordinates else None)

            if total_text.strip():  # Only append if there's text
                texts.append({
                    'type': 'Text',
                    'element_id': uuid.uuid4().hex,
                    'text': total_text,
                    'page_number': element.metadata.page_number,
                    'file_name': element.metadata.filename,
                    'coordinates': coordinates,
                    'last_modified': element.metadata.last_modified,
                })

    return tables, texts


def get_images_base64(chunks):
    """Notebook cell 13: collect the images from the CompositeElement objects."""
    images_b64 = []
    for chunk in chunks:
        if "CompositeElement" in str(type(chunk)):
            for el in getattr(chunk.metadata, "orig_elements", None) or []:
                if "Image" in str(type(el)):
                    images_b64.append({
                        'type': 'Image',
                        'image_id': el._element_id or uuid.uuid4().hex,
                        'base64Image': el.metadata.image_base64,
                        'page_number': el.metadata.page_number,
                        'file_name': el.metadata.filename,
                        'coordinates': el.metadata.coordinates.to_dict() if el.metadata.coordinates else None,
                        'last_modified': el.metadata.last_modified,
                    })
    return images_b64


def _render_page_png_base64_sync(
    pdf_path: Path,
    page_number: int | None,
    max_side: float = 1600.0,
) -> str | None:
    """Render one PDF page to a base64 PNG (longest side capped at max_side).

    Used for HANDWRITING images: their DB rows store the whole page so the
    handwritten note is always shown with its full context.
    """
    import pymupdf

    doc = pymupdf.open(str(pdf_path))
    try:
        index = (page_number or 1) - 1
        if index < 0 or index >= len(doc):
            return None
        page = doc[index]
        rect = page.rect
        zoom = max(1.0, min(2.5, max_side / max(rect.width, rect.height)))
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom))
        return base64.b64encode(pix.tobytes("png")).decode("ascii")
    finally:
        doc.close()


async def render_page_base64(pdf_path: Path, page_number: int | None) -> str | None:
    """Async wrapper around the blocking PyMuPDF page render."""
    return await asyncio.to_thread(_render_page_png_base64_sync, pdf_path, page_number)


def _partition_document(pdf_path: Path):
    """Notebook cell 0 arguments, kept exactly."""
    return partition_pdf(
        filename=str(pdf_path),
        infer_table_structure=True,            # extract tables
        strategy="hi_res",                     # mandatory to infer tables

        extract_image_block_types=["Image"],   # Add 'Table' to list to extract image of tables

        extract_image_block_to_payload=True,   # if true, will extract base64 for API usage

        chunking_strategy="by_title",          # or 'basic'
        max_characters=10000,                  # defaults to 500
        combine_text_under_n_chars=2000,       # defaults to 0
        new_after_n_chars=6000,
    )


async def extract_content(pdf_path: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    """Run the blocking unstructured extraction in a worker thread."""
    chunks = await asyncio.to_thread(_partition_document, pdf_path)
    tables, texts = await asyncio.to_thread(split_content, chunks)
    images = get_images_base64(chunks)
    return tables, texts, images
