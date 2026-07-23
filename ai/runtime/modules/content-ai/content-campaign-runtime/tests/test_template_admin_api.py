import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from fastapi import HTTPException


class TemplateAdminApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_deactivate_public_template_requires_admin(self):
        from app.api.v1 import user_template as template_api

        with patch.object(template_api.admin_service, "is_admin", AsyncMock(return_value=False)):
            with self.assertRaises(HTTPException) as ctx:
                await template_api.deactivate_public_template(
                    uuid4(),
                    current_user=SimpleNamespace(id=uuid4(), username="lee"),
                    db=object(),
                )

        self.assertEqual(ctx.exception.status_code, 403)

    async def test_admin_can_deactivate_public_template(self):
        from app.api.v1 import user_template as template_api

        template = SimpleNamespace(
            id=uuid4(),
            user_id=None,
            name="公共喜报",
            description=None,
            thumbnail_url=None,
            category="通用",
            style_tag=None,
            config={},
            is_system=True,
            is_active=False,
            use_count=0,
            source_generation_id=None,
            created_at=None,
            updated_at=None,
        )

        with patch.object(template_api.admin_service, "is_admin", AsyncMock(return_value=True)):
            with patch.object(template_api.template_service, "deactivate_public_template", AsyncMock(return_value=template)):
                result = await template_api.deactivate_public_template(
                    template.id,
                    current_user=SimpleNamespace(id=uuid4(), username="admin"),
                    db=object(),
                )

        self.assertFalse(result["is_active"])


if __name__ == "__main__":
    unittest.main()
