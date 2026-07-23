"""Tenant-scoped SQLAlchemy sessions backed by one SQLite file per tenant."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base

from app.core.config import settings
from app.core.runtime_context import current_tenant_id, tenant_hash, tenant_runtime_root


Base = declarative_base()


@dataclass
class _TenantDatabase:
    engine: AsyncEngine
    session_factory: async_sessionmaker[AsyncSession]
    lock: asyncio.Lock
    initialized: bool = False


_databases: dict[str, _TenantDatabase] = {}


def tenant_database_path(tenant_id: str | None = None) -> Path:
    return tenant_runtime_root(tenant_id) / "content-campaign.sqlite3"


def _database_for_current_tenant() -> _TenantDatabase:
    tenant_id = current_tenant_id()
    key = tenant_hash(tenant_id)
    database = _databases.get(key)
    if database is not None:
        return database

    database_path = tenant_database_path(tenant_id)
    database_path.parent.mkdir(parents=True, exist_ok=True)
    url = f"sqlite+aiosqlite:///{database_path.as_posix()}"
    engine = create_async_engine(
        url,
        echo=settings.debug,
        pool_pre_ping=True,
    )
    database = _TenantDatabase(
        engine=engine,
        session_factory=async_sessionmaker(
            bind=engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        ),
        lock=asyncio.Lock(),
    )
    _databases[key] = database
    return database


async def ensure_tenant_database() -> None:
    """Create the current tenant schema and seed immutable system templates once."""
    database = _database_for_current_tenant()
    if database.initialized:
        return

    async with database.lock:
        if database.initialized:
            return
        import app.models  # noqa: F401

        async with database.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        from scripts.seed_templates import seed_system_templates

        async with database.session_factory() as session:
            await seed_system_templates(session)
            await session.commit()
        database.initialized = True


class _TenantSessionFactory:
    """Compatibility proxy for services that open their own background session."""

    def __call__(self, *args, **kwargs) -> AsyncSession:
        database = _database_for_current_tenant()
        if not database.initialized:
            raise RuntimeError("tenant database must be initialized before opening a session")
        return database.session_factory(*args, **kwargs)


async_session_factory = _TenantSessionFactory()


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    await ensure_tenant_database()
    database = _database_for_current_tenant()
    async with database.session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Initialize the current request tenant database."""
    await ensure_tenant_database()


async def close_db() -> None:
    databases = list(_databases.values())
    _databases.clear()
    for database in databases:
        await database.engine.dispose()
