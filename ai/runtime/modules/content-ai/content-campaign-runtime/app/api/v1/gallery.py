"""
作品库 / 素材中心 API
"""
from __future__ import annotations

from datetime import date
from typing import Any, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.services.gallery_service import gallery_service

router = APIRouter(prefix="/gallery", tags=["Gallery"])


def _parse_csv(value: Optional[str]) -> Optional[list[str]]:
    if not value:
        return None
    items = [item.strip() for item in value.split(",") if item.strip()]
    return items or None


class GalleryWorkSummary(BaseModel):
    id: str
    title: Optional[str] = None
    mode: str
    source_mode: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    aspect_ratio: Optional[str] = None
    image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    file_size: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    is_favorite: bool = False
    is_template: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class GalleryWorkDetail(GalleryWorkSummary):
    prompt: Optional[str] = None
    style_tags: list[str] = Field(default_factory=list)
    params: dict[str, Any] = Field(default_factory=dict)
    ai_prompt_used: Optional[str] = None
    parent_id: Optional[str] = None
    batch_task_id: Optional[str] = None
    success: bool = True
    template_id: Optional[str] = None


class GalleryListResponse(BaseModel):
    items: list[GalleryWorkSummary] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 20
    has_more: bool = False


class UpdateGalleryWorkRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    tags: Optional[list[str]] = Field(default=None)


class DeleteResponse(BaseModel):
    success: bool
    deleted_count: int = 1


class FavoriteResponse(BaseModel):
    id: str
    is_favorite: bool


class SaveAsTemplateResponse(BaseModel):
    template_id: str
    name: str
    is_template: bool


class FiltersResponse(BaseModel):
    tags: list[str] = Field(default_factory=list)
    modes: list[str] = Field(default_factory=list)


class BatchDeleteRequest(BaseModel):
    ids: list[UUID] = Field(..., min_length=1)


class BatchDeleteResponse(BaseModel):
    deleted_count: int


class RenameWorkRequest(BaseModel):
    """重命名请求体"""
    new_title: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="新的作品名称，1-200 个字符",
    )


class RenameWorkResponse(BaseModel):
    """重命名响应体"""
    id: str
    title: str
    updated_at: str


class BatchTagRequest(BaseModel):
    ids: list[UUID] = Field(..., min_length=1)
    tags: list[str] = Field(..., min_length=1)


class BatchTagResponse(BaseModel):
    updated_count: int
    tags: list[str] = Field(default_factory=list)


@router.get("/list", response_model=GalleryListResponse, summary="分页获取作品列表")
async def get_gallery_list(
    mode: Optional[str] = Query(default=None),
    is_favorite: Optional[bool] = Query(default=None),
    is_template: Optional[bool] = Query(default=None),
    tags: Optional[str] = Query(default=None),
    keyword: Optional[str] = Query(default=None),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    sort_by: Literal["created_at", "updated_at", "title"] = Query(default="created_at"),
    order: Literal["asc", "desc"] = Query(default="desc"),
    only_mine: bool = Query(default=True, description="仅显示当前用户的作品"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> GalleryListResponse:
    return GalleryListResponse(
        **(
            await gallery_service.list_works(
                db,
                user_id=current_user.id,
                only_mine=only_mine,
                mode=_parse_csv(mode),
                is_favorite=is_favorite,
                is_template=is_template,
                tags=_parse_csv(tags),
                keyword=keyword,
                date_from=date_from,
                date_to=date_to,
                sort_by=sort_by,
                order=order,
                page=page,
                page_size=page_size,
            )
        )
    )


@router.get("/search", response_model=GalleryListResponse, summary="搜索作品")
async def search_gallery(
    keyword: str = Query(..., min_length=1),
    only_mine: bool = Query(default=True, description="仅搜索当前用户的作品"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> GalleryListResponse:
    return GalleryListResponse(
        **(
            await gallery_service.search_works(
                db,
                user_id=current_user.id,
                only_mine=only_mine,
                keyword=keyword,
                page=page,
                page_size=page_size,
            )
        )
    )


@router.get("/filters", response_model=FiltersResponse, summary="获取筛选项")
async def get_gallery_filters(
    only_mine: bool = Query(default=True, description="仅统计当前用户的作品"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> FiltersResponse:
    return FiltersResponse(
        **(await gallery_service.get_filters(db, user_id=current_user.id, only_mine=only_mine))
    )


@router.post("/batch-delete", response_model=BatchDeleteResponse, summary="批量删除作品")
async def batch_delete_gallery(
    request: BatchDeleteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> BatchDeleteResponse:
    return BatchDeleteResponse(
        **(
            await gallery_service.batch_delete(
                db,
                user_id=current_user.id,
                work_ids=request.ids,
            )
        )
    )


@router.post("/batch-tag", response_model=BatchTagResponse, summary="批量打标签")
async def batch_tag_gallery(
    request: BatchTagRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> BatchTagResponse:
    return BatchTagResponse(
        **(
            await gallery_service.batch_tag(
                db,
                user_id=current_user.id,
                work_ids=request.ids,
                tags=request.tags,
            )
        )
    )


@router.patch(
    "/{work_id}/rename",
    response_model=RenameWorkResponse,
    summary="重命名作品",
)
async def rename_gallery_work(
    work_id: UUID,
    request: RenameWorkRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> RenameWorkResponse:
    result = await gallery_service.rename_work(
        db,
        user_id=current_user.id,
        work_id=work_id,
        new_title=request.new_title,
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="作品不存在或无权修改",
        )
    return RenameWorkResponse(**result)


@router.get("/{work_id}", response_model=GalleryWorkDetail, summary="获取作品详情")
async def get_gallery_detail(
    work_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> GalleryWorkDetail:
    detail = await gallery_service.get_work_detail(
        db,
        user_id=current_user.id,
        work_id=work_id,
    )
    if not detail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="作品不存在",
        )
    return GalleryWorkDetail(**detail)


@router.put("/{work_id}", response_model=GalleryWorkDetail, summary="更新作品信息")
async def update_gallery_work(
    work_id: UUID,
    request: UpdateGalleryWorkRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> GalleryWorkDetail:
    updated = await gallery_service.update_work(
        db,
        user_id=current_user.id,
        work_id=work_id,
        title=request.title,
        tags=request.tags,
    )
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="作品不存在",
        )
    return GalleryWorkDetail(**updated)


@router.delete("/{work_id}", response_model=DeleteResponse, summary="删除作品")
async def delete_gallery_work(
    work_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> DeleteResponse:
    deleted = await gallery_service.delete_work(
        db,
        user_id=current_user.id,
        work_id=work_id,
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="作品不存在",
        )
    return DeleteResponse(success=True, deleted_count=1)


@router.post("/{work_id}/favorite", response_model=FavoriteResponse, summary="切换收藏状态")
async def toggle_gallery_favorite(
    work_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> FavoriteResponse:
    result = await gallery_service.toggle_favorite(
        db,
        user_id=current_user.id,
        work_id=work_id,
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="作品不存在",
        )
    return FavoriteResponse(**result)


@router.post(
    "/{work_id}/save-as-template",
    response_model=SaveAsTemplateResponse,
    summary="存为个人模板",
)
async def save_gallery_as_template(
    work_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> SaveAsTemplateResponse:
    result = await gallery_service.save_as_template(
        db,
        user_id=current_user.id,
        work_id=work_id,
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="作品不存在",
        )
    return SaveAsTemplateResponse(**result)
