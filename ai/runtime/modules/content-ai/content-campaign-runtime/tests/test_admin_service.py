import unittest
from types import SimpleNamespace
from uuid import uuid4

from app.services.admin_service import AdminService


class AdminServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_user_with_database_admin_flag_is_admin(self):
        service = AdminService()
        result = await service.is_admin(
            object(),
            SimpleNamespace(id=uuid4(), username="ops", is_admin=True, is_active=True),
        )

        self.assertTrue(result)

    async def test_environment_username_is_not_runtime_admin(self):
        service = AdminService()
        result = await service.is_admin(
            object(),
            SimpleNamespace(id=uuid4(), username="operator", is_admin=False, is_active=True),
        )
        self.assertFalse(result)

    async def test_inactive_database_admin_is_not_admin(self):
        service = AdminService()
        result = await service.is_admin(
            object(),
            SimpleNamespace(id=uuid4(), username="ops", is_admin=True, is_active=False),
        )
        self.assertFalse(result)


if __name__ == "__main__":
    unittest.main()
