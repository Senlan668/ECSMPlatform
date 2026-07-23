"""
全站公共图片模型配置服务
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from urllib.parse import urlsplit
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.image_model import ImageModelConfig
from app.models.user import User, UserPreference
from app.services.admin_service import admin_service


class ImageModelService:
    """公共图片模型配置管理。"""

    VALID_PROVIDER_TYPES = {"openai_image", "gemini", "doubao"}

    async def is_admin(self, db: AsyncSession, user: User) -> bool:
        """兼容旧调用，统一委托给通用管理员服务。"""
        return await admin_service.is_admin(db, user)

    async def list_configs(
        self,
        db: AsyncSession,
        *,
        include_inactive: bool = False,
    ) -> list[ImageModelConfig]:
        query = select(ImageModelConfig)
        if not include_inactive:
            query = query.where(ImageModelConfig.is_active == True)
        query = query.order_by(
            ImageModelConfig.is_default.desc(),
            ImageModelConfig.sort_order.asc(),
            ImageModelConfig.created_at.desc(),
        )
        return (await db.execute(query)).scalars().all()

    async def get_config(
        self,
        db: AsyncSession,
        *,
        config_id: UUID,
        active_only: bool = False,
    ) -> Optional[ImageModelConfig]:
        query = select(ImageModelConfig).where(ImageModelConfig.id == config_id)
        if active_only:
            query = query.where(ImageModelConfig.is_active == True)
        return (await db.execute(query)).scalar_one_or_none()

    async def get_default_config(self, db: AsyncSession) -> Optional[ImageModelConfig]:
        query = (
            select(ImageModelConfig)
            .where(
                ImageModelConfig.is_active == True,
                ImageModelConfig.is_default == True,
            )
            .order_by(ImageModelConfig.sort_order.asc())
            .limit(1)
        )
        return (await db.execute(query)).scalar_one_or_none()

    async def resolve_runtime_config(
        self,
        db: AsyncSession,
        *,
        user_id: Optional[UUID] = None,
        legacy_provider: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Resolve a user's active model, then the tenant default model."""
        if user_id is not None:
            selected_id = (
                await db.execute(
                    select(UserPreference.image_model_config_id).where(
                        UserPreference.user_id == user_id
                    )
                )
            ).scalar_one_or_none()
            if selected_id:
                selected = await self.get_config(
                    db,
                    config_id=selected_id,
                    active_only=True,
                )
                if selected:
                    return self.runtime_config(selected)

        if legacy_provider:
            return None
        default_config = await self.get_default_config(db)
        return self.runtime_config(default_config) if default_config else None

    async def create_config(self, db: AsyncSession, data: dict[str, Any]) -> ImageModelConfig:
        provider_type = self._normalize_provider_type(data.get("provider_type"))
        if data.get("is_default"):
            await self._clear_default(db)

        config = ImageModelConfig(
            name=(data.get("name") or "").strip(),
            provider_type=provider_type,
            base_url=(data.get("base_url") or "").strip().rstrip("/"),
            model_name=(data.get("model_name") or "").strip(),
            api_key=(data.get("api_key") or "").strip(),
            description=(data.get("description") or "").strip() or None,
            is_active=bool(data.get("is_active", True)),
            is_default=bool(data.get("is_default", False)),
            sort_order=int(data.get("sort_order") or 0),
        )
        if config.is_default:
            config.is_active = True
        self._validate_config(config)
        db.add(config)
        await db.flush()
        await db.refresh(config)
        return config

    async def update_config(
        self,
        db: AsyncSession,
        *,
        config_id: UUID,
        data: dict[str, Any],
    ) -> Optional[ImageModelConfig]:
        config = await self.get_config(db, config_id=config_id)
        if not config:
            return None

        if "provider_type" in data and data["provider_type"] is not None:
            config.provider_type = self._normalize_provider_type(data["provider_type"])
        for field in ["name", "base_url", "model_name", "description"]:
            if field in data and data[field] is not None:
                value = data[field].strip() if isinstance(data[field], str) else data[field]
                if field == "base_url":
                    value = value.rstrip("/")
                setattr(config, field, value or None)
        if data.get("api_key"):
            config.api_key = data["api_key"].strip()
        if "is_active" in data and data["is_active"] is not None:
            config.is_active = bool(data["is_active"])
            if not config.is_active:
                config.is_default = False
        if "is_default" in data and data["is_default"] is not None:
            config.is_default = bool(data["is_default"])
        if config.is_default:
            config.is_active = True
        if "sort_order" in data and data["sort_order"] is not None:
            config.sort_order = int(data["sort_order"])
        if config.is_default:
            await self._clear_default(db, except_id=config.id)

        config.updated_at = datetime.utcnow()
        self._validate_config(config)
        await db.flush()
        await db.refresh(config)
        return config

    async def delete_config(self, db: AsyncSession, *, config_id: UUID) -> bool:
        config = await self.get_config(db, config_id=config_id)
        if not config:
            return False
        await db.execute(
            update(UserPreference)
            .where(UserPreference.image_model_config_id == config_id)
            .values(image_model_config_id=None)
        )
        await db.delete(config)
        await db.flush()
        return True

    async def set_default(self, db: AsyncSession, *, config_id: UUID) -> Optional[ImageModelConfig]:
        config = await self.get_config(db, config_id=config_id)
        if not config:
            return None
        await self._clear_default(db, except_id=config.id)
        config.is_default = True
        config.is_active = True
        config.updated_at = datetime.utcnow()
        await db.flush()
        await db.refresh(config)
        return config

    def serialize(self, config: ImageModelConfig, *, include_secret: bool = False) -> dict[str, Any]:
        return {
            "id": str(config.id),
            "name": config.name,
            "provider_type": config.provider_type,
            "base_url": config.base_url,
            "model_name": config.model_name,
            "api_key": config.api_key if include_secret else self.mask_api_key(config.api_key),
            "description": config.description,
            "is_active": bool(config.is_active),
            "is_default": bool(config.is_default),
            "sort_order": int(config.sort_order or 0),
            "created_at": config.created_at.isoformat() if config.created_at else None,
            "updated_at": config.updated_at.isoformat() if config.updated_at else None,
        }

    def runtime_config(self, config: ImageModelConfig) -> dict[str, Any]:
        return {
            "id": str(config.id),
            "name": config.name,
            "provider_type": config.provider_type,
            "base_url": config.base_url,
            "model_name": config.model_name,
            "api_key": config.api_key,
        }

    def mask_api_key(self, api_key: str) -> str:
        if not api_key:
            return ""
        if len(api_key) <= 8:
            return "***"
        return f"{api_key[:4]}****{api_key[-4:]}"

    async def _clear_default(self, db: AsyncSession, *, except_id: Optional[UUID] = None) -> None:
        configs = (await db.execute(select(ImageModelConfig))).scalars().all()
        for config in configs:
            if except_id and config.id == except_id:
                continue
            config.is_default = False

    def _normalize_provider_type(self, provider_type: Optional[str]) -> str:
        value = (provider_type or "").strip()
        if value not in self.VALID_PROVIDER_TYPES:
            raise ValueError(f"不支持的模型类型: {provider_type}")
        return value

    def _validate_config(self, config: ImageModelConfig) -> None:
        if not config.name:
            raise ValueError("模型名称不能为空")
        if config.provider_type not in self.VALID_PROVIDER_TYPES:
            raise ValueError(f"不支持的模型类型: {config.provider_type}")
        if not config.base_url:
            raise ValueError("Base URL 不能为空")
        parsed_url = urlsplit(config.base_url)
        if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
            raise ValueError("Base URL 必须是有效的 HTTP 或 HTTPS 地址")
        if parsed_url.username or parsed_url.password or parsed_url.query or parsed_url.fragment:
            raise ValueError("Base URL 不能包含账号、密码、查询参数或片段")
        if not config.model_name:
            raise ValueError("模型名称/Model 不能为空")
        if not config.api_key:
            raise ValueError("API Key 不能为空")


image_model_service = ImageModelService()
