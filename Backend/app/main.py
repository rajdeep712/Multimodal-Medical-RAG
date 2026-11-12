from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .aws import close_aws, init_aws
from .config import settings
from .database import engine, init_db
from .events import close_events_redis
from .exceptions import SessionExpiredError, session_expired_handler
from .observability import configure_observability
from .routers import auth, chats, documents, private
from .services import close_auth0_client

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_observability("medical-rag-api")
    settings.ensure_upload_dirs()
    await init_aws()
    await init_db()
    yield
    await close_auth0_client()
    await close_events_redis()
    await close_aws()
    await engine.dispose()


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
