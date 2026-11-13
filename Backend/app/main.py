from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .aws import close_aws, init_aws
from .config import settings
from .database import engine, init_db
from .events import close_events_redis
from .exceptions import SessionExpiredError, session_expired_handler
from .observability import configure_observability
from .routers import auth, chats, documents, private
from .routers.chats import close_biomedclip_http_client
from .services import close_auth0_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_observability("medical-rag-api")
    settings.ensure_upload_dirs()
    await init_aws()
    await init_db()

    # Pre-warm the first-token critical path so the FIRST chat query after a
    # restart doesn't pay the cold-connect penalties (Neon pool + Qdrant TLS).
    from .ingestion.qdrant_store import get_shared_client

    async def _prewarm() -> None:
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            await get_shared_client().get_collections()
            logger.info("Chat critical path pre-warmed (DB pool + Qdrant connection)")
        except Exception as exc:  # noqa: BLE001 — pre-warm is best-effort
            logger.warning("Chat pre-warm failed (will retry lazily): %s", exc)

    await _prewarm()
    yield
    await close_auth0_client()
    await close_events_redis()
    await close_aws()
    await close_biomedclip_http_client()
    await engine.dispose()
    from .ingestion.qdrant_store import _shared_client

    if _shared_client is not None:
        await _shared_client.close()


app = FastAPI(
    title="Medical RAG API",
    version="1.0.0",
    description="Secure FastAPI backend with Auth0 authentication and encrypted refresh-token storage.",
    lifespan=lifespan,
)

app.add_exception_handler(SessionExpiredError, session_expired_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(chats.router, prefix="/api/chats", tags=["chats"])
app.include_router(private.router, prefix="/api", tags=["private"])


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/", tags=["system"])
async def root() -> dict[str, str]:
    return {"name": "Medical RAG API", "docs": "/docs", "health": "/health"}
