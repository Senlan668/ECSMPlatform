"""
提示词收藏库 API 路由
提供提示词的列表、创建、更新、删除、发布、Fork 和引用计数功能
"""
from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.services.prompt_service import prompt_service

router = APIRouter(prefix="/prompts", tags=["Prompts"])


# ========== 请求/响应模型 ==========

class CreatePromptRequest(BaseModel):
    """创建提示词请求"""
    title: str = Field(..., max_length=100)
    content: str = Field(...)
    category: str = Field(default="poster", max_length=30)
    tags: Optional[list[str]] = None
    source_mode: Optional[str] = Field(default=None, max_length=30)


class UpdatePromptRequest(BaseModel):
    """更新提示词请求"""
    title: Optional[str] = Field(default=None, max_length=100)
    content: Optional[str] = None
    category: Optional[str] = Field(default=None, max_length=30)
    tags: Optional[list[str]] = None
    source_mode: Optional[str] = Field(default=None, max_length=30)


# ========== 路由 ==========

@router.get("/list", summary="获取提示词列表")
async def list_prompts(
    scope: str = Query(default="mine", pattern="^(all|mine|public)$"),
    category: Optional[str] = Query(default=None),
    keyword: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    items = await prompt_service.list_prompts(
        db,
        user_id=current_user.id,
        scope=scope,
        category=category,
        keyword=keyword,
    )
    return {"items": items, "total": len(items)}


@router.post("/create", summary="收藏/新建提示词")
async def create_prompt(
    request: CreatePromptRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    data = request.model_dump(exclude_unset=True)
    snippet = await prompt_service.create_prompt(
        db,
        user_id=current_user.id,
        data=data,
    )
    return prompt_service.serialize(snippet)


@router.put("/{prompt_id}", summary="编辑提示词")
async def update_prompt(
    prompt_id: UUID,
    request: UpdatePromptRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    data = request.model_dump(exclude_unset=True)
    snippet = await prompt_service.update_prompt(
        db,
        user_id=current_user.id,
        prompt_id=prompt_id,
        data=data,
    )
    if snippet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="提示词不存在或无权编辑",
        )
    return prompt_service.serialize(snippet)


@router.delete("/{prompt_id}", summary="删除提示词")
async def delete_prompt(
    prompt_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    deleted = await prompt_service.delete_prompt(
        db,
        user_id=current_user.id,
        prompt_id=prompt_id,
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="提示词不存在或无权删除",
        )
    return {"success": True}


@router.post("/{prompt_id}/publish", summary="发布为公共提示词")
async def publish_prompt(
    prompt_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    snippet = await prompt_service.publish_prompt(
        db,
        user_id=current_user.id,
        prompt_id=prompt_id,
    )
    if snippet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="提示词不存在或无权发布",
        )
    return prompt_service.serialize(snippet)


@router.post("/{prompt_id}/fork", summary="Fork 公共提示词到个人库")
async def fork_prompt(
    prompt_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    forked = await prompt_service.fork_prompt(
        db,
        user_id=current_user.id,
        prompt_id=prompt_id,
    )
    if forked is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="源提示词不存在",
        )
    return prompt_service.serialize(forked)


@router.post("/{prompt_id}/use", summary="记录引用次数 +1")
async def use_prompt(
    prompt_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    await prompt_service.increment_use_count(db, prompt_id=prompt_id)
    return {"success": True}
