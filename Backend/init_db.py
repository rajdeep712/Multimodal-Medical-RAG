import asyncio

from app.database import engine, init_db


async def main() -> None:
    await init_db()
    print("Database tables created/verified successfully.")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
