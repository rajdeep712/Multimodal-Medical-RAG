"""Real SDK calls against local transports across sequential/concurrent loops."""
import asyncio
import base64
import io
import json
import threading
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

import httpx
from PIL import Image

from app import aws, events
from app.document_decryption import download_encrypted_package
from app.ingestion import pipeline
from app.ingestion.embeddings import build_embedding_model
from app.ingestion.image_pipeline import build_image_chain, process_all
from app.ingestion.errors import TransientIngestionError


RESULT = {"classification": "RELEVANT", "image_type": "MEDICAL_SCAN", "summary": "A scan."}


class LoopTransport(httpx.AsyncBaseTransport):
    def __init__(self, *, kind, observations, delay=0):
        self.owner = asyncio.get_running_loop()
        self.kind = kind
        self.observations = observations
        self.delay = delay
        self.closed = False

    async def handle_async_request(self, request):
        if self.closed or asyncio.get_running_loop() is not self.owner:
            raise RuntimeError("HTTP transport reused outside its owning event loop")
        await asyncio.sleep(self.delay)
        self.observations.append((self.kind, id(self.owner)))
        if self.kind == "image":
            return httpx.Response(200, json={
                "id": "test", "object": "chat.completion", "created": 0, "model": "test",
                "choices": [{"index": 0, "message": {"role": "assistant", "content": json.dumps(RESULT)},
                             "finish_reason": "stop"}],
            })
        return httpx.Response(200, json={
            "object": "list", "model": "test",
            "data": [{"object": "embedding", "index": 0, "embedding": [0.1, 0.2, 0.3]}],
            "usage": {"prompt_tokens": 1, "total_tokens": 1},
        })

    async def aclose(self):
        if asyncio.get_running_loop() is not self.owner:
            raise RuntimeError("HTTP transport closed on a different loop")
        self.closed = True


class MultiLoopTests(unittest.TestCase):
    def exercise(self, barrier=None, delay=0):
        async def document():
            seen = []
            image_transport = LoopTransport(kind="image", observations=seen, delay=delay)
            embedding_transport = LoopTransport(kind="embedding", observations=seen, delay=delay)
            async with httpx.AsyncClient(transport=image_transport) as image_http, \
                    httpx.AsyncClient(transport=embedding_transport) as embedding_http:
                chain = build_image_chain(http_async_client=image_http)
                model = build_embedding_model(http_async_client=embedding_http)
                self.assertIs(model.http_async_client, embedding_http)
                if barrier:
                    barrier.wait(timeout=15)
                for _ in range(2):
                    self.assertEqual(await chain.ainvoke("test-image"), RESULT)
                    self.assertEqual(await model.aembed_query("test-query"), [0.1, 0.2, 0.3])
            self.assertTrue(image_http.is_closed)
            self.assertTrue(embedding_http.is_closed)
            self.assertTrue(image_transport.closed)
            self.assertTrue(embedding_transport.closed)
            self.assertEqual(len(seen), 4)
            return image_transport, embedding_transport
        return asyncio.run(document())

    def test_sequential_documents_use_fresh_clients_after_previous_loop_closes(self):
        first = self.exercise()
        self.assertTrue(first[0].owner.is_closed())
        second = self.exercise()
        self.assertIsNot(first[0].owner, second[0].owner)
        self.assertIsNot(first[1], second[1])

    def test_parallel_document_finishing_does_not_close_other_documents_clients(self):
        barrier = threading.Barrier(2)
        with ThreadPoolExecutor(max_workers=2) as threads:
            fast = threads.submit(self.exercise, barrier, 0)
            slow = threads.submit(self.exercise, barrier, 0.03)
            fast_result, slow_result = fast.result(timeout=30), slow.result(timeout=30)
        self.assertIsNot(fast_result[0].owner, slow_result[0].owner)
        self.assertTrue(fast_result[0].closed)
        self.assertTrue(slow_result[0].closed)


class FailureAndRecoveryTests(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def images():
        buffer = io.BytesIO()
        Image.new("RGB", (128, 128), "white").save(buffer, format="PNG")
        encoded = base64.b64encode(buffer.getvalue()).decode()
        return [{"base64Image": encoded}, {"base64Image": encoded}]

    async def test_image_failure_is_retryable_and_other_requests_are_drained(self):
        completed = []
        async def analyze(_):
            if not completed:
                completed.append("failed")
                raise RuntimeError("Event loop is closed")
            await asyncio.sleep(0.01)
            completed.append("finished")
            return RESULT
        with self.assertRaisesRegex(TransientIngestionError, "Image analysis failed"):
            await process_all(Mock(ainvoke=AsyncMock(side_effect=analyze)), self.images())
        self.assertEqual(completed, ["failed", "finished"])

    async def test_genuinely_irrelevant_image_is_still_a_valid_analysis(self):
        irrelevant = {"classification": "IRRELEVANT", "image_type": "LOGO", "summary": ""}
        result = await process_all(Mock(ainvoke=AsyncMock(return_value=irrelevant)), self.images()[:1])
        self.assertEqual(result, [irrelevant])

    async def test_redis_event_client_closes_before_task_loop_finishes(self):
        for failure in (None, ConnectionError("Redis unavailable")):
            client = Mock(publish=AsyncMock(side_effect=failure), aclose=AsyncMock())
            with patch.object(events, "create_task_redis", return_value=client):
                if failure:
                    with self.assertRaises(ConnectionError):
                        await events.publish_document_event("user", "doc", "PROCESSING")
                else:
                    await events.publish_document_event("user", "doc", "PROCESSING")
            client.aclose.assert_awaited_once()

    async def test_pdf_recovery_uses_private_aws_clients_without_touching_globals(self):
        s3_resource, kms_client = object(), object()
        closed = []
        @asynccontextmanager
        async def private_clients():
            try:
                yield s3_resource, kms_client
            finally:
                closed.append(True)
        download = AsyncMock(return_value={})
        verify = AsyncMock()
        with patch.object(Path, "is_file", return_value=False), \
                patch.object(aws, "task_aws_clients", private_clients), \
                patch.object(aws, "init_aws", AsyncMock(side_effect=AssertionError("global AWS init"))), \
                patch.object(aws, "close_aws", AsyncMock(side_effect=AssertionError("global AWS close"))), \
                patch.object(pipeline, "download_encrypted_package", download), \
                patch.object(pipeline, "verify_and_decrypt_document", verify):
            _, temp = await pipeline._resolve_pdf("doc", "user", "bucket", "prefix")
        self.addCleanup(temp.cleanup)
        self.assertIs(download.await_args.kwargs["s3_resource"], s3_resource)
        self.assertIs(verify.await_args.kwargs["kms_client"], kms_client)
        self.assertEqual(closed, [True])

    async def test_failed_package_download_drains_other_s3_requests(self):
        completed = []
        async def download(key, destination, **kwargs):
            if key.endswith("ciphertext.bin"):
                raise ConnectionError("download failed")
            await asyncio.sleep(0.01)
            completed.append(key)
        bucket = Mock(download_file=AsyncMock(side_effect=download))
        resource = Mock(Bucket=AsyncMock(return_value=bucket))
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ConnectionError, "download failed"):
                await download_encrypted_package(
                    bucket="bucket", prefix="prefix", output_directory=Path(directory),
                    s3_resource=resource,
                )
        self.assertEqual(len(completed), 2)


if __name__ == "__main__":
    unittest.main()
