from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(
    settings.async_database_url,
    connect_args=settings.async_database_connect_args,
    pool_pre_ping=True,
    pool_recycle=300,
)

SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    from . import models  # noqa: F401  (register models on Base.metadata)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
