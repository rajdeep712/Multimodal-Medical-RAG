from __future__ import annotations

import logging
from contextlib import AsyncExitStack
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

session = aioboto3.Session()  # Uses the normal AWS credential chain.

_exit_stack: AsyncExitStack | None = None

# Shared async clients, populated by init_aws() during app startup and closed
# by close_aws() during shutdown. Safe to use from concurrent tasks.
kms: Any = None
s3: Any = None


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
            config=AWS_CONFIG,
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
