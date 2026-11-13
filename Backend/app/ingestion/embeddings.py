"""Local text embedding model (notebook cells 43 and 48, async)."""

from __future__ import annotations

from functools import lru_cache

from langchain_openai import OpenAIEmbeddings

from ..config import settings


@lru_cache(maxsize=1)
def build_embedding_model() -> OpenAIEmbeddings:
    return OpenAIEmbeddings(
        model=settings.text_embedding_model,
        base_url=settings.text_embedding_base_url,
        api_key=settings.text_embedding_api_key or "lm-studio",
        check_embedding_ctx_length=False,
    )


def get_embedding_model() -> OpenAIEmbeddings:
    """Process-wide cached instance — avoids rebuilding the httpx stack per query."""
    return build_embedding_model()


async def embed_texts(embedding_model: OpenAIEmbeddings, texts: list[str]) -> list[list[float]]:
    """
    Generate embeddings for a batch of texts.
    """
    embeddings = await embedding_model.aembed_documents(texts)
    return embeddings
