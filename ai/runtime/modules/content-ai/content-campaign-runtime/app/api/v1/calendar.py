"""
内容日历 API 路由

提供日历条目 CRUD、AI 排期生成、节日热点查询等接口。
"""
from datetime import date, datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.dependencies.auth import get_current_user
from app.core.errors import CapabilityUnavailableError
from app.models.user import User
from app.services.calendar_service import calendar_service
from app.services.calendar_planner_service import calendar_planner_service
from app.data.hotspot_calendar import get_hotspot_summary, get_upcoming_hotspots

router = APIRouter(prefix="/calendar", tags=["Content Calendar"])


# ==================== 请求/响应模型 ====================

class CreateEventRequest(BaseModel):
    """创建日历条目请求"""
    title: str = Field(..., description="内容标题", max_length=200)
    scheduled_date: str = Field(..., description="计划发布日期，格式 YYYY-MM-DD")
    content_type: str = Field(default="education", description="内容类型：education/grass/interaction/brand_story")
    platform: List[str] = Field(default=[], description="目标平台列表")
    description: str = Field(default="", description="内容简要描述")
    scheduled_time: Optional[str] = Field(default=None, description="建议发布时间 HH:MM")
    hotspot_tag: Optional[str] = Field(default=None, description="关联热点名称")
    priority: int = Field(default=3, ge=1, le=5, description="优先级 1-5")


class UpdateEventRequest(BaseModel):
    """更新日历条目请求"""
    title: Optional[str] = Field(default=None, max_length=200)
    content_type: Optional[str] = None
    platform: Optional[List[str]] = None
    description: Optional[str] = None
    scheduled_date: Optional[str] = None
    scheduled_time: Optional[str] = None
    status: Optional[str] = None
    hotspot_tag: Optional[str] = None
    priority: Optional[int] = Field(default=None, ge=1, le=5)
    thread_id: Optional[str] = None


class GeneratePlanRequest(BaseModel):
    """AI 生成排期计划请求"""
    brand_description: str = Field(
        ...,
        description="品牌/账号定位描述",
        min_length=5,
        max_length=500,
    )
    industry: str = Field(
        ...,
        description="所属行业",
        max_length=50,
    )
    year: int = Field(..., description="年份", ge=2024, le=2030)
    month: int = Field(..., description="月份", ge=1, le=12)


# ==================== API 接口 ====================

# ---------- 日历条目 CRUD ----------

@router.get("/events")
async def list_events(
    year: int = Query(..., description="年份"),
    month: int = Query(..., description="月份", ge=1, le=12),
    status: Optional[str] = Query(default=None, description="状态筛选"),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    按月查询日历内容条目

    返回指定月份的所有内容安排，可按状态筛选。
    """
    events = await calendar_service.get_events_by_month(
        user_id=current_user.id,
        year=year,
        month=month,
        status=status,
    )
    stats = await calendar_service.get_month_stats(
        user_id=current_user.id,
        year=year,
        month=month,
    )
    return {
        "events": events,
        "total": len(events),
        "stats": stats,
    }


@router.post("/events")
async def create_event(
    request: CreateEventRequest,
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """创建日历内容条目"""
    try:
        scheduled_date = date.fromisoformat(request.scheduled_date)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="日期格式错误，请使用 YYYY-MM-DD",
        )

    event = await calendar_service.create_event(
        user_id=current_user.id,
        title=request.title,
        scheduled_date=scheduled_date,
        content_type=request.content_type,
        platform=request.platform,
        description=request.description,
        scheduled_time=request.scheduled_time,
        hotspot_tag=request.hotspot_tag,
        priority=request.priority,
    )
    return {"event": event, "message": "创建成功"}


@router.put("/events/{event_id}")
async def update_event(
    event_id: UUID,
    request: UpdateEventRequest,
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    更新日历条目

    支持拖拽换日期、编辑标题/描述/状态等操作。
    """
    updates = request.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="未提供任何更新字段",
        )

    result = await calendar_service.update_event(
        event_id=event_id,
        user_id=current_user.id,
        updates=updates,
    )
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="未找到该日历条目",
        )
    return {"event": result, "message": "更新成功"}


@router.delete("/events/{event_id}")
async def delete_event(
    event_id: UUID,
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """删除日历条目"""
    success = await calendar_service.delete_event(
        event_id=event_id,
        user_id=current_user.id,
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="未找到该日历条目",
        )
    return {"success": True, "message": "已删除"}


# ---------- AI 排期生成 ----------

@router.post("/generate-plan")
async def generate_plan(
    request: GeneratePlanRequest,
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    AI 智能排期生成

    输入品牌定位 + 行业 + 月份，AI 自动生成 30 天内容排期计划。
    包含内容标题、类型、平台、发布时间等完整信息。
    """
    try:
        result = await calendar_planner_service.generate_monthly_plan(
            user_id=current_user.id,
            brand_description=request.brand_description,
            industry=request.industry,
            year=request.year,
            month=request.month,
        )
        return result
    except CapabilityUnavailableError:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI 排期生成失败: {str(e)}",
        )


@router.get("/plans")
async def list_plans(
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """获取用户的所有排期计划列表"""
    plans = await calendar_service.get_plans(user_id=current_user.id)
    return {"plans": plans, "total": len(plans)}


# ---------- 节日热点 ----------

@router.get("/hotspots")
async def get_hotspots(
    month: int = Query(..., description="月份", ge=1, le=12),
) -> Dict[str, Any]:
    """
    获取指定月份的节日热点

    返回该月所有营销节点，包含名称、分类、推荐内容方向等信息。
    无需登录即可访问（公开数据）。
    """
    hotspots = get_hotspot_summary(month)
    return {"hotspots": hotspots, "total": len(hotspots), "month": month}


@router.get("/hotspots/upcoming")
async def get_upcoming(
    month: int = Query(..., ge=1, le=12),
    day: int = Query(..., ge=1, le=31),
    days: int = Query(default=14, ge=1, le=60, description="向前看几天"),
) -> Dict[str, Any]:
    """
    获取即将到来的热点

    从指定日期起未来 N 天内的营销节点，用于侧栏提醒。
    """
    hotspots = get_upcoming_hotspots(month, day, days)
    return {
        "hotspots": [
            {
                "month": h.month,
                "day": h.day,
                "name": h.name,
                "icon": h.icon,
                "category": h.category,
                "content_tips": h.content_tips,
                "is_major": h.is_major,
            }
            for h in hotspots
        ],
        "total": len(hotspots),
    }


# ---------- 工作流集成 ----------

@router.post("/events/{event_id}/create-content")
async def create_content_from_event(
    event_id: UUID,
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    将日历条目推送到工作流创作

    获取日历条目信息，返回用于启动工作流的参数。
    前端拿到参数后调用 /workflow/start 接口。
    """
    event = await calendar_service.get_event(
        event_id=event_id,
        user_id=current_user.id,
    )
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="未找到该日历条目",
        )

    # 更新条目状态为"创作中"
    await calendar_service.update_event(
        event_id=event_id,
        user_id=current_user.id,
        updates={"status": "in_progress"},
    )

    return {
        "message": "已准备创作参数",
        "workflow_params": {
            "topic_direction": event["title"],
            "description": event.get("description", ""),
            "platform": event.get("platform", []),
        },
        "event_id": str(event_id),
    }
