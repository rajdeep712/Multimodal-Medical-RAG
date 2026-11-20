"""Local text embedding model (notebook cells 43 and 48, async)."""

from __future__ import annotations

from functools import lru_cache

import httpx
from langchain_openai import OpenAIEmbeddings

from ..config import settings


def build_embedding_model(*, http_async_client: httpx.AsyncClient | None = None) -> OpenAIEmbeddings:
    """Build an ingestion client; the caller owns its task-local HTTP transport."""
    return OpenAIEmbeddings(
        model=settings.text_embedding_model,
        base_url=settings.text_embedding_base_url,
        api_key=settings.text_embedding_api_key or "lm-studio",
        check_embedding_ctx_length=False,
        http_async_client=http_async_client,
    )


@lru_cache(maxsize=1)
def get_embedding_model() -> OpenAIEmbeddings:
    """Cached only for FastAPI retrieval, which uses one persistent event loop."""
    return build_embedding_model()


async def embed_texts(embedding_model: OpenAIEmbeddings, texts: list[str]) -> list[list[float]]:
    """
    Generate embeddings for a batch of texts.
    """
    embeddings = await embedding_model.aembed_documents(texts)
    return embeddings
