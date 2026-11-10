"""PII detection service client (notebook cell 50, async).

TEMPORARY behaviour (to be removed once the PII tunnel is stable): when the
PII service is unreachable or its Cloudflare tunnel reports the origin down,
the batch is passed through WITHOUT redaction instead of failing the whole
ingestion. Every skip is traced in Logfire.
"""

from __future__ import annotations

import asyncio
import logging

import httpx
import logfire

from ..config import settings

logger = logging.getLogger(__name__)

BATCH_PATH = "/detect-pii/batch"

# Transient network failures (e.g. the flaky dynamic-DNS tunnel hostname)
# are retried instead of failing the whole document ingestion.
TRANSIENT_ERRORS = (httpx.ConnectError, httpx.ConnectTimeout)
RETRY_DELAYS = (2.0, 5.0)

# Cloudflare statuses that mean the tunnel/origin is down.
TUNNEL_DOWN_STATUS_CODES = {520, 521, 522, 523, 524, 527, 530}


def _passthrough_results(texts: list[str], reason: str) -> list[dict]:
    """Return unredacted results so ingestion can continue without PII."""
    logfire.warning(
        "PII service unavailable - skipping PII redaction for this batch",
        reason=reason,
        batch_size=len(texts),
    )
    logger.warning("PII service unavailable (%s); skipping redaction", reason)
    return [{"redacted_text": text, "pii_skipped": True} for text in texts]


def _batch_url() -> str:
    """Accept both the bare service URL and a URL that already ends with the
    batch path."""
    base_url = settings.pii_api_url.rstrip("/")
    if base_url.endswith(BATCH_PATH):
        return base_url
    return f"{base_url}{BATCH_PATH}"


async def detect_pii_batch(client: httpx.AsyncClient, texts: list[str]) -> list[dict]:
    """Detect and redact PII for a batch of texts via the PII service.

    If the service is unreachable (connection failures after retries, or a
    Cloudflare tunnel-down status), the batch passes through unredacted.
    """
    response: httpx.Response | None = None
    try:
        response = await post_with_retry(
            client,
            _batch_url(),
            {"texts": texts},
            label="pii-detection",
            timeout=settings.pii_api_timeout_seconds,
        )
    except TRANSIENT_ERRORS as exc:
        logfire.warning(
            "PII service unreachable - skipping PII redaction",
            error=str(exc) or exc.__class__.__name__,
            batch_size=len(texts),
        )
        logger.warning("PII service unreachable (%s); skipping redaction", exc)
        return _passthrough_results(texts, f"unreachable: {exc.__class__.__name__}")

    if response.status_code in TUNNEL_DOWN_STATUS_CODES:
        return _passthrough_results(texts, f"HTTP {response.status_code} (tunnel down)")

    response.raise_for_status()

    return response.json()["results"]


async def post_with_retry(client: httpx.AsyncClient, url: str, payload: dict, *, label: str, timeout: float) -> httpx.Response:
    """POST with retries on transient connection failures."""
    for attempt in range(1 + len(RETRY_DELAYS)):
        try:
            return await client.post(url, json=payload, timeout=timeout)
        except TRANSIENT_ERRORS as exc:
            if attempt >= len(RETRY_DELAYS):
                raise
            delay = RETRY_DELAYS[attempt]
            logfire.info(
                "transient connect failure, retrying",
                label=label,
                attempt=attempt + 1,
                retry_in_seconds=delay,
                error=str(exc) or exc.__class__.__name__,
            )
            logger.warning(
                "%s call failed (%s), retrying in %ss", label, exc, delay
            )
            await asyncio.sleep(delay)
