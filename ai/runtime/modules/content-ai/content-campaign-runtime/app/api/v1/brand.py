"""
品牌包 API 路由
提供品牌包的查询、创建/更新、Logo 上传和重置功能
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.media import ImageBase64
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.services.brand_service import brand_service

router = APIRouter(prefix="/brand", tags=["BrandKit"])


# ========== 请求/响应模型 ==========

class BrandKitUpdateRequest(BaseModel):
    """品牌包更新请求"""
    brand_name: Optional[str] = Field(default=None, max_length=100)
    logo_url: Optional[str] = None
    colors: Optional[list[str]] = None
    font_style: Optional[str] = Field(default=None, max_length=50)
    tone: Optional[str] = Field(default=None, max_length=50)
    tone_prompt: Optional[str] = None
    banned_words: Optional[list[str]] = None
    extra: Optional[dict[str, Any]] = None


class LogoUploadRequest(BaseModel):
    """Logo 上传请求"""
    logo_base64: ImageBase64
    content_type: Literal["image/png", "image/jpeg", "image/webp"] = "image/png"


# ========== 路由 ==========

@router.get("/me", summary="获取当前用户的品牌包")
async def get_my_brand_kit(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    kit = await brand_service.get_brand_kit(db, user_id=current_user.id)
    if kit is None:
        # 返回空结构，表示尚未配置
        return {
            "id": None,
            "brand_name": None,
            "logo_url": None,
            "colors": [],
            "font_style": None,
            "tone": "专业严谨",
            "tone_prompt": None,
            "banned_words": [],
            "extra": None,
        }
    return brand_service.serialize(kit)


@router.put("/me", summary="创建或更新品牌包")
async def upsert_my_brand_kit(
    request: BrandKitUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    data = request.model_dump(exclude_unset=True)
    kit = await brand_service.upsert_brand_kit(db, user_id=current_user.id, data=data)
    return brand_service.serialize(kit)


@router.post("/me/logo", summary="上传品牌 Logo")
async def upload_brand_logo(
    request: LogoUploadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    try:
        logo_url = await brand_service.upload_logo(
            db,
            user_id=current_user.id,
            logo_base64=request.logo_base64,
            content_type=request.content_type,
        )
        return {"logo_url": logo_url}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Logo 上传失败: {str(e)}",
        )


@router.delete("/me", summary="重置品牌包")
async def reset_my_brand_kit(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    deleted = await brand_service.reset_brand_kit(db, user_id=current_user.id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="未找到品牌包配置",
        )
    return {"success": True, "message": "品牌包已重置"}
