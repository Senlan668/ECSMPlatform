"""
用户模板服务层
负责模板的 CRUD、公共模板 Fork/发布、使用次数统计
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import or_, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.poster import PosterTemplate


class TemplateService:
    """用户模板服务"""

    def __init__(self) -> None:
        self.project_root = Path(__file__).resolve().parent.parent.parent
        self._system_templates_loaded = False

    # =====================================================
    # 查询
    # =====================================================
    async def list_templates(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        scope: str = "all",     # all | system | mine
        category: Optional[str] = None,
        include_inactive: bool = False,
    ) -> list[dict[str, Any]]:
        """
        获取模板列表。
        scope: all = 公共+个人; system = 仅公共; mine = 仅个人
        """
        stmt = select(PosterTemplate)
        if not include_inactive:
            stmt = stmt.where(PosterTemplate.is_active == True)

        if scope == "system":
            stmt = stmt.where(PosterTemplate.is_system == True)
        elif scope == "mine":
            stmt = stmt.where(
                PosterTemplate.user_id == user_id,
                PosterTemplate.is_system == False,
            )
        else:
            # all: 公共模板 + 当前用户的个人模板
            stmt = stmt.where(
                or_(
                    PosterTemplate.is_system == True,
                    PosterTemplate.user_id == user_id,
                )
            )

        if category:
            stmt = stmt.where(PosterTemplate.category == category)

        stmt = stmt.order_by(
            PosterTemplate.is_system.desc(),
            PosterTemplate.sort_order.asc(),
            PosterTemplate.created_at.desc(),
        )

        result = await db.execute(stmt)
        templates = result.scalars().all()
        return [self.serialize(t) for t in templates]

    async def get_template(
        self,
        db: AsyncSession,
        *,
        template_id: UUID,
    ) -> Optional[PosterTemplate]:
        """按 ID 获取模板"""
        stmt = select(PosterTemplate).where(PosterTemplate.id == template_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    # =====================================================
    # 创建
    # =====================================================
    async def create_template(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        data: dict[str, Any],
    ) -> PosterTemplate:
        """创建个人模板"""
        tpl = PosterTemplate(
            user_id=user_id,
            is_system=False,
            name=data.get("name", "未命名模板"),
            description=data.get("description"),
            category=data.get("category"),
            style_tag=data.get("style_tag"),
            config=data.get("config", {}),
            thumbnail_url=data.get("thumbnail_url"),
            source_generation_id=data.get("source_generation_id"),
        )
        db.add(tpl)
        await db.flush()
        await db.refresh(tpl)
        return tpl

    # =====================================================
    # 更新
    # =====================================================
    async def update_template(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        template_id: UUID,
        data: dict[str, Any],
    ) -> Optional[PosterTemplate]:
        """更新个人模板（只允许编辑自己的）"""
        tpl = await self.get_template(db, template_id=template_id)
        if tpl is None or tpl.user_id != user_id:
            return None

        updatable = ["name", "description", "category", "style_tag", "config", "thumbnail_url"]
        for field in updatable:
            if field in data:
                setattr(tpl, field, data[field])

        tpl.updated_at = datetime.utcnow()
        await db.flush()
        await db.refresh(tpl)
        return tpl

    # =====================================================
    # 删除
    # =====================================================
    async def delete_template(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        template_id: UUID,
    ) -> bool:
        """删除个人模板（不允许删除公共模板）"""
        tpl = await self.get_template(db, template_id=template_id)
        if tpl is None or tpl.user_id != user_id or tpl.is_system:
            return False

        await db.delete(tpl)
        await db.flush()
        return True

    async def deactivate_public_template(
        self,
        db: AsyncSession,
        *,
        template_id: UUID,
    ) -> Optional[PosterTemplate]:
        """管理员下架公共模板，保留历史数据和 Fork 来源。"""
        tpl = await self.get_template(db, template_id=template_id)
        if tpl is None or not tpl.is_system:
            return None

        tpl.is_active = False
        tpl.updated_at = datetime.utcnow()
        await db.flush()
        await db.refresh(tpl)
        return tpl

    async def restore_public_template(
        self,
        db: AsyncSession,
        *,
        template_id: UUID,
    ) -> Optional[PosterTemplate]:
        """管理员恢复已下架公共模板。"""
        tpl = await self.get_template(db, template_id=template_id)
        if tpl is None or not tpl.is_system:
            return None

        tpl.is_active = True
        tpl.updated_at = datetime.utcnow()
        await db.flush()
        await db.refresh(tpl)
        return tpl

    # =====================================================
    # Fork 公共模板
    # =====================================================
    async def duplicate_template(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        template_id: UUID,
    ) -> Optional[PosterTemplate]:
        """将公共模板复制为个人模板"""
        source = await self.get_template(db, template_id=template_id)
        if source is None:
            return None

        forked = PosterTemplate(
            user_id=user_id,
            is_system=False,
            name=f"{source.name}（我的副本）",
            description=source.description,
            category=source.category,
            style_tag=source.style_tag,
            config=json.loads(json.dumps(source.config)) if source.config else {},
            thumbnail_url=source.thumbnail_url,
        )
        db.add(forked)
        await db.flush()
        await db.refresh(forked)
        return forked

    # =====================================================
    # 发布个人模板为公共模板
    # =====================================================
    async def publish_template(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        template_id: UUID,
    ) -> Optional[PosterTemplate]:
        """将自己的个人模板复制为公共模板"""
        source = await self.get_template(db, template_id=template_id)
        if source is None or source.user_id != user_id or source.is_system:
            return None

        published = PosterTemplate(
            user_id=None,
            is_system=True,
            name=source.name,
            description=source.description,
            category=source.category,
            style_tag=source.style_tag,
            config=json.loads(json.dumps(source.config)) if source.config else {},
            thumbnail_url=source.thumbnail_url,
            source_generation_id=source.source_generation_id,
            use_count=0,
        )
        db.add(published)
        await db.flush()
        await db.refresh(published)
        return published

    # =====================================================
    # 使用次数 +1
    # =====================================================
    async def increment_use_count(
        self,
        db: AsyncSession,
        *,
        template_id: UUID,
    ) -> None:
        """模板被使用一次，计数+1"""
        tpl = await self.get_template(db, template_id=template_id)
        if tpl:
            tpl.use_count = (tpl.use_count or 0) + 1
            await db.flush()

    # =====================================================
    # 序列化
    # =====================================================
    def serialize(self, tpl: PosterTemplate) -> dict[str, Any]:
        """将模板模型序列化为字典"""
        return {
            "id": str(tpl.id),
            "user_id": str(tpl.user_id) if tpl.user_id else None,
            "name": tpl.name,
            "description": tpl.description,
            "thumbnail_url": tpl.thumbnail_url,
            "category": tpl.category,
            "style_tag": tpl.style_tag,
            "config": tpl.config or {},
            "is_system": tpl.is_system,
            "is_active": tpl.is_active,
            "use_count": tpl.use_count or 0,
            "source_generation_id": str(tpl.source_generation_id) if tpl.source_generation_id else None,
            "created_at": tpl.created_at.isoformat() if tpl.created_at else None,
            "updated_at": tpl.updated_at.isoformat() if tpl.updated_at else None,
        }


# 模块级单例
template_service = TemplateService()
