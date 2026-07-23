"""
个人中心服务层
负责用户资料 CRUD、头像上传、密码修改、创作统计聚合、偏好管理
"""
from __future__ import annotations

import uuid as uuid_mod
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import select, func, case, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_password, get_password_hash
from app.core.media import decode_image_base64
from app.models.user import User, UserPreference
from app.models.poster import PosterGeneration, PosterTemplate
from app.models.brand import BrandKit
from app.core.runtime_context import resolve_static_url, tenant_static_path


class ProfileService:
    """个人中心服务"""

    VALID_IMAGE_PROVIDERS = {"gemini", "gemini_ch", "doubao", "gpt_image"}

    def __init__(self) -> None:
        self.project_root = Path(__file__).resolve().parent.parent.parent
        self.static_root = self.project_root / "static"

    # =====================================================
    # 个人资料
    # =====================================================
    async def get_profile(self, db: AsyncSession, *, user_id: UUID) -> dict[str, Any]:
        """获取用户完整个人资料"""
        stmt = select(User).where(User.id == user_id)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        if user is None:
            return {}
        return self._serialize_profile(user)

    async def update_profile(
        self, db: AsyncSession, *, user_id: UUID, data: dict[str, Any]
    ) -> dict[str, Any]:
        """更新个人资料（昵称、简介）"""
        stmt = select(User).where(User.id == user_id)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        if user is None:
            return {}

        updatable = ["nickname", "bio"]
        for field in updatable:
            if field in data:
                setattr(user, field, data[field])

        user.updated_at = datetime.utcnow()
        await db.flush()
        await db.refresh(user)
        return self._serialize_profile(user)

    # =====================================================
    # 头像上传
    # =====================================================
    async def upload_avatar(
        self, db: AsyncSession, *, user_id: UUID,
        avatar_base64: str, content_type: str = "image/png"
    ) -> str:
        """保存头像并更新 User.avatar_url"""
        decoded = decode_image_base64(
            avatar_base64,
            declared_content_type=content_type,
        )

        upload_dir = tenant_static_path("avatars")
        upload_dir.mkdir(parents=True, exist_ok=True)

        filename = f"avatar_{user_id}_{uuid_mod.uuid4().hex[:8]}{decoded.extension}"
        filepath = upload_dir / filename
        filepath.write_bytes(decoded.data)

        avatar_url = f"/static/avatars/{filename}"

        # 更新用户记录
        stmt = select(User).where(User.id == user_id)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        if user:
            # 清理旧头像
            if user.avatar_url:
                try:
                    old_path = resolve_static_url(user.avatar_url)
                except ValueError:
                    old_path = None
                if old_path and old_path.exists():
                    try:
                        old_path.unlink()
                    except OSError:
                        pass
            user.avatar_url = avatar_url
            user.updated_at = datetime.utcnow()
            await db.flush()

        return avatar_url

    # =====================================================
    # 修改密码
    # =====================================================
    async def change_password(
        self, db: AsyncSession, *, user_id: UUID,
        old_password: str, new_password: str
    ) -> bool:
        """验证旧密码并更新为新密码，成功返回 True"""
        stmt = select(User).where(User.id == user_id)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        if user is None:
            return False

        if not verify_password(old_password, user.password_hash):
            raise ValueError("旧密码错误")

        user.password_hash = get_password_hash(new_password)
        user.updated_at = datetime.utcnow()
        await db.flush()
        return True

    # =====================================================
    # 创作统计
    # =====================================================
    async def get_stats(self, db: AsyncSession, *, user_id: UUID) -> dict[str, Any]:
        """聚合查询用户创作数据"""

        # 1) 总作品数 & 收藏数 & 存储量
        basic_stmt = select(
            func.count(PosterGeneration.id).label("total_works"),
            func.sum(
                case((PosterGeneration.is_favorite == True, 1), else_=0)
            ).label("total_favorites"),
            func.coalesce(func.sum(PosterGeneration.file_size), 0).label("storage_used_bytes"),
        ).where(
            PosterGeneration.user_id == user_id,
            PosterGeneration.success == True,
        )
        basic = (await db.execute(basic_stmt)).one()

        # 2) 个人模板数
        tpl_stmt = select(func.count(PosterTemplate.id)).where(
            PosterTemplate.user_id == user_id,
            PosterTemplate.is_system == False,
        )
        total_templates = (await db.execute(tpl_stmt)).scalar() or 0

        # 3) 模式分布
        mode_stmt = select(
            PosterGeneration.mode,
            func.count(PosterGeneration.id)
        ).where(
            PosterGeneration.user_id == user_id,
            PosterGeneration.success == True,
        ).group_by(PosterGeneration.mode)
        mode_rows = (await db.execute(mode_stmt)).all()
        mode_distribution = {row[0]: row[1] for row in mode_rows}

        # 4) 近 7 天趋势
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        trend_stmt = select(
            func.date(PosterGeneration.created_at).label("day"),
            func.count(PosterGeneration.id)
        ).where(
            PosterGeneration.user_id == user_id,
            PosterGeneration.success == True,
            PosterGeneration.created_at >= seven_days_ago,
        ).group_by("day").order_by("day")
        trend_rows = (await db.execute(trend_stmt)).all()
        recent_trend = [
            {"date": str(row[0]), "count": row[1]} for row in trend_rows
        ]

        # 5) 品牌包状态
        brand_stmt = select(func.count(BrandKit.id)).where(BrandKit.user_id == user_id)
        brand_configured = ((await db.execute(brand_stmt)).scalar() or 0) > 0

        return {
            "total_works": basic.total_works or 0,
            "total_favorites": basic.total_favorites or 0,
            "total_templates": total_templates,
            "storage_used_bytes": basic.storage_used_bytes or 0,
            "mode_distribution": mode_distribution,
            "recent_trend": recent_trend,
            "brand_kit_configured": brand_configured,
        }

    # =====================================================
    # 偏好设置
    # =====================================================
    async def get_preferences(self, db: AsyncSession, *, user_id: UUID) -> dict[str, Any]:
        """获取用户偏好设置"""
        stmt = select(UserPreference).where(UserPreference.user_id == user_id)
        result = await db.execute(stmt)
        pref = result.scalar_one_or_none()
        if pref is None:
            return {
                "default_aspect_ratio": "3:4",
                "default_mode": "custom",
                "default_style_tag": None,
                "auto_save_to_gallery": True,
                "image_provider": None,
                "image_model_config_id": None,
            }
        return self._serialize_prefs(pref)

    async def update_preferences(
        self, db: AsyncSession, *, user_id: UUID, data: dict[str, Any]
    ) -> dict[str, Any]:
        """创建或更新用户偏好设置"""
        stmt = select(UserPreference).where(UserPreference.user_id == user_id)
        result = await db.execute(stmt)
        pref = result.scalar_one_or_none()

        if pref is None:
            pref = UserPreference(user_id=user_id)
            db.add(pref)

        updatable = [
            "default_aspect_ratio", "default_mode",
            "default_style_tag", "auto_save_to_gallery",
            "image_provider", "image_model_config_id",
        ]
        for field in updatable:
            if field in data:
                if field == "image_provider" and data[field] not in self.VALID_IMAGE_PROVIDERS:
                    data[field] = None
                if field == "image_model_config_id" and data[field]:
                    from app.services.image_model_service import image_model_service

                    config = await image_model_service.get_config(
                        db,
                        config_id=data[field],
                        active_only=True,
                    )
                    if not config:
                        raise ValueError("选择的图片模型不存在或未启用")
                setattr(pref, field, data[field])

        if "image_model_config_id" in data and data.get("image_model_config_id"):
            pref.image_provider = None
        if "image_provider" in data and data.get("image_provider"):
            pref.image_model_config_id = None

        pref.updated_at = datetime.utcnow()
        await db.flush()
        await db.refresh(pref)
        return self._serialize_prefs(pref)

    # =====================================================
    # 序列化
    # =====================================================
    def _serialize_profile(self, user: User) -> dict[str, Any]:
        return {
            "id": str(user.id),
            "username": user.username,
            "avatar_url": user.avatar_url,
            "nickname": user.nickname or user.username,
            "bio": user.bio,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "updated_at": user.updated_at.isoformat() if user.updated_at else None,
        }

    def _serialize_prefs(self, pref: UserPreference) -> dict[str, Any]:
        return {
            "default_aspect_ratio": pref.default_aspect_ratio,
            "default_mode": pref.default_mode,
            "default_style_tag": pref.default_style_tag,
            "auto_save_to_gallery": pref.auto_save_to_gallery,
            "image_provider": pref.image_provider if pref.image_provider in self.VALID_IMAGE_PROVIDERS else None,
            "image_model_config_id": str(pref.image_model_config_id) if pref.image_model_config_id else None,
        }


    # =====================================================
    # 快捷查询（供其他模块调用）
    # =====================================================
    async def get_user_image_provider(
        self, db: AsyncSession, *, user_id: UUID
    ) -> Optional[str]:
        """快速查询用户选择的图片生成引擎，None 表示跟随系统"""
        stmt = select(UserPreference.image_provider).where(
            UserPreference.user_id == user_id
        )
        result = await db.execute(stmt)
        row = result.scalar_one_or_none()
        return row if row in self.VALID_IMAGE_PROVIDERS else None

    async def get_user_image_model_config(
        self, db: AsyncSession, *, user_id: UUID
    ) -> Optional[dict[str, Any]]:
        """查询用户选择的公共图片模型配置，None 表示未选择动态模型。"""
        stmt = select(UserPreference.image_model_config_id).where(
            UserPreference.user_id == user_id
        )
        result = await db.execute(stmt)
        config_id = result.scalar_one_or_none()
        if not config_id:
            return None

        from app.services.image_model_service import image_model_service

        config = await image_model_service.get_config(
            db,
            config_id=config_id,
            active_only=True,
        )
        if not config:
            return None
        return image_model_service.runtime_config(config)


# 模块级单例
profile_service = ProfileService()
