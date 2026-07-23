"""
视频生成编排服务
串联完整流水线：脚本生成 → TTS → 配图 → Remotion 渲染
"""
import os
import asyncio
import uuid
import base64
from typing import Optional
from datetime import datetime

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.video_task import VideoTask
from app.services.tts_service import tts_service
from app.services.video_script_service import video_script_service
from app.core.config import settings
from app.core.errors import CapabilityUnavailableError
from app.core.runtime_context import current_tenant_id, resolve_static_url
from app.services.llm_service import llm_service


# Remotion 渲染服务地址
REMOTION_URL = settings.remotion_service_url

# 项目根目录（用于拼接文件路径）
from pathlib import Path as _Path
project_root = _Path(__file__).resolve().parent.parent.parent

# 渲染并发限流
_render_semaphore = asyncio.Semaphore(2)


class VideoService:
    """视频生成编排服务"""

    def require_pipeline_configured(self) -> None:
        llm_service.require_configured()
        if not tts_service.is_configured:
            raise CapabilityUnavailableError("tts", "语音合成服务未配置")
        if not settings.remotion_service_url or not settings.runtime_control_token:
            raise CapabilityUnavailableError("remotion", "Remotion 渲染运行时未配置")

    async def create_task(
        self,
        db: AsyncSession,
        topic: str,
        user_id: Optional[str] = None,
        voice_type: Optional[str] = None,
        style: Optional[str] = None,
        template: str = "KnowledgeVideo",
        aspect_ratio: str = "9:16",
    ) -> VideoTask:
        """创建视频生成任务（仅入库，不执行）"""
        task = VideoTask(
            id=uuid.uuid4(),
            user_id=uuid.UUID(user_id) if user_id else None,
            topic=topic,
            status="pending",
            config={
                "voice_type": voice_type or tts_service.voice_type,
                "style": style,
                "template": template,
                "aspect_ratio": aspect_ratio,
                "width": 1920 if aspect_ratio == "16:9" else 1080,
                "height": 1080 if aspect_ratio == "16:9" else 1920,
            },
        )
        db.add(task)
        await db.commit()
        await db.refresh(task)
        print(f"[Video] 创建任务: {task.id} (主题: {topic}, 模板: {template})")
        return task

    async def execute_pipeline(self, db: AsyncSession, task_id: str) -> None:
        """
        执行完整视频生成流水线

        阶段：
          1. generating_script — LLM 生成脚本
          2. synthesizing_audio — TTS 合成语音
          3. rendering — Remotion 渲染 MP4
          4. completed / failed
        """
        task = await self._get_task(db, task_id)
        if not task:
            print(f"[Video] 任务 {task_id} 不存在")
            return

        try:
            # ===== 阶段 1: 生成脚本 =====
            await self._update_status(db, task, "generating_script")
            template = task.config.get("template", "KnowledgeVideo") if task.config else "KnowledgeVideo"
            script = await video_script_service.generate_script(
                topic=task.topic,
                style=task.config.get("style") if task.config else None,
                template=template,
            )
            task.title = script.get("title", task.topic)
            task.script_json = script
            await db.commit()
            print(f"[Video] 脚本生成完成: {task.title}")

            # ===== 阶段 2: TTS 合成 =====
            await self._update_status(db, task, "synthesizing_audio")
            scenes = script.get("scenes", [])
            narrations = [s.get("narration", "") for s in scenes]

            voice_type = task.config.get("voice_type") if task.config else None
            audio_results = await tts_service.batch_synthesize(
                narrations, voice_type=voice_type
            )

            task.audio_urls = [r["audio_url"] for r in audio_results]
            await db.commit()
            print(f"[Video] TTS 合成完成: {len(audio_results)} 段")

            # ===== 阶段 3: Remotion 渲染 =====
            await self._update_status(db, task, "rendering")

            # 组装 Remotion 输入数据
            # audioUrl 通过 Remotion Express 的静态文件服务访问
            if template == "DataVizVideo":
                remotion_scenes = self._build_dataviz_scenes(scenes, audio_results)
            else:
                remotion_scenes = self._build_knowledge_scenes(scenes, audio_results)

            render_result = await self._render_video(
                title=task.title or task.topic,
                scenes=remotion_scenes,
                composition_id=template,
                width=task.config.get("width", 1080) if task.config else 1080,
                height=task.config.get("height", 1920) if task.config else 1920,
            )

            if render_result.get("success"):
                task.video_url = render_result.get("video_url", "")
                await self._update_status(db, task, "completed")
                task.completed_at = datetime.utcnow()
                await db.commit()
                print(f"[Video] OK: 视频生成完成: {task.video_url}")
            else:
                raise Exception(render_result.get("error", "渲染失败"))

        except Exception as e:
            task.error_message = str(e)
            task.status = "failed"
            task.completed_at = datetime.utcnow()
            await db.commit()
            print(f"[Video] ERROR: 任务 {task_id} 失败: {e}")

    async def preview_script(self, topic: str, style: Optional[str] = None, template: str = "KnowledgeVideo") -> dict:
        """仅生成脚本预览（不入库不渲染）"""
        return await video_script_service.generate_script(topic, style, template=template)

    async def get_task_status(
        self,
        db: AsyncSession,
        task_id: str,
        user_id: Optional[str] = None,
    ) -> Optional[dict]:
        """查询任务状态"""
        task = await self._get_task(db, task_id, user_id=user_id)
        if not task:
            return None
        return {
            "id": str(task.id),
            "title": task.title,
            "topic": task.topic,
            "status": task.status,
            "video_url": task.video_url,
            "error_message": task.error_message,
            "script_json": task.script_json,
            "audio_urls": task.audio_urls,
            "created_at": task.created_at.isoformat() if task.created_at else None,
            "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        }

    async def list_tasks(
        self,
        db: AsyncSession,
        user_id: Optional[str] = None,
        limit: int = 20,
    ) -> list:
        """查询历史视频列表"""
        query = select(VideoTask).order_by(VideoTask.created_at.desc()).limit(limit)
        if user_id:
            query = query.where(VideoTask.user_id == uuid.UUID(user_id))
        result = await db.execute(query)
        tasks = result.scalars().all()
        return [
            {
                "id": str(t.id),
                "title": t.title,
                "topic": t.topic,
                "status": t.status,
                "video_url": t.video_url,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in tasks
        ]

    async def delete_task(
        self,
        db: AsyncSession,
        task_id: str,
        user_id: Optional[str] = None,
    ) -> bool:
        """
        删除视频任务并清理关联的磁盘文件（视频 + 音频）

        Returns:
            True 如果成功删除，False 如果任务不存在
        """
        task = await self._get_task(db, task_id, user_id=user_id)
        if not task:
            return False

        # 清理磁盘视频文件
        if task.video_url:
            try:
                video_file = resolve_static_url(task.video_url)
            except ValueError:
                video_file = None
            if video_file and video_file.exists():
                video_file.unlink()
                print(f"[Video] 已删除视频文件: {video_file}")

        # 清理磁盘音频文件
        if task.audio_urls:
            for audio_url in task.audio_urls:
                try:
                    audio_file = resolve_static_url(audio_url)
                except ValueError:
                    audio_file = None
                if audio_file and audio_file.exists():
                    audio_file.unlink()
                    print(f"[Video] 已删除音频文件: {audio_file}")

        await db.delete(task)
        await db.commit()
        print(f"[Video] DELETE: 已删除任务: {task_id}")
        return True

    # ─── 内部方法 ───

    async def _get_task(
        self,
        db: AsyncSession,
        task_id: str,
        user_id: Optional[str] = None,
    ) -> Optional[VideoTask]:
        """获取任务"""
        query = select(VideoTask).where(VideoTask.id == uuid.UUID(task_id))
        if user_id:
            query = query.where(VideoTask.user_id == uuid.UUID(user_id))
        result = await db.execute(query)
        return result.scalar_one_or_none()

    async def _update_status(
        self, db: AsyncSession, task: VideoTask, status: str
    ) -> None:
        """更新任务状态"""
        task.status = status
        if status != "pending" and not task.started_at:
            task.started_at = datetime.utcnow()
        await db.commit()

    def _build_knowledge_scenes(self, scenes: list, audio_results: list) -> list:
        """组装干货技能卡模板的 Remotion scenes 数据"""
        remotion_scenes = []
        for i, scene in enumerate(scenes):
            audio_result = audio_results[i] if i < len(audio_results) else {}
            audio_url = audio_result.get("audio_url", "")
            audio_url = self._inline_audio(audio_url)
            remotion_scenes.append({
                "narration": scene.get("narration", ""),
                "audioUrl": audio_url,
                "audioDuration": audio_result.get("duration", 5),
                "imageUrl": "",
                "sceneTitle": scene.get("scene_title", ""),
                "keyPoints": scene.get("key_points", []),
                "codeExample": scene.get("code_example", ""),
                "sceneType": scene.get("type", "content"),
                # V3 动态结构透传
                "layoutType": scene.get("layoutType", "TitleCard"),
                "themeColor": scene.get("themeColor", "#818cf8"),
                "content": scene.get("content", {}),
            })
        return remotion_scenes

    def _build_dataviz_scenes(self, scenes: list, audio_results: list) -> list:
        """组装数据可视化模板的 Remotion scenes 数据"""
        remotion_scenes = []
        for i, scene in enumerate(scenes):
            audio_result = audio_results[i] if i < len(audio_results) else {}
            audio_url = audio_result.get("audio_url", "")
            audio_url = self._inline_audio(audio_url)
            remotion_scenes.append({
                "sceneType": scene.get("sceneType", "number_flip"),
                "sceneTitle": scene.get("sceneTitle", ""),
                "narration": scene.get("narration", ""),
                "audioUrl": audio_url,
                "audioDuration": audio_result.get("duration", scene.get("audioDuration", 8)),
                # number_flip 专用
                "metrics": scene.get("metrics", []),
                # bar_chart 专用
                "bars": scene.get("bars", []),
                "unit": scene.get("unit", ""),
                # data_card 专用
                "cards": scene.get("cards", []),
            })
        return remotion_scenes

    async def _render_video(self, title: str, scenes: list, composition_id: str = "KnowledgeVideo", width: int = 1080, height: int = 1920) -> dict:
        """
        调用 Remotion 渲染服务

        Returns:
            { "success": True, "video_url": "/static/videos/xxx.mp4" }
            or
            { "success": False, "error": "..." }
        """
        async with _render_semaphore:
            try:
                async with httpx.AsyncClient(timeout=300.0) as client:
                    # 1. 提交渲染任务
                    resp = await client.post(
                        f"{REMOTION_URL}/render",
                        json={
                            "compositionId": composition_id,
                            "inputProps": {
                                "title": title,
                                "scenes": scenes,
                            },
                            "width": width,
                            "height": height,
                        },
                        headers=self._remotion_headers(),
                    )
                    resp.raise_for_status()
                    render_data = resp.json()
                    render_task_id = render_data.get("taskId")

                    if not render_task_id:
                        return {"success": False, "error": "未获取到渲染任务 ID"}

                    # 2. 轮询渲染状态
                    for _ in range(600):  # 最多等 5 分钟
                        await asyncio.sleep(0.5)

                        status_resp = await client.get(
                            f"{REMOTION_URL}/status/{render_task_id}",
                            headers=self._remotion_headers(),
                        )
                        status_data = status_resp.json()
                        status = status_data.get("status")

                        if status == "completed":
                            video_url = f"/static/videos/{render_task_id}.mp4"
                            return {"success": True, "video_url": video_url}

                        if status == "failed":
                            return {
                                "success": False,
                                "error": status_data.get("error", "渲染失败"),
                            }

                    return {"success": False, "error": "渲染超时（5分钟）"}

            except httpx.ConnectError:
                return {
                    "success": False,
                    "error": f"无法连接 Remotion 服务 ({REMOTION_URL})，请确认已启动",
                }
            except Exception as e:
                return {"success": False, "error": str(e)}

    def _remotion_headers(self) -> dict[str, str]:
        if not settings.runtime_control_token:
            raise RuntimeError("Remotion 运行时控制令牌未配置")
        return {
            "X-Runtime-Token": settings.runtime_control_token,
            "X-Tenant-Id": current_tenant_id(),
        }

    def _inline_audio(self, audio_url: str) -> str:
        if not audio_url or not audio_url.startswith("/static/"):
            return audio_url
        try:
            audio_path = resolve_static_url(audio_url)
            payload = base64.b64encode(audio_path.read_bytes()).decode("ascii")
            return f"data:audio/mpeg;base64,{payload}"
        except (OSError, ValueError):
            return ""


# 单例
video_service = VideoService()
