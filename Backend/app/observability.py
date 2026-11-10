"""Logfire tracing shared by the FastAPI process and the ingestion worker.

Configure once per process at startup; every `logfire.span(...)` / log call
afterwards is reported to the Logfire project when LOGFIRE_API_KEY is set.
Without a key everything still renders locally in the console.
"""

from __future__ import annotations

import logging

from .config import settings

_configured_services: set[str] = set()


def configure_observability(service_name: str) -> None:
    """Set up Logfire for one process (call once at startup)."""
    import logfire

    if service_name in _configured_services:
        return
    _configured_services.add(service_name)

    token = (settings.logfire_api_key or "").strip() or None
    logfire.configure(
        service_name=service_name,
        environment=settings.logfire_environment,
        token=token,
        send_to_logfire=token is not None,
        console=False,
    )

    # Bridge the app's existing std-logging output (logger.info/exception
    # across jobs, routers, pipeline) into Logfire as log records.
    try:
        handler = logfire.LogfireHandler()
        logging.getLogger().addHandler(handler)
    except Exception:
        pass

    # HTTP-level spans for the PII / BioMedCLIP / image-LLM calls.
    try:
        logfire.instrument_httpx()
    except Exception:
        pass
