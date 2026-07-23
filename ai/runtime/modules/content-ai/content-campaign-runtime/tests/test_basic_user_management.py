import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from app.core.runtime_context import (
    RuntimeIdentity,
    platform_user_id,
    reset_runtime_identity,
    set_runtime_identity,
)


class ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class PlatformIdentityTests(unittest.IsolatedAsyncioTestCase):
    def test_shadow_user_id_is_stable_and_tenant_scoped(self):
        identity = RuntimeIdentity("tenant-a", "subject-1", "运营员")
        self.assertEqual(platform_user_id(identity), platform_user_id(identity))
        self.assertNotEqual(
            platform_user_id(identity),
            platform_user_id(RuntimeIdentity("tenant-b", "subject-1", "运营员")),
        )

    async def test_platform_subject_creates_local_shadow_user(self):
        from app.dependencies.auth import get_current_user

        identity = RuntimeIdentity("tenant-a", "subject-1", "运营员")
        token = set_runtime_identity(identity)
        db = SimpleNamespace(
            execute=AsyncMock(return_value=ScalarResult(None)),
            add=Mock(),
            flush=AsyncMock(),
        )
        try:
            user = await get_current_user(db)
        finally:
            reset_runtime_identity(token)

        self.assertEqual(user.id, platform_user_id(identity))
        self.assertEqual(user.nickname, "运营员")
        self.assertEqual(user.password_hash, "!managed-by-core-control-plane!")
        db.add.assert_called_once_with(user)
        db.flush.assert_awaited_once()

    async def test_optional_dependency_has_no_anonymous_mode(self):
        from app.dependencies.auth import get_current_user_optional

        identity = RuntimeIdentity("tenant-a", "subject-1", "运营员")
        existing = SimpleNamespace(
            id=platform_user_id(identity),
            nickname="运营员",
            is_active=True,
        )
        token = set_runtime_identity(identity)
        db = SimpleNamespace(execute=AsyncMock(return_value=ScalarResult(existing)))
        try:
            user = await get_current_user_optional(db)
        finally:
            reset_runtime_identity(token)

        self.assertIs(user, existing)

    def test_legacy_auth_and_admin_routes_are_not_registered(self):
        from app.main import app

        paths = {route.path for route in app.routes}
        self.assertNotIn("/api/v1/auth/login", paths)
        self.assertFalse(any(path.startswith("/api/v1/admin") for path in paths))

    def test_user_model_retains_relationship_compatibility_fields(self):
        from app.models.user import User

        self.assertIn("is_active", User.__table__.columns)
        self.assertIn("is_admin", User.__table__.columns)


if __name__ == "__main__":
    unittest.main()
