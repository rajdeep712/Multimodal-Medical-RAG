from __future__ import annotations

import logging
from contextlib import AsyncExitStack, asynccontextmanager
from typing import Any

import aioboto3
from aiobotocore.config import AioConfig

from .config import settings

logger = logging.getLogger(__name__)

# Single botocore session for the whole application, started once at server
# startup (mirrors the AWS client setup in protect.ipynb).
AWS_CONFIG = AioConfig(
    region_name=settings.aws_region,
    retries={
        "max_attempts": 5,
        "mode": "adaptive",
    },
    connect_timeout=10,
    read_timeout=60,
)
# SSE-KMS object downloads require Signature Version 4, including presigned GETs.
S3_CONFIG = AWS_CONFIG.merge(AioConfig(signature_version="s3v4"))

session = aioboto3.Session()  # Uses the normal AWS credential chain.

_exit_stack: AsyncExitStack | None = None

# Shared async clients, populated by init_aws() during app startup and closed
# by close_aws() during shutdown. Only share within the FastAPI event loop.
kms: Any = None
s3: Any = None


@asynccontextmanager
async def task_s3_client():
    """One task-local connection pool; never share it across Celery event loops."""
    async with aioboto3.Session().client("s3", config=S3_CONFIG) as client:
        yield client


@asynccontextmanager
async def task_aws_clients():
    """Private S3/KMS clients for a worker's recovery/decryption operation."""
    task_session = aioboto3.Session()
    async with AsyncExitStack() as stack:
        s3_resource = await stack.enter_async_context(task_session.resource("s3", config=S3_CONFIG))
        kms_client = await stack.enter_async_context(task_session.client("kms", config=AWS_CONFIG))
        yield s3_resource, kms_client


def api_s3_client():
    """Reuse the FastAPI lifespan client for local URL signing."""
    if s3 is None:
        raise RuntimeError("S3 is not initialized")
    return s3.meta.client


async def init_aws() -> None:
    global _exit_stack, kms, s3

    _exit_stack = AsyncExitStack()
    kms = await _exit_stack.enter_async_context(
        session.client(
            "kms",
            config=AWS_CONFIG,
        )
    )
    s3 = await _exit_stack.enter_async_context(
        session.resource(
            "s3",
            config=S3_CONFIG,
        )
    )
    logger.info("AWS clients initialized.")


async def close_aws() -> None:
    global _exit_stack, kms, s3

    if _exit_stack is not None:
        await _exit_stack.aclose()
        _exit_stack = None
    kms = None
    s3 = None
    logger.info("AWS clients closed.")
