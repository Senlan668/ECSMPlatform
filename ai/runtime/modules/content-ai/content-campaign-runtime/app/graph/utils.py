"""Tenant-scoped LangGraph checkpointer lifecycle."""
from __future__ import annotations

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import InMemorySaver

from app.core.config import settings
from app.core.runtime_context import tenant_hash


_checkpointers: dict[str, BaseCheckpointSaver] = {}
_connection_pools: dict[str, object] = {}


async def setup_checkpointer() -> BaseCheckpointSaver:
    key = tenant_hash()
    existing = _checkpointers.get(key)
    if existing is not None:
        return existing

    if settings.checkpoint_backend == "memory":
        checkpointer = InMemorySaver()
        _checkpointers[key] = checkpointer
        return checkpointer

    if not settings.postgres_uri:
        raise RuntimeError("POSTGRES_URI is required when CHECKPOINT_BACKEND=postgres")

    import psycopg
    from psycopg_pool import AsyncConnectionPool
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

    async with await psycopg.AsyncConnection.connect(
        settings.postgres_uri,
        autocommit=True,
    ) as setup_connection:
        await AsyncPostgresSaver(setup_connection).setup()

    pool = AsyncConnectionPool(
        conninfo=settings.postgres_uri,
        min_size=1,
        max_size=5,
        open=False,
    )
    await pool.open()
    checkpointer = AsyncPostgresSaver(pool)
    _connection_pools[key] = pool
    _checkpointers[key] = checkpointer
    return checkpointer


async def get_checkpointer() -> BaseCheckpointSaver:
    return await setup_checkpointer()


async def close_checkpointer() -> None:
    pools = list(_connection_pools.values())
    _connection_pools.clear()
    _checkpointers.clear()
    for pool in pools:
        await pool.close()
