"""Image-only upload recovery without model downloads or external services."""
import base64
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

import img2pdf
from PIL import Image, ImageDraw

from app.ingestion import content, image_pipeline


class ImageUploadFallbackTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.pdf = Path(self.temp.name) / "converted-image.pdf"
        image = Image.new("RGB", (320, 240), "black")
        ImageDraw.Draw(image).ellipse((80, 40, 240, 200), fill="white")
        image_bytes = io.BytesIO()
        image.save(image_bytes, format="PNG")
        self.pdf.write_bytes(img2pdf.convert(image_bytes.getvalue()))

    async def recover(self):
        with patch.object(content, "_partition_document", return_value=[]):
            return await content.extract_content(self.pdf, image_upload=True)

    async def test_empty_image_upload_recovers_full_page_with_metadata(self):
        tables, texts, images = await self.recover()
        self.assertEqual((tables, texts), ([], []))
        self.assertEqual(len(images), 1)
        item = images[0]
        self.assertEqual(item["page_number"], 1)
        with Image.open(io.BytesIO(base64.b64decode(item["base64Image"]))) as recovered:
            self.assertEqual(recovered.format, "JPEG")
            self.assertAlmostEqual(recovered.width / recovered.height, 4 / 3, places=2)
            self.assertGreater(recovered.getpixel((recovered.width // 2, recovered.height // 2))[0], 240)
            self.assertLess(recovered.getpixel((0, 0))[0], 15)
            self.assertEqual(item["coordinates"]["layout_width"], recovered.width)
            self.assertEqual(item["coordinates"]["layout_height"], recovered.height)
        again = (await self.recover())[2][0]
        self.assertEqual(item["image_id"], again["image_id"])

    async def test_empty_single_page_pdf_recovers_image_without_image_upload_flag(self):
        with patch.object(content, "_partition_document", return_value=[]):
            tables, texts, images = await content.extract_content(self.pdf)
        self.assertEqual((tables, texts), ([], []))
        self.assertEqual(len(images), 1)
        self.assertEqual(images[0]["page_number"], 1)
        with Image.open(io.BytesIO(base64.b64decode(images[0]["base64Image"]))) as recovered:
            self.assertGreater(recovered.getpixel((recovered.width // 2, recovered.height // 2))[0], 240)
            self.assertLess(recovered.getpixel((0, 0))[0], 15)

    async def test_empty_multipage_pdf_keeps_existing_behavior(self):
        import pymupdf

        multipage = Path(self.temp.name) / "multipage.pdf"
        with pymupdf.open() as document:
            document.new_page()
            document.new_page()
            document.save(multipage)
        with patch.object(content, "_partition_document", return_value=[]):
            self.assertEqual(await content.extract_content(multipage), ([], [], []))

    async def test_existing_extraction_is_preserved(self):
        existing = [{"image_id": "existing"}]
        with patch.object(content, "_partition_document", return_value=[object()]), \
                patch.object(content, "split_content", return_value=([], [])), \
                patch.object(content, "get_images_base64", return_value=existing), \
                patch.object(content, "_image_only_pdf_fallback") as fallback:
            self.assertEqual((await content.extract_content(self.pdf, image_upload=True))[2], existing)
            fallback.assert_not_called()

    async def test_partition_errors_are_not_swallowed(self):
        with patch.object(content, "_partition_document", side_effect=RuntimeError("extraction failed")):
            with self.assertRaisesRegex(RuntimeError, "extraction failed"):
                await content.extract_content(self.pdf, image_upload=True)

    async def test_recovered_image_uses_normal_analysis_and_embedding_pipeline(self):
        images = (await self.recover())[2]
        images[0]["file_name"] = "scan.png"
        result = {"classification": "RELEVANT", "image_type": "MEDICAL_SCAN",
                  "summary": "A medical scan."}
        chain = Mock(ainvoke=AsyncMock(return_value=result))
        analyses = await image_pipeline.process_all(chain, images)
        chain.ainvoke.assert_awaited_once_with(images[0]["base64Image"])
        response = Mock()
        response.json.return_value = {"embeddings": [[0.0] * 512]}
        with patch.object(image_pipeline, "embed_texts", AsyncMock(return_value=[[0.0] * 1024])), \
                patch.object(image_pipeline, "post_with_retry", AsyncMock(return_value=response)):
            points, selected = await image_pipeline.build_image_chunks(
                images, analyses, embedding_model=Mock(), clip_client=Mock(),
                doc_id="test-document", user_id="test-user",
            )
        self.assertEqual(len(points), 1)
        self.assertEqual(selected[0]["image_type"], "MEDICAL_SCAN")
        point = points[0]
        self.assertEqual(point.payload["page_number"], 1)
        self.assertEqual(point.payload["file_name"], "scan.png")
        self.assertEqual(point.payload["coordinates"], images[0]["coordinates"])


if __name__ == "__main__":
    unittest.main()
