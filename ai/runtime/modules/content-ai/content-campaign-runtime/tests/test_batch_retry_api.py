import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from fastapi import BackgroundTasks, HTTPException

from app.api.v1 import batch as batch_api


class BatchRetryApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_retry_failed_items_is_queued_in_background(self):
        original_service = batch_api.batch_service
        current_user = SimpleNamespace(id=uuid4())

        class FakeBatchService:
            def get_batch_status(self, task_id, *, tenant_key, user_id):
                self.owner = (tenant_key, user_id)
                return {
                    "task_id": task_id,
                    "status": "partial_failed",
                    "failed_count": 2,
                }

            retry_failed_items = AsyncMock()

        fake_service = FakeBatchService()
        background_tasks = BackgroundTasks()
        batch_api.batch_service = fake_service
        try:
            with patch.object(batch_api, "tenant_hash", return_value="tenant-a-key"):
                result = await batch_api.retry_failed(
                    "task-1",
                    background_tasks,
                    current_user,
                )
        finally:
            batch_api.batch_service = original_service

        self.assertEqual(result["task_id"], "task-1")
        self.assertEqual(result["retried_count"], 2)
        self.assertTrue(result["queued"])
        self.assertEqual(len(background_tasks.tasks), 1)
        self.assertEqual(fake_service.owner, ("tenant-a-key", current_user.id))
        self.assertEqual(background_tasks.tasks[0].kwargs["tenant_key"], "tenant-a-key")
        self.assertEqual(background_tasks.tasks[0].kwargs["user_id"], current_user.id)
        fake_service.retry_failed_items.assert_not_awaited()

    async def test_retry_failed_items_returns_not_found_for_missing_task(self):
        original_service = batch_api.batch_service
        current_user = SimpleNamespace(id=uuid4())

        class FakeBatchService:
            def get_batch_status(self, task_id, *, tenant_key, user_id):
                return None

        batch_api.batch_service = FakeBatchService()
        try:
            with patch.object(batch_api, "tenant_hash", return_value="tenant-a-key"):
                with self.assertRaises(HTTPException) as exc:
                    await batch_api.retry_failed(
                        "missing-task",
                        BackgroundTasks(),
                        current_user,
                    )
        finally:
            batch_api.batch_service = original_service

        self.assertEqual(exc.exception.status_code, 404)
