"""
作品库 / 素材中心服务
负责作品持久化、筛选、搜索、收藏、模板复用和批量操作
"""
from __future__ import annotations

from datetime import date, datetime, time
from pathlib import Path
from typing import Any, Iterable, Optional
from uuid import UUID

from sqlalchemy import String, func, or_, select, cast
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.poster import PosterGeneration, PosterTemplate
from app.core.runtime_context import (
    has_runtime_identity,
    resolve_static_url,
    tenant_static_path,
)


DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


class GalleryService:
    """作品库服务"""

    def __init__(self) -> None:
        self.project_root = Path(__file__).resolve().parent.parent.parent
        self.static_root = self.project_root / "static"
        self.thumbnail_dir = self.static_root / "images" / "posters" / "thumbnails"
        self.thumbnail_dir.mkdir(parents=True, exist_ok=True)

    async def create_generation_record(
        self,
        db: AsyncSession,
        *,
        user_id: Optional[UUID],
        source_mode: str,
        generation_result: dict[str, Any],
        request_payload: Optional[dict[str, Any]] = None,
        title: Optional[str] = None,
        tags: Optional[Iterable[str]] = None,
        parent_id: Optional[UUID] = None,
        batch_task_id: Optional[UUID] = None,
    ) -> Optional[PosterGeneration]:
        """将一次成功生成写入作品库。"""
        if not generation_result.get("success"):
            return None

        image_url = generation_result.get("image_url")
        if not image_url:
            return None

        payload = request_payload or {}
        aspect_ratio = (
            generation_result.get("aspect_ratio")
            or payload.get("aspect_ratio")
            or payload.get("target_ratio")
            or payload.get("source_ratio")
            or "3:4"
        )
        style_tags = payload.get("style_tags") or generation_result.get("style_tags")
        params = payload.get("params")
        normalized_tags = self._normalize_tags(tags or payload.get("tags"))

        final_title = title or self._build_title(source_mode, payload, generation_result)
        if isinstance(final_title, str):
            final_title = final_title.strip()[:200]

        record = PosterGeneration(
            user_id=user_id,
            mode=source_mode,
            source_mode=source_mode,
            title=final_title,
            prompt=self._extract_user_prompt(source_mode, payload, generation_result),
            tags=normalized_tags,
            template_id=payload.get("template_id"),
            style_tags=style_tags,
            params=params,
            aspect_ratio=aspect_ratio,
            width=generation_result.get("width"),
            height=generation_result.get("height"),
            image_url=image_url,
            thumbnail_url=self.generate_thumbnail(image_url),
            file_size=self.get_file_size(image_url),
            ai_prompt_used=generation_result.get("prompt_used") or generation_result.get("ai_prompt"),
            success=True,
            parent_id=parent_id,
            batch_task_id=batch_task_id,
        )
        db.add(record)
        await db.flush()
        return record

    async def create_export_all_records(
        self,
        db: AsyncSession,
        *,
        user_id: Optional[UUID],
        export_result: dict[str, Any],
        request_payload: Optional[dict[str, Any]] = None,
        parent_id: Optional[UUID] = None,
    ) -> list[PosterGeneration]:
        """将 export_all 的多张图片分别写入作品库。"""
        payload = request_payload or {}
        records: list[PosterGeneration] = []
        base_title = self._build_title("export_all", payload, export_result)

        for image in export_result.get("images", []) or []:
            image_result = {
                "success": True,
                "image_url": image.get("url"),
                "aspect_ratio": image.get("ratio"),
                "width": image.get("width"),
                "height": image.get("height"),
                "prompt_used": payload.get("outpaint_prompt"),
            }
            title = f"{base_title} · {image.get('ratio', 'adapt')}"
            record = await self.create_generation_record(
                db,
                user_id=user_id,
                source_mode="export_all",
                generation_result=image_result,
                request_payload=payload,
                title=title,
                parent_id=parent_id,
            )
            if record:
                records.append(record)
        return records

    async def list_works(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        only_mine: bool = False,
        mode: Optional[list[str]] = None,
        is_favorite: Optional[bool] = None,
        is_template: Optional[bool] = None,
        tags: Optional[list[str]] = None,
        keyword: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        sort_by: str = "created_at",
        order: str = "desc",
        page: int = 1,
        page_size: int = DEFAULT_PAGE_SIZE,
    ) -> dict[str, Any]:
        """分页获取作品列表。only_mine=True 时仅显示当前用户的作品。"""
        page = max(page, 1)
        page_size = max(1, min(page_size, MAX_PAGE_SIZE))

        base_query = select(PosterGeneration)
        if only_mine:
            base_query = base_query.where(PosterGeneration.user_id == user_id)

        query = self._apply_filters(
            base_query,
            mode=mode,
            is_favorite=is_favorite,
            is_template=is_template,
            tags=tags,
            keyword=keyword,
            date_from=date_from,
            date_to=date_to,
        )

        total_query = select(func.count()).select_from(query.order_by(None).subquery())
        total = int((await db.scalar(total_query)) or 0)

        sort_column = {
            "created_at": PosterGeneration.created_at,
            "updated_at": PosterGeneration.updated_at,
            "title": PosterGeneration.title,
        }.get(sort_by, PosterGeneration.created_at)

        if order.lower() == "asc":
            query = query.order_by(sort_column.asc(), PosterGeneration.created_at.asc())
        else:
            query = query.order_by(sort_column.desc(), PosterGeneration.created_at.desc())

        query = query.offset((page - 1) * page_size).limit(page_size)
        works = (await db.execute(query)).scalars().all()

        return {
            "items": [self.serialize_work(work) for work in works],
            "total": total,
            "page": page,
            "page_size": page_size,
            "has_more": page * page_size < total,
        }

    async def get_work_detail(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        work_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """获取单个作品详情。"""
        work = await self._get_owned_work(db, user_id=user_id, work_id=work_id)
        if not work:
            return None
        return self.serialize_work(work, detail=True)

    async def update_work(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        work_id: UUID,
        title: Optional[str],
        tags: Optional[list[str]],
    ) -> Optional[dict[str, Any]]:
        """更新作品标题和标签。"""
        work = await self._get_owned_work(db, user_id=user_id, work_id=work_id)
        if not work:
            return None

        if title is not None:
            work.title = title.strip() or work.title
        if tags is not None:
            work.tags = self._normalize_tags(tags)
        work.updated_at = datetime.utcnow()
        await db.flush()
        return self.serialize_work(work, detail=True)

    async def rename_work(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        work_id: UUID,
        new_title: str,
    ) -> Optional[dict[str, Any]]:
        """
        重命名作品。

        返回更新后的作品序列化字典，若作品不存在或不属于当前用户则返回 None。
        空标题（strip 后长度为 0）也返回 None。
        """
        work = await self._get_owned_work(db, user_id=user_id, work_id=work_id)
        if not work:
            return None

        cleaned_title = new_title.strip()
        if not cleaned_title:
            return None

        work.title = cleaned_title[:200]
        work.updated_at = datetime.utcnow()
        await db.flush()

        return {
            "id": str(work.id),
            "title": work.title,
            "updated_at": work.updated_at.isoformat(),
        }

    async def delete_work(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        work_id: UUID,
    ) -> bool:
        """删除作品记录并清理本地文件。"""
        work = await self._get_owned_work(db, user_id=user_id, work_id=work_id)
        if not work:
            return False

        self._cleanup_work_files(work)
        await db.delete(work)
        await db.flush()
        return True

    async def toggle_favorite(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        work_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """切换收藏状态。"""
        work = await self._get_owned_work(db, user_id=user_id, work_id=work_id)
        if not work:
            return None

        work.is_favorite = not bool(work.is_favorite)
        work.updated_at = datetime.utcnow()
        await db.flush()
        return {
            "id": str(work.id),
            "is_favorite": bool(work.is_favorite),
        }

    async def save_as_template(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        work_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """将作品保存为个人模板。"""
        work = await self._get_owned_work(db, user_id=user_id, work_id=work_id)
        if not work:
            return None

        template = PosterTemplate(
            user_id=user_id,
            name=(work.title or "未命名模板")[:100],
            description=f"由作品 {work.title or str(work.id)} 保存而来",
            thumbnail_url=work.thumbnail_url or work.image_url,
            category="个人模板",
            style_tag=(work.style_tags or [None])[0],
            config=self._build_template_config(work),
            is_system=False,
            is_active=True,
        )
        work.is_template = True
        work.updated_at = datetime.utcnow()
        db.add(template)
        await db.flush()

        return {
            "template_id": str(template.id),
            "name": template.name,
            "is_template": True,
        }

    async def search_works(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        only_mine: bool = False,
        keyword: str,
        page: int = 1,
        page_size: int = DEFAULT_PAGE_SIZE,
    ) -> dict[str, Any]:
        """按标题、标签、提示词搜索作品。"""
        return await self.list_works(
            db,
            user_id=user_id,
            only_mine=only_mine,
            keyword=keyword,
            page=page,
            page_size=page_size,
        )

    async def get_filters(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        only_mine: bool = False,
    ) -> dict[str, Any]:
        """获取可用的筛选项。only_mine=True 时仅统计当前用户的作品。"""
        query = select(
            PosterGeneration.tags,
            PosterGeneration.mode,
            PosterGeneration.source_mode,
        )
        if only_mine:
            query = query.where(PosterGeneration.user_id == user_id)

        rows = (await db.execute(query)).all()

        tag_set: set[str] = set()
        mode_set: set[str] = set()
        for tags, mode, source_mode in rows:
            for tag in tags or []:
                if isinstance(tag, str) and tag.strip():
                    tag_set.add(tag.strip())
            if mode:
                mode_set.add(mode)
            if source_mode:
                mode_set.add(source_mode)

        return {
            "tags": sorted(tag_set),
            "modes": sorted(mode_set),
        }

    async def batch_delete(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        work_ids: list[UUID],
    ) -> dict[str, Any]:
        """批量删除作品。"""
        if not work_ids:
            return {"deleted_count": 0}

        works = (
            await db.execute(
                select(PosterGeneration).where(
                    PosterGeneration.user_id == user_id,
                    PosterGeneration.id.in_(work_ids),
                )
            )
        ).scalars().all()

        for work in works:
            self._cleanup_work_files(work)
            await db.delete(work)

        await db.flush()
        return {"deleted_count": len(works)}

    async def batch_tag(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        work_ids: list[UUID],
        tags: list[str],
    ) -> dict[str, Any]:
        """批量打标签，保留原标签并去重。"""
        if not work_ids:
            return {"updated_count": 0}

        new_tags = self._normalize_tags(tags)
        works = (
            await db.execute(
                select(PosterGeneration).where(
                    PosterGeneration.user_id == user_id,
                    PosterGeneration.id.in_(work_ids),
                )
            )
        ).scalars().all()

        for work in works:
            merged = self._normalize_tags((work.tags or []) + new_tags)
            work.tags = merged
            work.updated_at = datetime.utcnow()

        await db.flush()
        return {"updated_count": len(works), "tags": new_tags}

    def generate_thumbnail(self, image_url: Optional[str]) -> Optional[str]:
        """生成缩略图；若 Pillow 不可用则回退到原图。"""
        file_path = self.resolve_static_path(image_url)
        if not file_path or not file_path.exists():
            return image_url

        thumbnail_dir = (
            tenant_static_path("images/posters/thumbnails")
            if has_runtime_identity()
            else self.thumbnail_dir
        )
        thumbnail_dir.mkdir(parents=True, exist_ok=True)
        thumb_path = thumbnail_dir / f"{file_path.stem}_thumb{file_path.suffix}"
        try:
            from PIL import Image  # type: ignore

            with Image.open(file_path) as image:
                width = 300
                if image.width <= width:
                    image.save(thumb_path)
                else:
                    ratio = width / float(image.width)
                    height = max(1, int(image.height * ratio))
                    resized = image.resize((width, height))
                    resized.save(thumb_path)
            return f"/static/images/posters/thumbnails/{thumb_path.name}"
        except Exception:
            return image_url

    async def backfill_missing_thumbnails(
        self,
        db: AsyncSession,
        *,
        limit: int = 200,
    ) -> dict[str, int]:
        """为历史作品分批补齐缩略图地址，供离线脚本执行。"""
        limit = max(1, min(limit, 1000))
        query = (
            select(PosterGeneration)
            .where(
                PosterGeneration.image_url.is_not(None),
                or_(
                    PosterGeneration.thumbnail_url.is_(None),
                    PosterGeneration.thumbnail_url == "",
                ),
            )
            .order_by(PosterGeneration.created_at.asc())
            .limit(limit)
        )
        works = (await db.execute(query)).scalars().all()
        updated_count = 0
        fallback_count = 0

        for work in works:
            if work.thumbnail_url:
                continue
            thumbnail_url = self.generate_thumbnail(work.image_url)
            if not thumbnail_url:
                continue
            work.thumbnail_url = thumbnail_url
            updated_count += 1
            if thumbnail_url == work.image_url:
                fallback_count += 1

        await db.flush()
        return {
            "scanned_count": len(works),
            "updated_count": updated_count,
            "fallback_count": fallback_count,
        }

    def get_file_size(self, image_url: Optional[str]) -> Optional[int]:
        """获取本地文件大小。"""
        file_path = self.resolve_static_path(image_url)
        if not file_path or not file_path.exists():
            return None
        return int(file_path.stat().st_size)

    def serialize_work(
        self,
        work: PosterGeneration,
        *,
        detail: bool = False,
    ) -> dict[str, Any]:
        """序列化作品模型。"""
        payload = {
            "id": str(work.id),
            "title": work.title,
            "mode": work.mode,
            "source_mode": work.source_mode or work.mode,
            "tags": work.tags or [],
            "aspect_ratio": work.aspect_ratio,
            "image_url": work.image_url,
            "thumbnail_url": work.thumbnail_url or work.image_url,
            "file_size": work.file_size,
            "width": work.width,
            "height": work.height,
            "is_favorite": bool(work.is_favorite),
            "is_template": bool(work.is_template),
            "created_at": work.created_at.isoformat() if work.created_at else None,
            "updated_at": work.updated_at.isoformat() if work.updated_at else None,
        }
        if detail:
            payload.update(
                {
                    "prompt": work.prompt,
                    "style_tags": work.style_tags or [],
                    "params": work.params or {},
                    "ai_prompt_used": work.ai_prompt_used,
                    "parent_id": str(work.parent_id) if work.parent_id else None,
                    "batch_task_id": str(work.batch_task_id) if work.batch_task_id else None,
                    "success": bool(work.success),
                    "template_id": str(work.template_id) if work.template_id else None,
                }
            )
        return payload

    async def _get_owned_work(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        work_id: UUID,
    ) -> Optional[PosterGeneration]:
        result = await db.execute(
            select(PosterGeneration).where(
                PosterGeneration.id == work_id,
                PosterGeneration.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    def _apply_filters(
        self,
        query,
        *,
        mode: Optional[list[str]] = None,
        is_favorite: Optional[bool] = None,
        is_template: Optional[bool] = None,
        tags: Optional[list[str]] = None,
        keyword: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
    ):
        if mode:
            modes = [item.strip() for item in mode if item and item.strip()]
            if modes:
                query = query.where(
                    or_(
                        PosterGeneration.mode.in_(modes),
                        PosterGeneration.source_mode.in_(modes),
                    )
                )

        if is_favorite is not None:
            query = query.where(PosterGeneration.is_favorite == is_favorite)

        if is_template is not None:
            query = query.where(PosterGeneration.is_template == is_template)

        if tags:
            # 使用 cast + ilike 对 JSONB 数组进行文本匹配
            tag_conditions = []
            for tag in tags:
                tag = tag.strip()
                if tag:
                    tag_conditions.append(
                        cast(PosterGeneration.tags, String).ilike(f"%{tag}%")
                    )
            if tag_conditions:
                query = query.where(or_(*tag_conditions))

        if keyword:
            pattern = f"%{keyword.strip()}%"
            query = query.where(
                or_(
                    PosterGeneration.title.ilike(pattern),
                    PosterGeneration.prompt.ilike(pattern),
                    PosterGeneration.ai_prompt_used.ilike(pattern),
                )
            )

        if date_from:
            query = query.where(
                PosterGeneration.created_at >= datetime.combine(date_from, time.min)
            )
        if date_to:
            query = query.where(
                PosterGeneration.created_at <= datetime.combine(date_to, time.max)
            )

        return query

    def _build_title(
        self,
        source_mode: str,
        payload: dict[str, Any],
        result: dict[str, Any],
    ) -> str:
        explicit_title = payload.get("title")
        if isinstance(explicit_title, str) and explicit_title.strip():
            return explicit_title.strip()[:200]

        params = payload.get("params") or {}
        for key in ("title", "name", "subject"):
            value = params.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()[:200]

        prompt = self._extract_user_prompt(source_mode, payload, result)
        if prompt:
            return prompt.replace("\n", " ").strip()[:200]

        template_name = result.get("template_name")
        if isinstance(template_name, str) and template_name.strip():
            return template_name.strip()[:200]

        return f"{source_mode} 作品"

    def _extract_user_prompt(
        self,
        source_mode: str,
        payload: dict[str, Any],
        result: dict[str, Any],
    ) -> Optional[str]:
        prompt_map = {
            "custom": payload.get("prompt"),
            "template": payload.get("params", {}).get("title") if isinstance(payload.get("params"), dict) else None,
            "edit": payload.get("edit_prompt"),
            "style_transfer": ", ".join(payload.get("style_tags", [])) if payload.get("style_tags") else None,
            "inpaint": payload.get("inpaint_prompt"),
            "erase": "智能擦除",
            "adapt": payload.get("outpaint_prompt") or f"{payload.get('source_ratio')} -> {payload.get('target_ratio')}",
            "export_all": payload.get("outpaint_prompt") or f"{payload.get('source_ratio')} 全平台导出",
            "batch": payload.get("prompt"),
        }
        prompt = prompt_map.get(source_mode)
        if isinstance(prompt, str) and prompt.strip():
            return prompt.strip()
        fallback = payload.get("prompt") or result.get("prompt_used") or result.get("ai_prompt")
        if isinstance(fallback, str) and fallback.strip():
            return fallback.strip()
        return None

    def _build_template_config(self, work: PosterGeneration) -> dict[str, Any]:
        params = work.params if isinstance(work.params, dict) else {}
        ai_prompt_template = work.ai_prompt_used or work.prompt or ""

        text_slots = []
        if params:
            for key, value in params.items():
                label = str(key).replace("_", " ").title()
                text_slots.append({"name": key, "label": label, "required": bool(value)})
                if isinstance(value, str) and value:
                    ai_prompt_template = ai_prompt_template.replace(value, f"{{{key}}}")
        else:
            text_slots = [{"name": "title", "label": "标题", "required": True}]
            ai_prompt_template = (
                f"为'{{title}}'生成一张{work.mode}风格海报背景："
                f"{(work.prompt or work.title or '主题海报')[:120]}。"
                "不含文字。"
            )

        return {
            "ai_prompt_template": ai_prompt_template or "生成一张适合叠加文字的海报背景，不含文字。",
            "text_slots": text_slots,
            "color_options": [],
            "default_aspect_ratio": work.aspect_ratio or "3:4",
        }

    def _normalize_tags(self, tags: Optional[Iterable[str]]) -> list[str]:
        if not tags:
            return []

        normalized: list[str] = []
        seen: set[str] = set()
        for tag in tags:
            if not isinstance(tag, str):
                continue
            value = tag.strip()
            if not value:
                continue
            lowered = value.lower()
            if lowered in seen:
                continue
            seen.add(lowered)
            normalized.append(value[:50])
        return normalized

    def resolve_static_path(self, path_or_url: Optional[str]) -> Optional[Path]:
        """将 /static/... 路径解析为本地绝对路径。"""
        if not path_or_url:
            return None

        path_str = str(path_or_url).strip()
        if not path_str:
            return None

        if has_runtime_identity():
            try:
                normalized = path_str if path_str.startswith("/") else f"/{path_str}"
                return resolve_static_url(normalized)
            except ValueError:
                return None

        if path_str.startswith("/static/"):
            relative = path_str.lstrip("/")
            return self.project_root / relative
        if path_str.startswith("static/"):
            return self.project_root / path_str

        candidate = Path(path_str)
        if candidate.is_absolute():
            return candidate
        return self.project_root / path_str.lstrip("/")

    def _cleanup_work_files(self, work: PosterGeneration) -> None:
        for path in {
            self.resolve_static_path(work.image_url),
            self.resolve_static_path(work.thumbnail_url),
        }:
            if path and path.exists():
                try:
                    path.unlink()
                except OSError:
                    continue


gallery_service = GalleryService()
