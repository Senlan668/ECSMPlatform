"""
品牌包服务层
负责品牌包的 CRUD 和 Logo 上传
"""
from __future__ import annotations

import uuid as uuid_mod
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.brand import BrandKit
from app.core.media import decode_image_base64
from app.core.runtime_context import resolve_static_url, tenant_static_path


class BrandService:
    """品牌包服务"""

    def __init__(self) -> None:
        self.project_root = Path(__file__).resolve().parent.parent.parent
        self.static_root = self.project_root / "static"

    # ========== 查询 ==========
    async def get_brand_kit(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
    ) -> Optional[BrandKit]:
        """获取当前用户的品牌包，不存在则返回 None"""
        stmt = select(BrandKit).where(BrandKit.user_id == user_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    # ========== 创建或更新 ==========
    async def upsert_brand_kit(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        data: dict[str, Any],
    ) -> BrandKit:
        """
        创建或更新品牌包。
        若已存在则更新已有记录；否则新建。
        """
        kit = await self.get_brand_kit(db, user_id=user_id)

        if kit is None:
            kit = BrandKit(user_id=user_id)
            db.add(kit)

        # 可更新的字段白名单
        updatable = [
            "brand_name", "logo_url", "colors",
            "font_style", "tone", "tone_prompt",
            "banned_words", "extra",
        ]
        for field in updatable:
            if field in data:
                setattr(kit, field, data[field])

        kit.updated_at = datetime.utcnow()
        await db.flush()
        await db.refresh(kit)
        return kit

    # ========== 上传 Logo ==========
    async def upload_logo(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        logo_base64: str,
        content_type: str = "image/png",
    ) -> str:
        """
        将 Base64 Logo 保存到 static 目录并更新 brand_kit 的 logo_url。
        返回可访问的 URL 路径。
        """
        decoded = decode_image_base64(
            logo_base64,
            declared_content_type=content_type,
        )

        # 保存文件
        upload_dir = tenant_static_path("brand_logos")
        upload_dir.mkdir(parents=True, exist_ok=True)

        filename = f"logo_{user_id}_{uuid_mod.uuid4().hex[:8]}{decoded.extension}"
        filepath = upload_dir / filename

        filepath.write_bytes(decoded.data)

        # 构建相对 URL
        logo_url = f"/static/brand_logos/{filename}"

        # 更新数据库
        kit = await self.get_brand_kit(db, user_id=user_id)
        if kit is None:
            kit = BrandKit(user_id=user_id, logo_url=logo_url)
            db.add(kit)
        else:
            # 清理旧 Logo 文件
            if kit.logo_url:
                try:
                    old_path = resolve_static_url(kit.logo_url)
                except ValueError:
                    old_path = None
                if old_path and old_path.exists():
                    try:
                        old_path.unlink()
                    except OSError:
                        pass
            kit.logo_url = logo_url

        kit.updated_at = datetime.utcnow()
        await db.flush()
        await db.refresh(kit)
        return logo_url

    # ========== 重置 ==========
    async def reset_brand_kit(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
    ) -> bool:
        """删除用户的品牌包记录，并清理 Logo 文件"""
        kit = await self.get_brand_kit(db, user_id=user_id)
        if kit is None:
            return False

        # 清理 Logo 文件
        if kit.logo_url:
            try:
                filepath = resolve_static_url(kit.logo_url)
            except ValueError:
                filepath = None
            if filepath and filepath.exists():
                try:
                    filepath.unlink()
                except OSError:
                    pass

        await db.delete(kit)
        await db.flush()
        return True

    # ========== 序列化 ==========
    def serialize(self, kit: BrandKit) -> dict[str, Any]:
        """将 BrandKit 模型序列化为字典"""
        return {
            "id": str(kit.id),
            "user_id": str(kit.user_id),
            "brand_name": kit.brand_name,
            "logo_url": kit.logo_url,
            "colors": kit.colors or [],
            "font_style": kit.font_style,
            "tone": kit.tone,
            "tone_prompt": kit.tone_prompt,
            "banned_words": kit.banned_words or [],
            "extra": kit.extra,
            "created_at": kit.created_at.isoformat() if kit.created_at else None,
            "updated_at": kit.updated_at.isoformat() if kit.updated_at else None,
        }


# 模块级单例
brand_service = BrandService()
