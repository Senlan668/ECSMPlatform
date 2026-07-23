import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from app.services.template_service import TemplateService


class FakeSession:
    def __init__(self):
        self.added = []
        self.deleted = []
        self.flush = AsyncMock()
        self.refresh = AsyncMock()

    def add(self, obj):
        self.added.append(obj)

    async def delete(self, obj):
        self.deleted.append(obj)


class TemplateServicePublishTests(unittest.IsolatedAsyncioTestCase):
    async def test_publish_template_copies_owned_personal_template_to_public(self):
        service = TemplateService()
        user_id = uuid4()
        source = SimpleNamespace(
            user_id=user_id,
            is_system=False,
            name="喜报",
            description="喜报模板",
            category="通用",
            style_tag="庆祝",
            config={"text_slots": [{"name": "title"}]},
            thumbnail_url="/static/thumb.png",
            source_generation_id=uuid4(),
        )
        service.get_template = AsyncMock(return_value=source)
        db = FakeSession()

        published = await service.publish_template(db, user_id=user_id, template_id=uuid4())

        self.assertIsNotNone(published)
        self.assertEqual(db.added, [published])
        self.assertIsNone(published.user_id)
        self.assertTrue(published.is_system)
        self.assertEqual(published.name, "喜报")
        self.assertEqual(published.config, source.config)
        self.assertIsNot(published.config, source.config)
        db.flush.assert_awaited_once()
        db.refresh.assert_awaited_once_with(published)

    async def test_publish_template_rejects_unowned_template(self):
        service = TemplateService()
        source = SimpleNamespace(user_id=uuid4(), is_system=False)
        service.get_template = AsyncMock(return_value=source)

        published = await service.publish_template(FakeSession(), user_id=uuid4(), template_id=uuid4())

        self.assertIsNone(published)

    async def test_deactivate_public_template_sets_inactive_without_deleting(self):
        service = TemplateService()
        template = SimpleNamespace(is_system=True, is_active=True, updated_at=None)
        service.get_template = AsyncMock(return_value=template)
        db = FakeSession()

        deactivated = await service.deactivate_public_template(db, template_id=uuid4())

        self.assertIs(deactivated, template)
        self.assertFalse(template.is_active)
        self.assertEqual(db.deleted, [])
        db.flush.assert_awaited_once()
        db.refresh.assert_awaited_once_with(template)

    async def test_deactivate_public_template_rejects_personal_template(self):
        service = TemplateService()
        template = SimpleNamespace(is_system=False, is_active=True)
        service.get_template = AsyncMock(return_value=template)

        deactivated = await service.deactivate_public_template(FakeSession(), template_id=uuid4())

        self.assertIsNone(deactivated)
        self.assertTrue(template.is_active)

    async def test_restore_public_template_sets_active(self):
        service = TemplateService()
        template = SimpleNamespace(is_system=True, is_active=False, updated_at=None)
        service.get_template = AsyncMock(return_value=template)
        db = FakeSession()

        restored = await service.restore_public_template(db, template_id=uuid4())

        self.assertIs(restored, template)
        self.assertTrue(template.is_active)
        db.flush.assert_awaited_once()
        db.refresh.assert_awaited_once_with(template)


if __name__ == "__main__":
    unittest.main()
