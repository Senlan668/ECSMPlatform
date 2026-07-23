"""
个人中心 API 路由
提供用户资料查看/编辑、头像上传、密码修改、创作统计、偏好设置
"""
from __future__ import annotations

from typing import Any, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.media import ImageBase64
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.services.profile_service import profile_service

router = APIRouter(prefix="/profile", tags=["Profile"])


# ========== 请求/响应模型 ==========

class ProfileUpdateRequest(BaseModel):
    """更新个人资料"""
    nickname: Optional[str] = Field(default=None, max_length=50)
    bio: Optional[str] = Field(default=None, max_length=200)


class AvatarUploadRequest(BaseModel):
    """头像上传"""
    avatar_base64: ImageBase64
    content_type: Literal["image/png", "image/jpeg", "image/webp"] = "image/png"


class ChangePasswordRequest(BaseModel):
    """修改密码"""
    old_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6, max_length=100)


class PreferencesUpdateRequest(BaseModel):
    """偏好设置更新"""
    default_aspect_ratio: Optional[str] = None
    default_mode: Optional[str] = None
    default_style_tag: Optional[str] = None
    auto_save_to_gallery: Optional[bool] = None
    image_provider: Optional[str] = None
    image_model_config_id: Optional[UUID] = None


# ========== 路由 ==========

@router.get("/me", summary="获取当前用户完整资料")
async def get_my_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await profile_service.get_profile(db, user_id=current_user.id)


@router.put("/me", summary="更新个人资料")
async def update_my_profile(
    request: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    data = request.model_dump(exclude_unset=True)
    return await profile_service.update_profile(db, user_id=current_user.id, data=data)


@router.post("/avatar", summary="上传头像")
async def upload_avatar(
    request: AvatarUploadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    try:
        avatar_url = await profile_service.upload_avatar(
            db,
            user_id=current_user.id,
            avatar_base64=request.avatar_base64,
            content_type=request.content_type,
        )
        return {"avatar_url": avatar_url}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"头像上传失败: {str(e)}",
        )


@router.put("/password", summary="修改密码")
async def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="账号密码由 Core Control Plane 统一管理",
    )


@router.get("/stats", summary="获取创作统计数据")
async def get_my_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await profile_service.get_stats(db, user_id=current_user.id)


@router.get("/preferences", summary="获取偏好设置")
async def get_my_preferences(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await profile_service.get_preferences(db, user_id=current_user.id)


@router.put("/preferences", summary="更新偏好设置")
async def update_my_preferences(
    request: PreferencesUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    data = request.model_dump(exclude_unset=True)
    try:
        return await profile_service.update_preferences(db, user_id=current_user.id, data=data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e
