import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from fastapi import HTTPException
from fastapi import FastAPI
from fastapi.testclient import TestClient


class AdminUserApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_list_users_requires_admin(self):
        from app.api.v1 import admin as admin_api

        with patch.object(admin_api.admin_service, "is_admin", AsyncMock(return_value=False)):
            with self.assertRaises(HTTPException) as ctx:
                await admin_api.list_users(
                    current_user=SimpleNamespace(id=uuid4(), username="lee"),
                    db=object(),
                )

        self.assertEqual(ctx.exception.status_code, 403)

    async def test_admin_can_grant_admin_to_user(self):
        from app.api.v1 import admin as admin_api

        target = SimpleNamespace(
            id=uuid4(),
            username="ops",
            is_admin=True,
            is_active=True,
            nickname=None,
            created_at=datetime(2026, 1, 1),
        )

        with patch.object(admin_api.admin_service, "is_admin", AsyncMock(return_value=True)):
            with patch.object(admin_api.user_admin_service, "set_user_admin", AsyncMock(return_value=target)) as set_mock:
                result = await admin_api.set_user_admin(
                    target.id,
                    admin_api.SetUserAdminRequest(is_admin=True),
                    current_user=SimpleNamespace(id=uuid4(), username="admin"),
                    db=object(),
                )

        set_mock.assert_awaited_once()
        self.assertTrue(result.is_admin)

    async def test_admin_cannot_demote_self(self):
        from app.api.v1 import admin as admin_api

        user_id = uuid4()
        with patch.object(admin_api.admin_service, "is_admin", AsyncMock(return_value=True)):
            with self.assertRaises(HTTPException) as ctx:
                await admin_api.set_user_admin(
                    user_id,
                    admin_api.SetUserAdminRequest(is_admin=False),
                    current_user=SimpleNamespace(id=user_id, username="admin"),
                    db=object(),
                )

        self.assertEqual(ctx.exception.status_code, 400)

    async def test_admin_can_list_users_with_server_side_filters(self):
        from app.api.v1 import admin as admin_api

        target = SimpleNamespace(
            id=uuid4(), username="ops", nickname="运营", is_admin=False,
            is_active=True, created_at=datetime(2026, 1, 1),
        )
        page_result = SimpleNamespace(items=[target], total=1)
        with patch.object(admin_api.admin_service, "is_admin", AsyncMock(return_value=True)):
            with patch.object(admin_api.user_admin_service, "list_users", AsyncMock(return_value=page_result)) as list_mock:
                result = await admin_api.list_users(
                    keyword="op", role="user", user_status="active", page=2, page_size=20,
                    current_user=SimpleNamespace(id=uuid4(), username="admin", is_admin=True),
                    db=object(),
                )

        list_mock.assert_awaited_once_with(
            unittest.mock.ANY,
            keyword="op", role="user", status="active", page=2, page_size=20,
        )
        self.assertEqual(result.total, 1)
        self.assertEqual(result.items[0].nickname, "运营")

    async def test_admin_can_create_user(self):
        from app.api.v1 import admin as admin_api

        target = SimpleNamespace(
            id=uuid4(), username="new-user", nickname=None, is_admin=False,
            is_active=True, created_at=datetime(2026, 1, 1),
        )
        with patch.object(admin_api.admin_service, "is_admin", AsyncMock(return_value=True)):
            with patch.object(admin_api.user_admin_service, "create_user", AsyncMock(return_value=target)) as create_mock:
                result = await admin_api.create_user(
                    admin_api.CreateUserRequest(username="new-user", password="secret12", is_admin=False),
                    current_user=SimpleNamespace(id=uuid4(), username="admin", is_admin=True),
                    db=object(),
                )

        create_mock.assert_awaited_once_with(unittest.mock.ANY, "new-user", "secret12", False)
        self.assertTrue(result.is_active)

    async def test_admin_cannot_disable_self(self):
        from app.api.v1 import admin as admin_api

        user_id = uuid4()
        with patch.object(admin_api.admin_service, "is_admin", AsyncMock(return_value=True)):
            with self.assertRaises(HTTPException) as ctx:
                await admin_api.set_user_status(
                    user_id,
                    admin_api.SetUserStatusRequest(is_active=False),
                    current_user=SimpleNamespace(id=user_id, username="admin", is_admin=True),
                    db=object(),
                )

        self.assertEqual(ctx.exception.status_code, 400)

    async def test_admin_can_reset_password_without_returning_plaintext(self):
        from app.api.v1 import admin as admin_api

        with patch.object(admin_api.admin_service, "is_admin", AsyncMock(return_value=True)):
            with patch.object(admin_api.user_admin_service, "reset_password", AsyncMock(return_value=True)) as reset_mock:
                result = await admin_api.reset_user_password(
                    uuid4(),
                    admin_api.ResetUserPasswordRequest(password="new-secret"),
                    current_user=SimpleNamespace(id=uuid4(), username="admin", is_admin=True),
                    db=object(),
                )

        reset_mock.assert_awaited_once()
        self.assertIsNone(result)

    async def test_page_size_query_string_is_accepted(self):
        from app.api.v1 import admin as admin_api
        from app.core.db import get_async_session
        from app.dependencies.auth import get_current_user

        app = FastAPI()
        app.include_router(admin_api.router, prefix="/api/v1")
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            id=uuid4(), username="admin", is_admin=True, is_active=True,
        )
        app.dependency_overrides[get_async_session] = lambda: object()
        empty_page = SimpleNamespace(items=[], total=0)

        with patch.object(admin_api.admin_service, "is_admin", AsyncMock(return_value=True)):
            with patch.object(admin_api.user_admin_service, "list_users", AsyncMock(return_value=empty_page)):
                response = TestClient(app).get("/api/v1/admin/users?page_size=20")
                invalid_response = TestClient(app).get("/api/v1/admin/users?page_size=30")

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["page_size"], 20)
        self.assertEqual(invalid_response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
