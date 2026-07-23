import asyncio
import json
import unittest
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from app.services.batch_service import BatchService, _tasks


class BatchServiceTemplateTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        _tasks.clear()
        self.owner = {
            "tenant_key": "tenant-a-key",
            "user_id": uuid4(),
        }

    async def asyncTearDown(self):
        _tasks.clear()

    async def test_template_batch_runs_items_sequentially(self):
        service = BatchService()
        service._persist_task_create = AsyncMock()
        service._sync_task_state = AsyncMock()
        service._save_batch_output = AsyncMock()

        active = 0
        max_active = 0

        async def fake_generate_from_db_template(**kwargs):
            nonlocal active, max_active
            active += 1
            max_active = max(max_active, active)
            await asyncio.sleep(0.01)
            active -= 1
            return {
                "success": True,
                "image_url": f"/static/{kwargs['params']['title']}.png",
                "prompt_used": kwargs["params"]["title"],
            }

        result = await service.create_batch_task(
            [{"title": "A"}, {"title": "B"}, {"title": "C"}],
            {
                "mode": "template",
                "sequential": True,
                "template_config": {"ai_prompt_template": "{title}"},
                "template_name": "喜报",
                "template_style_tag": None,
                "aspect_ratio": "3:4",
            },
            **self.owner,
        )

        with patch(
            "app.services.batch_service.poster_service.generate_from_db_template",
            AsyncMock(side_effect=fake_generate_from_db_template),
        ):
            await service.run_batch_task(result["task_id"])

        self.assertEqual(max_active, 1)
        status = service.get_batch_status(result["task_id"], **self.owner)
        self.assertEqual(status["status"], "completed")
        self.assertEqual(status["success_count"], 3)

    async def test_append_batch_items_adds_pending_items(self):
        service = BatchService()
        service._persist_task_create = AsyncMock()
        service._persist_new_items = AsyncMock()
        service._sync_task_state = AsyncMock()

        result = await service.create_batch_task(
            [{"title": "A"}],
            {
                "mode": "template",
                "sequential": True,
                "template_config": {"ai_prompt_template": "{title}"},
                "template_name": "喜报",
            },
            **self.owner,
        )

        append_result = await service.append_batch_items(
            result["task_id"],
            [{"title": "B"}],
            **self.owner,
        )

        self.assertEqual(append_result["total_count"], 2)
        self.assertEqual(append_result["appended_count"], 1)
        status = service.get_batch_status(result["task_id"], **self.owner)
        self.assertEqual(status["items"][1]["title"], "B")
        self.assertEqual(status["items"][1]["status"], "pending")

    async def test_append_during_running_template_batch_runs_next(self):
        service = BatchService()
        service._persist_task_create = AsyncMock()
        service._persist_new_items = AsyncMock()
        service._sync_task_state = AsyncMock()
        service._save_batch_output = AsyncMock()

        started = asyncio.Event()
        calls = []
        active = 0
        max_active = 0

        async def fake_generate_from_db_template(**kwargs):
            nonlocal active, max_active
            calls.append(kwargs["params"]["title"])
            active += 1
            max_active = max(max_active, active)
            started.set()
            await asyncio.sleep(0.05)
            active -= 1
            return {
                "success": True,
                "image_url": f"/static/{kwargs['params']['title']}.png",
                "prompt_used": kwargs["params"]["title"],
            }

        result = await service.create_batch_task(
            [{"title": "A"}],
            {
                "mode": "template",
                "sequential": True,
                "template_config": {"ai_prompt_template": "{title}"},
                "template_name": "喜报",
            },
            **self.owner,
        )

        with patch(
            "app.services.batch_service.poster_service.generate_from_db_template",
            AsyncMock(side_effect=fake_generate_from_db_template),
        ):
            runner = asyncio.create_task(service.run_batch_task(result["task_id"]))
            await started.wait()
            await service.append_batch_items(
                result["task_id"],
                [{"title": "B"}],
                **self.owner,
            )
            await runner

        self.assertEqual(calls, ["A", "B"])
        self.assertEqual(max_active, 1)
        status = service.get_batch_status(result["task_id"], **self.owner)
        self.assertEqual(status["status"], "completed")
        self.assertEqual(status["success_count"], 2)

    async def test_single_custom_generation_keeps_images_out_of_persistence(self):
        service = BatchService()
        service._persist_task_create = AsyncMock()
        service._sync_task_state = AsyncMock()
        service._save_single_output = AsyncMock()

        captured = {}

        async def fake_generate_custom(**kwargs):
            captured.update(kwargs)
            return {"success": True, "image_url": "/static/custom.png", "prompt_used": "p"}

        result = await service.create_single_generation_task(
            mode="custom",
            params={"prompt": "一张春日海报"},
            runtime_input={"reference_images": [{"image_base64": "AAAA", "name": "图1"}]},
            shared_config={"aspect_ratio": "3:4", "style_tags": ["清新"]},
            **self.owner,
        )

        # 大体积输入只在内存，不进入持久化的 item_params
        persisted_item = _tasks[result["task_id"]]["items"][0]["item_params"]
        self.assertNotIn("reference_images", persisted_item)
        self.assertNotIn("image_base64", persisted_item)

        with patch(
            "app.services.batch_service.poster_service.generate_custom",
            AsyncMock(side_effect=fake_generate_custom),
        ):
            await service.run_single_generation_task(result["task_id"])

        self.assertEqual(captured["reference_images"], [{"image_base64": "AAAA", "name": "图1"}])
        self.assertEqual(captured["aspect_ratio"], "3:4")
        status = service.get_batch_status(result["task_id"], **self.owner)
        self.assertEqual(status["status"], "completed")
        self.assertEqual(status["total_count"], 1)
        self.assertEqual(status["items"][0]["image_url"], "/static/custom.png")

    async def test_single_edit_generation_failure_is_reported(self):
        service = BatchService()
        service._persist_task_create = AsyncMock()
        service._sync_task_state = AsyncMock()
        service._save_single_output = AsyncMock()

        async def fake_generate_edit(**kwargs):
            return {"success": False, "error": "第三方 503"}

        result = await service.create_single_generation_task(
            mode="edit",
            params={"edit_prompt": "换成夜景"},
            runtime_input={"image_base64": "AAAA"},
            shared_config={"aspect_ratio": "9:16"},
            **self.owner,
        )

        with patch(
            "app.services.batch_service.poster_service.generate_edit",
            AsyncMock(side_effect=fake_generate_edit),
        ):
            await service.run_single_generation_task(result["task_id"])

        status = service.get_batch_status(result["task_id"], **self.owner)
        self.assertEqual(status["status"], "failed")
        self.assertEqual(status["items"][0]["error_message"], "第三方 503")

    async def test_append_during_template_batch_finalization_is_not_lost(self):
        service = BatchService()
        service._persist_task_create = AsyncMock()
        service._persist_new_items = AsyncMock()
        service._save_batch_output = AsyncMock()

        appended = False
        calls = []

        async def fake_sync_task_state(task, **kwargs):
            nonlocal appended
            if task["status"] == "completed" and task.get("worker_running") and not appended:
                appended = True
                await service.append_batch_items(
                    task["id"],
                    [{"title": "B"}],
                    **self.owner,
                )

        async def fake_generate_from_db_template(**kwargs):
            calls.append(kwargs["params"]["title"])
            await asyncio.sleep(0)
            return {
                "success": True,
                "image_url": f"/static/{kwargs['params']['title']}.png",
                "prompt_used": kwargs["params"]["title"],
            }

        service._sync_task_state = AsyncMock(side_effect=fake_sync_task_state)
        result = await service.create_batch_task(
            [{"title": "A"}],
            {
                "mode": "template",
                "sequential": True,
                "template_config": {"ai_prompt_template": "{title}"},
                "template_name": "喜报",
            },
            **self.owner,
        )

        with patch(
            "app.services.batch_service.poster_service.generate_from_db_template",
            AsyncMock(side_effect=fake_generate_from_db_template),
        ):
            await service.run_batch_task(result["task_id"])

        self.assertEqual(calls, ["A", "B"])
        status = service.get_batch_status(result["task_id"], **self.owner)
        self.assertEqual(status["status"], "completed")
        self.assertEqual(status["success_count"], 2)

    async def test_batch_task_access_is_scoped_to_tenant_and_user(self):
        service = BatchService()
        service._persist_task_create = AsyncMock()
        service._persist_new_items = AsyncMock()
        service._sync_task_state = AsyncMock()

        result = await service.create_batch_task(
            [{"title": "A"}],
            {"mode": "template", "sequential": True},
            **self.owner,
        )
        task_id = result["task_id"]
        other_user = {**self.owner, "user_id": uuid4()}
        other_tenant = {**self.owner, "tenant_key": "tenant-b-key"}

        self.assertIsNotNone(service.get_batch_status(task_id, **self.owner))
        self.assertIsNone(service.get_batch_status(task_id, **other_user))
        self.assertIsNone(service.get_batch_status(task_id, **other_tenant))
        self.assertIsNone(
            await service.append_batch_items(task_id, [{"title": "B"}], **other_user)
        )
        self.assertIsNone(await service.retry_failed_items(task_id, **other_tenant))

    async def test_template_reference_images_stay_out_of_persistence(self):
        service = BatchService()
        service._persist_task_create = AsyncMock()
        service._sync_task_state = AsyncMock()
        service._save_batch_output = AsyncMock()
        references = [{"name": "参考图", "image_base64": "data:image/png;base64,AAAA"}]

        result = await service.create_batch_task(
            [{"title": "A", "reference_images": references}],
            {
                "mode": "template",
                "sequential": True,
                "template_config": {"ai_prompt_template": "{title}"},
                "template_name": "喜报",
            },
            **self.owner,
        )
        item = _tasks[result["task_id"]]["items"][0]
        self.assertNotIn("reference_images", item["item_params"])
        self.assertEqual(item["runtime_input"]["reference_images"], references)

        generate = AsyncMock(return_value={
            "success": True,
            "image_url": "/static/A.png",
            "prompt_used": "A",
        })
        with patch(
            "app.services.batch_service.poster_service.generate_from_db_template",
            generate,
        ):
            await service.run_batch_task(result["task_id"])

        self.assertEqual(generate.await_args.kwargs["reference_images"], references)

    def test_persistent_batch_config_removes_nested_credentials(self):
        runtime_config = {
            "aspect_ratio": "3:4",
            "image_model_config": {
                "model_name": "image-model",
                "api_key": "model-secret",
                "nested": {"access_token": "access-secret"},
            },
            "transport": {
                "Authorization": "Bearer secret",
                "clientSecret": "client-secret",
            },
        }

        persisted = BatchService._persistent_shared_config(runtime_config)

        self.assertNotIn("secret", json.dumps(persisted))
        self.assertEqual(persisted["image_model_config"]["model_name"], "image-model")
        self.assertEqual(runtime_config["image_model_config"]["api_key"], "model-secret")
