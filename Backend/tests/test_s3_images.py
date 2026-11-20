"""S3 image storage, inference, and publication tests; no external services."""
import asyncio
import base64
import copy
import hashlib
import io
import unittest
import uuid
from contextlib import ExitStack, asynccontextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from urllib.parse import parse_qs, urlsplit

from PIL import Image
from botocore.exceptions import ClientError, EndpointConnectionError
import aioboto3
import httpx
from openai import BadRequestError

from app import aws, chat_llm, retrieval
from app.config import settings
from app.ingestion import image_repository as repo
from app.ingestion import pipeline
from app.ingestion.errors import TransientIngestionError
from app.routers import documents
from fastapi import HTTPException, Response

USER = "12345678-1234-5678-1234-567812345678"
OTHER = "22345678-1234-5678-1234-567812345678"
DOC = "a" * 32


def image_data(color="red"):
    output = io.BytesIO()
    Image.new("RGB", (128, 96), color).save(output, format="PNG")
    return base64.b64encode(output.getvalue()).decode()


def image_item(identifier="image-1"):
    return {"image_id": identifier, "base64Image": image_data(), "page_number": 1,
            "image_type": "MEDICAL_SCAN", "file_name": "scan.png"}


def reference(identifier="image-1", document_id=DOC):
    return {"type": "image", "evidence_id": "E1", "image_id": identifier,
            "user_id": USER, "doc_id": document_id, "image_s3_bucket": "test-image-bucket",
            "image_s3_key": repo.document_image_prefix(USER, document_id)
            + hashlib.sha256(identifier.encode()).hexdigest() + ".jpg"}


class ImageTestCase(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.config = patch.multiple(settings, image_s3_url="s3://test-image-bucket/medical-images",
                                     image_s3_upload_concurrency=2, image_presigned_url_ttl_seconds=300)
        self.config.start()
        self.addCleanup(self.config.stop)


class StorageTests(ImageTestCase):
    async def test_concurrent_uploads_are_bounded_and_retry_safe(self):
        active = peak = 0
        async def put(**kwargs):
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            await asyncio.sleep(0.01)
            active -= 1
        client = Mock(put_object=AsyncMock(side_effect=put))
        images = [image_item(str(i)) for i in range(5)]
        keys = []
        await repo.upload_document_images(client, images, user_id=USER, document_id=DOC, uploaded_keys=keys)
        self.assertEqual(peak, 2)
        self.assertEqual(len(keys), 5)
        self.assertEqual(client.put_object.await_count, 5)
        first_keys = keys[:]
        await repo.upload_document_images(client, images, user_id=USER, document_id=DOC, uploaded_keys=[])
        self.assertEqual(first_keys, [image["image_s3_key"] for image in images])
        for call in client.put_object.await_args_list:
            self.assertEqual(call.kwargs["ServerSideEncryption"], "aws:kms")
            self.assertNotIn("ACL", call.kwargs)
            self.assertTrue(call.kwargs["Body"].startswith(b"\xff\xd8"))

    async def test_failed_upload_drains_batch_and_tracks_cleanup_keys(self):
        completed = []
        async def put(**kwargs):
            await asyncio.sleep(0.001)
            completed.append(kwargs["Key"])
            if len(completed) == 1:
                raise ConnectionError("upload failed")
        client = Mock(put_object=AsyncMock(side_effect=put), delete_objects=AsyncMock(return_value={}))
        keys = []
        with self.assertRaises(ConnectionError):
            await repo.upload_document_images(client, [image_item(str(i)) for i in range(4)],
                                              user_id=USER, document_id=DOC, uploaded_keys=keys)
        self.assertEqual(len(completed), 4)
        await repo.delete_image_keys(client, "test-image-bucket", keys)
        self.assertEqual(len(client.delete_objects.await_args.kwargs["Delete"]["Objects"]), 4)

    async def test_whole_page_handwriting_is_the_uploaded_image(self):
        image = image_item()
        image["image_base64_for_storage"] = image_data("blue")
        client = Mock(put_object=AsyncMock())
        await repo.upload_document_images(client, [image], user_id=USER, document_id=DOC, uploaded_keys=[])
        with Image.open(io.BytesIO(client.put_object.await_args.kwargs["Body"])) as uploaded:
            red, _, blue = uploaded.getpixel((30, 30))
            self.assertGreater(blue, red)

    async def test_signing_uses_only_local_signer_and_300_seconds(self):
        client = Mock(spec=["generate_presigned_url"])
        client.generate_presigned_url = AsyncMock(return_value="https://s3.example/image?signature=secret")
        image = reference()
        await repo.sign_image_references(client, [image], user_id=USER)
        client.generate_presigned_url.assert_awaited_once_with(
            "get_object", Params={"Bucket": "test-image-bucket", "Key": image["image_s3_key"]},
            ExpiresIn=300, HttpMethod="GET")
        self.assertIn("signature=secret", image["image_url"])

    async def test_real_sdk_signs_locally_with_sigv4_and_five_minute_expiry(self):
        session = aioboto3.Session(aws_access_key_id="test-key", aws_secret_access_key="test-secret")
        async with session.client("s3", config=aws.S3_CONFIG) as client:
            # Any attempted object read/download would fail: no AWS request is needed.
            with patch.object(client, "get_object", AsyncMock(side_effect=AssertionError("unexpected download"))):
                image = reference()
                await repo.sign_image_references(client, [image], user_id=USER)
        query = parse_qs(urlsplit(image["image_url"]).query)
        self.assertEqual(query["X-Amz-Algorithm"], ["AWS4-HMAC-SHA256"])
        self.assertEqual(query["X-Amz-Expires"], ["300"])

    async def test_signer_rejects_cross_user_bucket_document_and_traversal(self):
        variants = [{"user_id": OTHER}, {"image_s3_bucket": "other-bucket"},
                    {"doc_id": "other-document"}, {"image_s3_key": "../secret.jpg"},
                    {"image_s3_key": None}]
        for fields in variants:
            with self.subTest(fields=fields):
                client = Mock(generate_presigned_url=AsyncMock())
                with self.assertRaises(ValueError):
                    await repo.sign_image_references(client, [{**reference(), **fields}], user_id=USER)
                client.generate_presigned_url.assert_not_awaited()

    async def test_selection_signs_only_retrieval_max_images_and_keeps_text(self):
        points = [SimpleNamespace(payload={**reference(str(i)), "content_type": "image"}, score=1)
                  for i in range(4)]
        points.append(SimpleNamespace(payload={"content_type": "text", "text": "Evidence"}, score=0.5))
        evidence, _, images = retrieval.select_context_points(points, max_images=2)
        self.assertEqual(len(images), 2)
        self.assertEqual(len(evidence), 3)
        client = Mock(generate_presigned_url=AsyncMock(return_value="https://signed.example/image"))
        with patch.object(aws, "api_s3_client", return_value=client):
            await retrieval.sign_context_images(images, user_id=USER)
        self.assertEqual(client.generate_presigned_url.await_count, 2)
        self.assertEqual(evidence[0]["image_url"], "https://signed.example/image")
        self.assertEqual(evidence[-1]["content"], "Evidence")
        self.assertNotIn("image_url", points[0].payload)

    async def test_messages_use_urls_without_image_id_collisions(self):
        first, second = reference(), reference(document_id="b" * 32)
        first["image_url"], second["image_url"] = "https://one.example/image", "https://two.example/image"
        messages = chat_llm.build_multimodal_messages("Question", [first, second])
        urls = [part["image_url"]["url"] for part in messages[-1]["content"] if part["type"] == "image_url"]
        self.assertEqual(urls, [first["image_url"], second["image_url"]])
        self.assertNotIn("base64", str(messages))

    async def test_provider_errors_do_not_expose_signed_urls(self):
        image = {**reference(), "image_url": "https://s3.example/image?signature=secret"}
        error = BadRequestError(
            "Could not download " + image["image_url"],
            response=httpx.Response(400, request=httpx.Request("POST", "https://api.example/completions")),
            body={"error": image["image_url"]},
        )
        client = Mock()
        client.chat.completions.create = AsyncMock(side_effect=error)
        with patch.object(chat_llm, "_client", return_value=client):
            with self.assertLogs(chat_llm.logger, level="INFO") as logs:
                with self.assertRaisesRegex(RuntimeError, "HTTP 400") as caught:
                    _ = [part async for part in chat_llm.stream_answer("Question", [image])]
        self.assertNotIn("signature", str(caught.exception))
        self.assertNotIn("signature", " ".join(logs.output))

    async def test_delete_paginated_document_images_and_report_errors(self):
        async def pages(**kwargs):
            self.assertEqual(kwargs["Prefix"], repo.document_image_prefix(USER, DOC))
            yield {"Contents": [{"Key": "key1"}]}
            yield {"Contents": [{"Key": "key2"}]}
        client = Mock(delete_objects=AsyncMock(return_value={}))
        client.get_paginator.return_value.paginate = pages
        await repo.delete_document_images(client, user_id=USER, document_id=DOC)
        self.assertEqual(client.delete_objects.await_count, 2)
        client.delete_objects.return_value = {"Errors": [{"Code": "AccessDenied"}]}
        with self.assertRaisesRegex(RuntimeError, "cleanup failed"):
            await repo.delete_document_images(client, user_id=USER, document_id=DOC)

    def test_s3_config_rejects_endpoints_and_unsafe_prefixes(self):
        self.assertEqual(settings.image_s3_location, ("test-image-bucket", "medical-images"))
        for value in ("", "https://example.com/images", "s3://bucket/a/../b", "s3://bucket/prefix?key=bad"):
            with self.subTest(value=value), patch.object(settings, "image_s3_url", value):
                with self.assertRaises(ValueError):
                    _ = settings.image_s3_location

    async def test_delete_endpoint_locks_document_and_removes_images_before_db_row(self):
        db = AsyncMock()
        db.scalar.return_value = SimpleNamespace(
            s3_bucket="document-bucket", s3_prefix="document-prefix",
            qdrant_point_ids=[], ingestion_status="SECURED",
        )
        resource = Mock(Bucket=AsyncMock(return_value=Mock(delete_objects=AsyncMock(return_value={}))))
        cleanup = AsyncMock()
        with ExitStack() as patches:
            patches.enter_context(patch.object(aws, "s3", resource))
            patches.enter_context(patch.object(repo, "delete_document_images", cleanup))
            patches.enter_context(patch.object(documents, "_remove_if_present", AsyncMock()))
            patches.enter_context(patch.object(documents.jobs, "get_job", Mock(return_value=None)))
            patches.enter_context(patch.object(documents.events, "publish_document_event", AsyncMock()))
            patches.enter_context(patch("app.celery_app.celery_app.control.revoke", Mock()))
            await documents.delete_document(DOC, Response(), user=SimpleNamespace(id=uuid.UUID(USER)), db=db)
        self.assertIsNotNone(db.scalar.await_args.args[0]._for_update_arg)
        cleanup.assert_awaited_once_with(resource.meta.client, user_id=USER, document_id=DOC)
        db.delete.assert_awaited_once()
        db.commit.assert_awaited_once()

    async def test_delete_endpoint_keeps_db_row_if_image_cleanup_fails(self):
        db = AsyncMock()
        db.scalar.return_value = SimpleNamespace(s3_bucket="document-bucket", s3_prefix="prefix")
        with patch.object(aws, "s3", Mock()), \
                patch.object(repo, "delete_document_images", AsyncMock(side_effect=RuntimeError("cleanup failed"))), \
                patch.object(documents, "_remove_if_present", AsyncMock()):
            with self.assertRaises(HTTPException) as caught:
                await documents.delete_document(DOC, Response(), user=SimpleNamespace(id=uuid.UUID(USER)), db=db)
        self.assertEqual(caught.exception.status_code, 502)
        db.delete.assert_not_awaited()
        db.commit.assert_not_awaited()


class PublicationTests(ImageTestCase):
    """Exercise the actual worker orchestration with mocked service boundaries."""
    async def run_pipeline(self, *, deleted=False, upload_error=None, index_error=None, handwriting=False, notification_error=None):
        doc = SimpleNamespace(user_id=USER, original_filename="scan.png", mime_type="image/png",
                              s3_bucket="documents", s3_prefix="original", qdrant_point_ids=[])
        initial, final, error_session = AsyncMock(), AsyncMock(), AsyncMock()
        initial.get.return_value = doc
        final.get.return_value = None if deleted else doc
        error_session.get.return_value = doc
        sessions = iter([initial, final, error_session])
        def session_factory():
            session = next(sessions)
            session.__aenter__.return_value = session
            return session
        engine = Mock(dispose=AsyncMock())
        store = Mock(ensure_collection=AsyncMock(), close=AsyncMock(),
                     delete_document_points=AsyncMock(), delete_points=AsyncMock())
        client = Mock(put_object=AsyncMock(side_effect=upload_error), delete_objects=AsyncMock(return_value={}))
        order = []
        async def upsert(points):
            self.assertEqual(final.get.await_args.kwargs, {"with_for_update": True})
            self.assertEqual(client.put_object.await_count, 1)
            self.assertIn("image_s3_key", points[0].payload)
            order.append("index")
            if index_error:
                raise index_error
        store.upsert = AsyncMock(side_effect=upsert)
        self.last_store = store
        self.last_client = client
        image = image_item()
        if handwriting:
            image["image_type"] = "HANDWRITING"
        point = SimpleNamespace(id="point-1", payload={"image_id": image["image_id"]})
        @asynccontextmanager
        async def s3_client():
            yield client
        async def publish(*args, **kwargs):
            if args[2] == "INDEXED" and notification_error:
                raise notification_error
        http = AsyncMock()
        with ExitStack() as patches:
            replacements = {
                "create_async_engine": Mock(return_value=engine),
                "async_sessionmaker": Mock(return_value=session_factory),
                "QdrantStore": Mock(return_value=store),
                "_resolve_pdf": AsyncMock(return_value=(Path("not-on-disk.pdf"), None)),
                "extract_content": AsyncMock(return_value=([], [], [copy.deepcopy(image)])),
                "build_image_chain": Mock(), "build_embedding_model": Mock(),
                "upload_table_chunks": AsyncMock(return_value=[]),
                "upload_text_chunks": AsyncMock(return_value=[]),
                "process_all": AsyncMock(return_value=[{"classification": "RELEVANT", "image_type": image["image_type"], "summary": "scan"}]),
                "build_image_chunks": AsyncMock(return_value=([point], [image])),
                "render_pages_base64": AsyncMock(return_value={1: image_data("blue")}),
            }
            for name, replacement in replacements.items():
                patches.enter_context(patch.object(pipeline, name, replacement))
            patches.enter_context(patch.object(pipeline.aws, "task_s3_client", s3_client))
            patches.enter_context(patch.object(pipeline.aws, "kms", None))
            patches.enter_context(patch.object(pipeline.events, "publish_document_event", AsyncMock(side_effect=publish)))
            patches.enter_context(patch.object(pipeline.events, "create_task_redis", Mock()))
            patches.enter_context(patch.object(pipeline.httpx, "AsyncClient", Mock(return_value=http)))
            patches.enter_context(patch.object(pipeline.aiofiles.os.path, "exists", AsyncMock(return_value=False)))
            result = await pipeline._run_ingestion_inner(DOC, USER, retrying=True)
        return result, client, store, final, image

    async def test_worker_uploads_before_index_and_commits_without_image_db_write(self):
        result, client, store, final, _ = await self.run_pipeline(handwriting=True)
        self.assertEqual(result, "INDEXED")
        store.upsert.assert_awaited_once()
        final.execute.assert_not_awaited()
        final.commit.assert_awaited_once()
        client.delete_objects.assert_not_awaited()
        with Image.open(io.BytesIO(client.put_object.await_args.kwargs["Body"])) as uploaded:
            self.assertGreater(uploaded.getpixel((30, 30))[2], 240)

    async def test_deleted_document_never_uploads_or_publishes_images(self):
        result, client, store, _, _ = await self.run_pipeline(deleted=True)
        self.assertEqual(result, "SKIPPED")
        client.put_object.assert_not_awaited()
        store.upsert.assert_not_awaited()
        store.delete_document_points.assert_awaited_once_with(USER, DOC)

    async def test_failed_qdrant_publish_cleans_uploaded_objects(self):
        # Capture clients by wrapping the cleanup boundary while the error propagates.
        with patch.object(pipeline, "delete_image_keys", AsyncMock()) as cleanup:
            with self.assertRaises(TransientIngestionError):
                await self.run_pipeline(index_error=ConnectionError("Qdrant unavailable"))
            cleanup.assert_awaited_once()
            self.assertEqual(len(cleanup.await_args.args[2]), 1)

    async def test_s3_failure_is_retryable_and_cleans_attempted_key(self):
        failure = ClientError({"Error": {"Code": "ServiceUnavailable", "Message": "retry"}}, "PutObject")
        with patch.object(pipeline, "delete_image_keys", AsyncMock()) as cleanup:
            with self.assertRaises(TransientIngestionError):
                await self.run_pipeline(upload_error=failure)
            cleanup.assert_awaited_once()

    async def test_cancellation_rolls_back_search_and_uploaded_objects(self):
        with patch.object(pipeline, "delete_image_keys", AsyncMock()) as cleanup:
            with self.assertRaises(asyncio.CancelledError):
                await self.run_pipeline(index_error=asyncio.CancelledError())
            cleanup.assert_awaited_once()

    async def test_s3_connection_failure_uses_celery_retry_path(self):
        with patch.object(pipeline, "delete_image_keys", AsyncMock()) as cleanup:
            with self.assertRaises(TransientIngestionError):
                await self.run_pipeline(upload_error=EndpointConnectionError(endpoint_url="https://s3.example"))
            cleanup.assert_awaited_once()

    async def test_post_commit_cancellation_preserves_published_images_and_index(self):
        with self.assertRaises(asyncio.CancelledError):
            await self.run_pipeline(notification_error=asyncio.CancelledError())
        self.last_client.delete_objects.assert_not_awaited()
        self.last_store.delete_points.assert_not_awaited()
        self.last_store.delete_document_points.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
