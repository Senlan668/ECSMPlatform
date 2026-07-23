import base64
import asyncio
import uuid
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.middleware import RuntimeSecurityMiddleware
from app.core.runtime_context import (
    RuntimeIdentity,
    get_runtime_identity,
    reset_runtime_identity,
    set_runtime_identity,
    tenant_static_path,
)


def _secured_test_app() -> FastAPI:
    app = FastAPI()

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/identity")
    async def identity():
        current = get_runtime_identity()
        return {
            "tenant_id": current.tenant_id,
            "subject_id": current.subject_id,
            "subject_name": current.subject_name,
        }

    app.add_middleware(RuntimeSecurityMiddleware)
    return app


def test_health_is_the_only_public_runtime_route():
    app = _secured_test_app()
    with patch.object(settings, "runtime_control_token", "runtime-secret"):
        with patch("app.core.db.ensure_tenant_database", new=AsyncMock()):
            client = TestClient(app)
            assert client.get("/health").status_code == 200
            response = client.get("/identity")

    assert response.status_code == 401
    assert response.json()["code"] == "RUNTIME_AUTHENTICATION_REQUIRED"


def test_runtime_identity_requires_all_trusted_headers_and_decodes_name():
    app = _secured_test_app()
    encoded_name = base64.urlsafe_b64encode("内容运营".encode()).decode().rstrip("=")
    headers = {
        "X-Runtime-Token": "runtime-secret",
        "X-Tenant-Id": "tenant-a",
        "X-Subject-Id": "user-1",
        "X-Subject-Username": "operator",
        "X-Subject-Name": encoded_name,
        "X-Subject-Name-Encoding": "base64url",
    }
    with patch.object(settings, "runtime_control_token", "runtime-secret"):
        with patch("app.core.db.ensure_tenant_database", new=AsyncMock()):
            client = TestClient(app)
            missing = client.get("/identity", headers={"X-Runtime-Token": "runtime-secret"})
            response = client.get("/identity", headers=headers)

    assert missing.status_code == 400
    assert response.status_code == 200
    assert response.json() == {
        "tenant_id": "tenant-a",
        "subject_id": "user-1",
        "subject_name": "内容运营",
    }


def test_chunked_request_body_is_limited_without_content_length():
    app_called = False
    sent = []
    chunks = iter([
        {"type": "http.request", "body": b"123", "more_body": True},
        {"type": "http.request", "body": b"456", "more_body": False},
    ])

    async def inner_app(scope, receive, send):
        nonlocal app_called
        app_called = True

    async def receive():
        return next(chunks)

    async def send(message):
        sent.append(message)

    scope = {
        "type": "http",
        "path": "/identity",
        "headers": [
            (b"x-runtime-token", b"runtime-secret"),
            (b"x-tenant-id", b"tenant-a"),
            (b"x-subject-id", b"user-1"),
            (b"x-subject-username", b"operator"),
            (b"x-subject-name", b"Operator"),
        ],
    }

    async def exercise():
        middleware = RuntimeSecurityMiddleware(inner_app)
        with patch.object(settings, "runtime_control_token", "runtime-secret"):
            with patch("app.core.middleware.MAX_REQUEST_BODY_BYTES", 5):
                await middleware(scope, receive, send)

    asyncio.run(exercise())

    assert app_called is False
    assert sent[0]["status"] == 413
    assert b"REQUEST_TOO_LARGE" in sent[1]["body"]


def test_static_storage_paths_are_physically_tenant_scoped(tmp_path):
    with patch.object(settings, "runtime_data_dir", str(tmp_path)):
        token_a = set_runtime_identity(RuntimeIdentity("tenant-a", "user-1", "A"))
        try:
            path_a = tenant_static_path("images/poster.png")
        finally:
            reset_runtime_identity(token_a)

        token_b = set_runtime_identity(RuntimeIdentity("tenant-b", "user-1", "B"))
        try:
            path_b = tenant_static_path("images/poster.png")
        finally:
            reset_runtime_identity(token_b)

    assert path_a != path_b
    assert path_a.name == path_b.name == "poster.png"
    assert "tenant-a" not in str(path_a)
    assert "tenant-b" not in str(path_b)


def test_langgraph_checkpointers_are_not_shared_between_tenants():
    from app.graph.utils import close_checkpointer, get_checkpointer

    async def exercise():
        token_a = set_runtime_identity(RuntimeIdentity("tenant-a", "user-1", "A"))
        try:
            checkpointer_a = await get_checkpointer()
        finally:
            reset_runtime_identity(token_a)

        token_b = set_runtime_identity(RuntimeIdentity("tenant-b", "user-1", "B"))
        try:
            checkpointer_b = await get_checkpointer()
        finally:
            reset_runtime_identity(token_b)

        assert checkpointer_a is not checkpointer_b
        await close_checkpointer()

    asyncio.run(exercise())


def test_sqlite_records_are_physically_isolated_by_tenant(tmp_path):
    from sqlalchemy import select

    from app.core.db import async_session_factory, close_db, ensure_tenant_database
    from app.models.user import User

    async def exercise():
        shared_id = platform_id = uuid.uuid4()
        token_a = set_runtime_identity(RuntimeIdentity("db-tenant-a", "user-1", "A"))
        try:
            await ensure_tenant_database()
            async with async_session_factory() as session:
                session.add(User(
                    id=platform_id,
                    username="tenant-a-user",
                    password_hash="!",
                    is_active=True,
                    is_admin=False,
                ))
                await session.commit()
        finally:
            reset_runtime_identity(token_a)

        token_b = set_runtime_identity(RuntimeIdentity("db-tenant-b", "user-1", "B"))
        try:
            await ensure_tenant_database()
            async with async_session_factory() as session:
                result = await session.execute(select(User).where(User.id == shared_id))
                assert result.scalar_one_or_none() is None
        finally:
            reset_runtime_identity(token_b)
        await close_db()

    with patch.object(settings, "runtime_data_dir", str(tmp_path)):
        asyncio.run(exercise())
