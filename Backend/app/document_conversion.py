from __future__ import annotations

import io
import os
from pathlib import Path

import img2pdf
from PIL import Image, ImageOps

from .config import settings


class ImageConversionError(ValueError):
    pass


_EXPECTED_FORMATS = {
    "image/png": "PNG",
    "image/jpeg": "JPEG",
}


def _normalized_dpi(image: Image.Image) -> tuple[float, float]:
    dpi = image.info.get("dpi")
    if isinstance(dpi, tuple) and len(dpi) == 2:
        try:
            x, y = float(dpi[0]), float(dpi[1])
        except (TypeError, ValueError):
            return (96.0, 96.0)
        if 1.0 <= x <= 1200.0 and 1.0 <= y <= 1200.0:
            return (x, y)
    return (96.0, 96.0)


def convert_image_to_pdf(
    source_path: Path,
    destination_path: Path,
    source_mime: str,
) -> int:
    expected_format = _EXPECTED_FORMATS.get(source_mime)
    if expected_format is None:
        raise ImageConversionError("Only PNG and JPEG images can be converted")

    try:
        with Image.open(source_path) as probe:
            if probe.format != expected_format:
                raise ImageConversionError("Image content does not match its declared type")
            width, height = probe.size
            if width <= 0 or height <= 0:
                raise ImageConversionError("Image dimensions are invalid")
            if width * height > settings.max_image_pixels:
                raise ImageConversionError("Image dimensions exceed the allowed limit")
            probe.verify()

        with Image.open(source_path) as source:
            source.load()
            image = ImageOps.exif_transpose(source)
            dpi = _normalized_dpi(source)

            has_alpha = image.mode in {"RGBA", "LA"} or (
                image.mode == "P" and "transparency" in image.info
            )
            if has_alpha:
                rgba = image.convert("RGBA")
                flattened = Image.new("RGB", rgba.size, (255, 255, 255))
                flattened.paste(rgba, mask=rgba.getchannel("A"))
                image = flattened
            elif image.mode not in {"RGB", "L"}:
                image = image.convert("RGB")

            buffer = io.BytesIO()
            if expected_format == "JPEG":
                image.convert("RGB").save(
                    buffer,
                    format="JPEG",
                    quality=95,
                    subsampling=0,
                    optimize=True,
                    dpi=dpi,
                )
            else:
                image.save(buffer, format="PNG", optimize=True, dpi=dpi)

        pdf_bytes = img2pdf.convert(
            buffer.getvalue(),
            layout_fun=img2pdf.get_fixed_dpi_layout_fun(dpi),
        )
        if not pdf_bytes.startswith(b"%PDF"):
            raise ImageConversionError("Image conversion did not produce a valid PDF")
        if len(pdf_bytes) > settings.max_stored_pdf_bytes:
            raise ImageConversionError("Converted PDF exceeds the allowed size limit")

        temporary_path = destination_path.with_name(f"{destination_path.name}.part")
        try:
            with open(temporary_path, "wb") as target:
                target.write(pdf_bytes)
                target.flush()
                os.fsync(target.fileno())
            os.replace(temporary_path, destination_path)
        finally:
            if temporary_path.exists():
                temporary_path.unlink(missing_ok=True)

        return len(pdf_bytes)
    except ImageConversionError:
        raise
    except Exception as exc:
        raise ImageConversionError("The image could not be converted to PDF") from exc
