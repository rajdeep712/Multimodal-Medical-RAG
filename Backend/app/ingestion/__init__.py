"""Async port of the exp_unstructured.ipynb ingestion pipeline.

Module layout:
- content.py           partition_pdf + table/text/image splitting (cells 0/9/10/13)
- pii.py               batch PII detection service client (cell 50)
- embeddings.py        local OpenAI-compatible text embedding model (cells 43/48)
- qdrant_store.py      async Qdrant collection management (cells 36/45)
- text_pipeline.py     table + text embedding and Qdrant upload (cells 51/54)
- image_pipeline.py    image LLM analysis + BioMedCLIP embeddings (cells 26-31/62)
- image_repository.py  bulk insert of relevant images into PostgreSQL
- pipeline.py          orchestration and status updates
- tasks.py             Celery task entry point
- warmup.py            one-time unstructured model warmup at worker start

The notebook code is retained as exactly as possible; only blocking
boundaries were converted to async (aembed_documents, chain.ainvoke,
httpx.AsyncClient, AsyncQdrantClient, asyncio.to_thread).
"""
