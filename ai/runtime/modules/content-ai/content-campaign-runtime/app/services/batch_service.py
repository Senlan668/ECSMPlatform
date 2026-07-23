"""
批量生成任务服务模块
支持：批量创建、异步并发执行、进度查询、ZIP 打包下载、数据库持久化
"""
from __future__ import annotations

import asyncio
import io
import uuid
import zipfile
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from app.core.db import async_session_factory
from app.models.batch_task import BatchTask, BatchTaskItem
from app.services.gallery_service import gallery_service
from app.services.poster_service import poster_service


_tasks: Dict[str, Dict[str, Any]] = {}
MAX_CONCURRENT = 3


class BatchService:
    """批量生成任务服务"""

    async def create_batch_task(
        self,
        items: List[Dict[str, str]],
        shared_config: Dict[str, Any],
        *,
        tenant_key: str,
        user_id: UUID,
    ) -> Dict[str, Any]:
        """
        创建批量生成任务，并将任务元数据持久化到数据库。
        """
        task_uuid = uuid.uuid4()
        task_id = str(task_uuid)

        task_items = []
        for idx, item in enumerate(items):
            task_items.append(self._build_task_item(item, idx))

        task = {
            "id": task_id,
            "tenant_key": tenant_key,
            "user_id": str(user_id),
            "status": "pending",
            "total_count": len(task_items),
            "success_count": 0,
            "failed_count": 0,
            "running_count": 0,
            "shared_config": shared_config,
            "items": task_items,
            "created_at": datetime.utcnow().isoformat(),
            "started_at": None,
            "completed_at": None,
            "series_style_anchor": None,
            "worker_running": False,
        }

        _tasks[task_id] = task
        await self._persist_task_create(task, user_id=user_id)

        return {
            "success": True,
            "task_id": task_id,
            "total_count": len(task_items),
            "mode": "batch",
        }

    async def append_batch_items(
        self,
        task_id: str,
        items: List[Dict[str, Any]],
        *,
        tenant_key: str,
        user_id: UUID,
    ) -> Optional[Dict[str, Any]]:
        """
        向已有任务追加子任务。若原任务已经结束，调用方需要重新启动后台 worker。
        """
        task = self._owned_task(
            task_id,
            tenant_key=tenant_key,
            user_id=user_id,
        )
        if not task:
            return None

        should_start_worker = (
            not task.get("worker_running", False)
            and task["status"] not in {"pending", "running"}
        )
        start_index = len(task["items"])
        new_items = [
            self._build_task_item(item, start_index + idx)
            for idx, item in enumerate(items)
        ]
        task["items"].extend(new_items)
        task["total_count"] = len(task["items"])

        if should_start_worker:
            task["status"] = "pending"
            task["completed_at"] = None

        self._update_task_counts(task)
        await self._persist_new_items(task, new_items)
        await self._sync_task_state(task, sync_all_items=False)

        return {
            "success": True,
            "task_id": task_id,
            "appended_count": len(new_items),
            "total_count": task["total_count"],
            "should_start_worker": should_start_worker,
        }

    async def create_single_generation_task(
        self,
        *,
        mode: str,
        params: Dict[str, Any],
        runtime_input: Dict[str, Any],
        shared_config: Dict[str, Any],
        tenant_key: str,
        user_id: UUID,
    ) -> Dict[str, Any]:
        """
        创建单张异步生成任务（自定义 / 以图改图等）。

        与批量任务复用同一套内存任务表和状态查询，但：
        - 只有 1 个子任务
        - 大体积输入（原图、参考图 base64）放在内存字段 ``runtime_input``，不写入数据库
        - 通过 ``single_mode`` 分派到对应的 poster_service 高级方法
        """
        task_id = str(uuid.uuid4())
        item = {
            "id": str(uuid.uuid4()),
            "order_index": 0,
            "item_params": params,
            "runtime_input": runtime_input,
            "status": "pending",
            "image_url": None,
            "ai_prompt_used": None,
            "error_message": None,
            "retry_count": 0,
            "started_at": None,
            "completed_at": None,
        }
        task = {
            "id": task_id,
            "tenant_key": tenant_key,
            "user_id": str(user_id),
            "status": "pending",
            "total_count": 1,
            "success_count": 0,
            "failed_count": 0,
            "running_count": 0,
            "shared_config": shared_config,
            "single_mode": mode,
            "items": [item],
            "created_at": datetime.utcnow().isoformat(),
            "started_at": None,
            "completed_at": None,
            "series_style_anchor": None,
            "worker_running": False,
        }

        _tasks[task_id] = task
        await self._persist_task_create(task, user_id=user_id)

        return {
            "success": True,
            "task_id": task_id,
            "total_count": 1,
            "mode": "batch",
        }

    async def run_single_generation_task(self, task_id: str) -> None:
        """执行单张异步生成任务。"""
        task = _tasks.get(task_id)
        if not task:
            return
        if task.get("worker_running"):
            return

        task["worker_running"] = True
        task["status"] = "running"
        task["started_at"] = datetime.utcnow().isoformat()
        await self._sync_task_state(task, sync_all_items=False)

        try:
            item = task["items"][0]
            await self._generate_single_gen_item(task, item)

            self._update_task_counts(task)
            task["status"] = "completed" if item["status"] == "success" else "failed"
            task["completed_at"] = datetime.utcnow().isoformat()
            await self._sync_task_state(task, item=item)
        finally:
            task["worker_running"] = False

    async def _generate_single_gen_item(
        self,
        task: Dict[str, Any],
        item: Dict[str, Any],
    ) -> None:
        """按 single_mode 调用对应的高级生成方法。"""
        item["status"] = "running"
        item["started_at"] = datetime.utcnow().isoformat()
        task["running_count"] = 1
        await self._sync_task_state(task, item=item)

        try:
            config = task["shared_config"]
            mode = task.get("single_mode")
            params = item["item_params"]
            runtime_input = item.get("runtime_input") or {}

            if mode == "custom":
                result = await poster_service.generate_custom(
                    prompt=params.get("prompt", ""),
                    style_tags=config.get("style_tags"),
                    aspect_ratio=config.get("aspect_ratio", "3:4"),
                    color_tone=config.get("color_tone"),
                    reference_images=runtime_input.get("reference_images"),
                    provider_override=config.get("image_provider"),
                    image_model_config=config.get("image_model_config"),
                    brand_kit=config.get("brand_kit"),
                )
            elif mode == "edit":
                result = await poster_service.generate_edit(
                    image_base64=runtime_input.get("image_base64", ""),
                    edit_prompt=params.get("edit_prompt", ""),
                    aspect_ratio=config.get("aspect_ratio", "3:4"),
                    provider_override=config.get("image_provider"),
                    image_model_config=config.get("image_model_config"),
                )
            else:
                raise RuntimeError(f"不支持的单张生成模式: {mode}")

            if not result.get("success"):
                raise RuntimeError(result.get("error") or "AI 图片生成失败")

            item["image_url"] = result.get("image_url")
            item["ai_prompt_used"] = result.get("prompt_used")
            item["status"] = "success"
            await self._save_single_output(task, item, config, result)

        except Exception as exc:
            item["status"] = "failed"
            item["error_message"] = str(exc)

        finally:
            item["completed_at"] = datetime.utcnow().isoformat()
            task["running_count"] = 0
            self._update_task_counts(task)
            await self._sync_task_state(task, item=item)

    async def _save_single_output(
        self,
        task: Dict[str, Any],
        item: Dict[str, Any],
        config: Dict[str, Any],
        result: Dict[str, Any],
    ) -> None:
        """把单张异步生成结果写入作品库（登录用户）。"""
        user_id = task.get("user_id")
        if not user_id or not item.get("image_url"):
            return

        mode = task.get("single_mode") or "custom"
        payload = dict(item["item_params"])
        payload["aspect_ratio"] = config.get("aspect_ratio", "3:4")
        if config.get("style_tags"):
            payload["style_tags"] = config.get("style_tags")
        if config.get("color_tone"):
            payload["color_tone"] = config.get("color_tone")

        async with async_session_factory() as session:
            await gallery_service.create_generation_record(
                session,
                user_id=UUID(user_id),
                source_mode=mode,
                generation_result=result,
                request_payload=payload,
            )
            await session.commit()

    async def run_batch_task(self, task_id: str) -> None:
        """
        异步执行批量生成任务。
        """
        task = _tasks.get(task_id)
        if not task:
            return
        if task.get("worker_running"):
            return

        task["worker_running"] = True
        task["status"] = "running"
        task["started_at"] = datetime.utcnow().isoformat()
        await self._sync_task_state(task, sync_all_items=False)

        try:
            while True:
                config = task["shared_config"]
                series_mode = config.get("series_mode", False)
                items = task["items"]

                if config.get("sequential"):
                    while True:
                        pending_item = next(
                            (item for item in task["items"] if item["status"] == "pending"),
                            None,
                        )
                        if not pending_item:
                            await asyncio.sleep(0.2)
                            pending_item = next(
                                (item for item in task["items"] if item["status"] == "pending"),
                                None,
                            )
                            if not pending_item:
                                break
                        await self._generate_single_item(task, pending_item, config, is_anchor=False)
                else:
                    if series_mode and items:
                        first_item = items[0]
                        await self._generate_single_item(task, first_item, config, is_anchor=True)
                        if first_item["status"] != "success":
                            series_mode = False
                        remaining_items = items[1:]
                    else:
                        remaining_items = items

                    semaphore = asyncio.Semaphore(MAX_CONCURRENT)

                    async def _limited_generate(item: Dict[str, Any]) -> None:
                        async with semaphore:
                            await self._generate_single_item(task, item, config, is_anchor=False)

                    if remaining_items:
                        await asyncio.gather(
                            *[_limited_generate(item) for item in remaining_items],
                            return_exceptions=True,
                        )

                self._update_task_counts(task)
                if task["failed_count"] == 0:
                    task["status"] = "completed"
                elif task["success_count"] > 0:
                    task["status"] = "partial_failed"
                else:
                    task["status"] = "failed"

                task["completed_at"] = datetime.utcnow().isoformat()
                await self._sync_task_state(task, sync_all_items=False)

                if config.get("sequential") and any(
                    item["status"] == "pending"
                    for item in task["items"]
                ):
                    task["status"] = "running"
                    task["completed_at"] = None
                    await self._sync_task_state(task, sync_all_items=False)
                    continue
                break
        finally:
            task["worker_running"] = False

    async def _generate_single_item(
        self,
        task: Dict[str, Any],
        item: Dict[str, Any],
        config: Dict[str, Any],
        *,
        is_anchor: bool = False,
    ) -> None:
        """
        生成单个子任务图片。
        """
        item["status"] = "running"
        item["started_at"] = datetime.utcnow().isoformat()
        task["running_count"] += 1
        await self._sync_task_state(task, item=item)

        try:
            params = item["item_params"]
            if config.get("mode") == "template":
                await self._generate_template_item(task, item, config)
                return

            prompt = params.get("prompt", "")
            title = params.get("title", "")
            subtitle = params.get("subtitle", "")

            prompt_parts = []
            if title:
                prompt_parts.append(f"主题: {title}")
            if subtitle:
                prompt_parts.append(f"副标题: {subtitle}")
            prompt_parts.append(prompt)
            user_prompt = "\n".join(prompt_parts)

            enhanced_prompt = poster_service._build_custom_prompt(
                user_prompt,
                style_tags=config.get("style_tags"),
                aspect_ratio=config.get("aspect_ratio", "3:4"),
                color_tone=config.get("color_tone"),
                brand_kit=config.get("brand_kit"),
            )

            if config.get("series_mode") and not is_anchor and task.get("series_style_anchor"):
                anchor = task["series_style_anchor"]
                enhanced_prompt += (
                    "\n\n【系列一致性要求】\n"
                    "此图属于一组系列海报，请严格保持与首图一致的画面风格、色彩基调和构图语言。\n"
                    f"首图风格参考: {anchor[:300]}\n"
                    "- 保持相同的色彩临近感\n"
                    "- 保持相同的画面质感和光影方向\n"
                    "- 保持相同的构图手法和留白比例"
                )

            item["ai_prompt_used"] = enhanced_prompt
            image_base64 = await poster_service._call_ai_image_api(
                enhanced_prompt,
                provider_override=config.get("image_provider"),
                image_model_config=config.get("image_model_config"),
            )
            if not image_base64:
                raise RuntimeError("AI 图片生成返回空结果")

            image_url = poster_service._save_image(
                image_base64,
                prefix="poster_batch",
                brand_kit=config.get("brand_kit"),
            )
            item["image_url"] = image_url
            item["status"] = "success"

            if is_anchor:
                task["series_style_anchor"] = enhanced_prompt

            await self._save_batch_output(task, item, config)

        except Exception as exc:
            item["status"] = "failed"
            item["error_message"] = str(exc)

        finally:
            item["completed_at"] = datetime.utcnow().isoformat()
            task["running_count"] = max(0, task["running_count"] - 1)
            self._update_task_counts(task)
            await self._sync_task_state(task, item=item)

    async def _generate_template_item(
        self,
        task: Dict[str, Any],
        item: Dict[str, Any],
        config: Dict[str, Any],
    ) -> None:
        raw_params = item["item_params"]
        reference_images = (item.get("runtime_input") or {}).get("reference_images") or []
        params = {
            key: value
            for key, value in raw_params.items()
            if not key.startswith("_")
        }
        result = await poster_service.generate_from_db_template(
            template_config=config.get("template_config", {}),
            template_name=config.get("template_name") or "模板批量生成",
            template_style_tag=config.get("template_style_tag"),
            params=params,
            reference_images=reference_images,
            style_tag=config.get("style_tag"),
            color_option=config.get("color_option"),
            aspect_ratio=config.get("aspect_ratio"),
            provider_override=config.get("image_provider"),
            image_model_config=config.get("image_model_config"),
            brand_kit=config.get("brand_kit"),
        )
        if not result.get("success"):
            raise RuntimeError(result.get("error") or "AI 图片生成失败")

        item["image_url"] = result.get("image_url")
        item["ai_prompt_used"] = result.get("prompt_used")
        item["status"] = "success"
        await self._save_batch_output(task, item, config)

    def get_batch_status(
        self,
        task_id: str,
        *,
        tenant_key: str,
        user_id: UUID,
    ) -> Optional[Dict[str, Any]]:
        """
        查询批量任务的完整状态。
        """
        task = self._owned_task(
            task_id,
            tenant_key=tenant_key,
            user_id=user_id,
        )
        if not task:
            return None

        self._update_task_counts(task)
        return {
            "task_id": task["id"],
            "status": task["status"],
            "total_count": task["total_count"],
            "success_count": task["success_count"],
            "failed_count": task["failed_count"],
            "running_count": task["running_count"],
            "series_mode": task["shared_config"].get("series_mode", False),
            "created_at": task["created_at"],
            "started_at": task["started_at"],
            "completed_at": task["completed_at"],
            "items": [
                {
                    "id": it["id"],
                    "order_index": it["order_index"],
                    "status": it["status"],
                    "image_url": it["image_url"],
                    "error_message": it["error_message"],
                    "title": self._item_title(it["item_params"]),
                    "subtitle": it["item_params"].get("subtitle", ""),
                }
                for it in task["items"]
            ],
        }

    async def retry_failed_items(
        self,
        task_id: str,
        *,
        tenant_key: str,
        user_id: UUID,
    ) -> Optional[Dict[str, Any]]:
        """
        重试批量任务中所有失败的子任务。
        """
        task = self._owned_task(
            task_id,
            tenant_key=tenant_key,
            user_id=user_id,
        )
        if not task:
            return None

        failed_items = [item for item in task["items"] if item["status"] == "failed"]
        if not failed_items:
            return {
                "task_id": task_id,
                "retried_count": 0,
                "message": "没有需要重试的失败项",
            }

        for item in failed_items:
            item["status"] = "pending"
            item["error_message"] = None
            item["retry_count"] += 1

        self._update_task_counts(task)
        task["status"] = "running"
        task["completed_at"] = None
        await self._sync_task_state(task, sync_all_items=True)

        if task.get("single_mode"):
            for item in failed_items:
                await self._generate_single_gen_item(task, item)
        else:
            semaphore = asyncio.Semaphore(MAX_CONCURRENT)

            async def _limited_retry(item: Dict[str, Any]) -> None:
                async with semaphore:
                    await self._generate_single_item(task, item, task["shared_config"], is_anchor=False)

            await asyncio.gather(
                *[_limited_retry(item) for item in failed_items],
                return_exceptions=True,
            )

        self._update_task_counts(task)
        task["status"] = "completed" if task["failed_count"] == 0 else "partial_failed"
        task["completed_at"] = datetime.utcnow().isoformat()
        await self._sync_task_state(task, sync_all_items=False)

        return {
            "task_id": task_id,
            "retried_count": len(failed_items),
            "success_count": task["success_count"],
            "failed_count": task["failed_count"],
        }

    def build_download_zip(
        self,
        task_id: str,
        *,
        tenant_key: str,
        user_id: UUID,
    ) -> Optional[io.BytesIO]:
        """
        将批量生成的所有成功图片打包为 ZIP。
        """
        task = self._owned_task(
            task_id,
            tenant_key=tenant_key,
            user_id=user_id,
        )
        if not task:
            return None

        success_items = [
            item
            for item in task["items"]
            if item["status"] == "success" and item["image_url"]
        ]
        if not success_items:
            return None

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for item in success_items:
                file_path = gallery_service.resolve_static_path(item["image_url"])
                if file_path and file_path.exists():
                    title = item["item_params"].get("title", "")
                    ext = file_path.suffix
                    arcname = f"{item['order_index'] + 1:02d}_{title or 'poster'}{ext}"
                    zip_file.write(file_path, arcname)

        zip_buffer.seek(0)
        return zip_buffer

    @staticmethod
    def _owned_task(
        task_id: str,
        *,
        tenant_key: str,
        user_id: UUID,
    ) -> Optional[Dict[str, Any]]:
        task = _tasks.get(task_id)
        if not task:
            return None
        if task.get("tenant_key") != tenant_key:
            return None
        if task.get("user_id") != str(user_id):
            return None
        return task

    async def _persist_task_create(
        self,
        task: Dict[str, Any],
        *,
        user_id: Optional[UUID],
    ) -> None:
        async with async_session_factory() as session:
            db_task = BatchTask(
                id=UUID(task["id"]),
                user_id=user_id,
                status=task["status"],
                total_count=task["total_count"],
                success_count=task["success_count"],
                failed_count=task["failed_count"],
                running_count=task["running_count"],
                shared_config=self._persistent_shared_config(task["shared_config"]),
                created_at=self._parse_dt(task["created_at"]) or datetime.utcnow(),
            )
            session.add(db_task)

            for item in task["items"]:
                session.add(
                    BatchTaskItem(
                        id=UUID(item["id"]),
                        batch_task_id=UUID(task["id"]),
                        order_index=item["order_index"],
                        item_params=item["item_params"],
                        status=item["status"],
                        retry_count=item["retry_count"],
                    )
                )

            await session.commit()

    async def _persist_new_items(
        self,
        task: Dict[str, Any],
        new_items: List[Dict[str, Any]],
    ) -> None:
        async with async_session_factory() as session:
            db_task = await session.get(BatchTask, UUID(task["id"]))
            if db_task:
                db_task.status = task["status"]
                db_task.total_count = task["total_count"]
                db_task.success_count = task["success_count"]
                db_task.failed_count = task["failed_count"]
                db_task.running_count = task["running_count"]
                db_task.completed_at = self._parse_dt(task["completed_at"])

            for item in new_items:
                session.add(
                    BatchTaskItem(
                        id=UUID(item["id"]),
                        batch_task_id=UUID(task["id"]),
                        order_index=item["order_index"],
                        item_params=item["item_params"],
                        status=item["status"],
                        retry_count=item["retry_count"],
                    )
                )

            await session.commit()

    async def _sync_task_state(
        self,
        task: Dict[str, Any],
        *,
        item: Optional[Dict[str, Any]] = None,
        sync_all_items: bool = False,
    ) -> None:
        async with async_session_factory() as session:
            db_task = await session.get(BatchTask, UUID(task["id"]))
            if db_task:
                db_task.status = task["status"]
                db_task.success_count = task["success_count"]
                db_task.failed_count = task["failed_count"]
                db_task.running_count = task["running_count"]
                db_task.started_at = self._parse_dt(task["started_at"])
                db_task.completed_at = self._parse_dt(task["completed_at"])
                db_task.shared_config = self._persistent_shared_config(task["shared_config"])

            items_to_sync = task["items"] if sync_all_items else ([item] if item else [])
            for current_item in items_to_sync:
                db_item = await session.get(BatchTaskItem, UUID(current_item["id"]))
                if not db_item:
                    continue
                db_item.status = current_item["status"]
                db_item.image_url = current_item["image_url"]
                db_item.ai_prompt_used = current_item["ai_prompt_used"]
                db_item.error_message = current_item["error_message"]
                db_item.retry_count = current_item["retry_count"]
                db_item.started_at = self._parse_dt(current_item["started_at"])
                db_item.completed_at = self._parse_dt(current_item["completed_at"])

            await session.commit()

    async def _save_batch_output(
        self,
        task: Dict[str, Any],
        item: Dict[str, Any],
        config: Dict[str, Any],
    ) -> None:
        user_id = task.get("user_id")
        if not user_id or not item.get("image_url"):
            return

        ratio_info = poster_service.get_aspect_ratios().get(
            config.get("aspect_ratio", "3:4"),
            {},
        )
        payload = {
            "prompt": item["item_params"].get("prompt"),
            "title": self._item_title(item["item_params"]),
            "params": item["item_params"],
            "style_tags": config.get("style_tags"),
            "aspect_ratio": config.get("aspect_ratio", "3:4"),
            "color_tone": config.get("color_tone"),
        }
        result = {
            "success": True,
            "image_url": item["image_url"],
            "aspect_ratio": config.get("aspect_ratio", "3:4"),
            "width": ratio_info.get("width"),
            "height": ratio_info.get("height"),
            "prompt_used": item["ai_prompt_used"],
        }

        async with async_session_factory() as session:
            await gallery_service.create_generation_record(
                session,
                user_id=UUID(user_id),
                source_mode="batch",
                generation_result=result,
                request_payload=payload,
                title=self._item_title(item["item_params"]),
                batch_task_id=UUID(task["id"]),
            )
            await session.commit()

    @staticmethod
    def _build_task_item(item: Dict[str, Any], order_index: int) -> Dict[str, Any]:
        item_params = dict(item)
        runtime_input = {}
        reference_images = item_params.pop("reference_images", None)
        if reference_images:
            runtime_input["reference_images"] = reference_images
        return {
            "id": str(uuid.uuid4()),
            "order_index": order_index,
            "item_params": item_params,
            "runtime_input": runtime_input,
            "status": "pending",
            "image_url": None,
            "ai_prompt_used": None,
            "error_message": None,
            "retry_count": 0,
            "started_at": None,
            "completed_at": None,
        }

    @classmethod
    def _persistent_shared_config(cls, config: Dict[str, Any]) -> Dict[str, Any]:
        def sanitize(value: Any) -> Any:
            if isinstance(value, dict):
                return {
                    key: sanitize(item)
                    for key, item in value.items()
                    if not cls._is_sensitive_config_key(str(key))
                }
            if isinstance(value, list):
                return [sanitize(item) for item in value]
            return value

        return sanitize(config)

    @staticmethod
    def _is_sensitive_config_key(key: str) -> bool:
        compact = key.strip().lower().replace("-", "_").replace("_", "")
        return compact == "authorization" or compact.endswith(
            ("apikey", "token", "secret", "password")
        )

    @staticmethod
    def _item_title(params: Dict[str, Any]) -> str:
        if params.get("_batch_title"):
            return str(params["_batch_title"])
        if params.get("title"):
            return str(params["title"])
        for value in params.values():
            if isinstance(value, str) and value.strip():
                return value.strip()
        return ""

    @staticmethod
    def _update_task_counts(task: Dict[str, Any]) -> None:
        items = task["items"]
        task["success_count"] = sum(1 for item in items if item["status"] == "success")
        task["failed_count"] = sum(1 for item in items if item["status"] == "failed")
        task["running_count"] = sum(1 for item in items if item["status"] == "running")

    @staticmethod
    def _parse_dt(value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        return datetime.fromisoformat(value)


batch_service = BatchService()
