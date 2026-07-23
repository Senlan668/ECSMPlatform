"""
日历 CRUD 管理服务

提供日历条目和排期计划的增删改查操作。
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Dict, List, Optional

from sqlalchemy import select, delete, update, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import async_session_factory
from app.models.calendar import CalendarPlan, CalendarEvent, EventStatus


class CalendarService:
    """日历 CRUD 管理服务单例"""

    # ==================== 排期计划 ====================

    async def create_plan(
        self,
        user_id: uuid.UUID,
        title: str,
        year_month: str,
        brand_description: str = "",
        industry: str = "",
        ai_generated: bool = False,
    ) -> CalendarPlan:
        """创建排期计划"""
        async with async_session_factory() as session:
            plan = CalendarPlan(
                user_id=user_id,
                title=title,
                year_month=year_month,
                brand_description=brand_description,
                industry=industry,
                ai_generated=ai_generated,
            )
            session.add(plan)
            await session.commit()
            await session.refresh(plan)
            return plan

    async def get_plans(self, user_id: uuid.UUID) -> List[Dict]:
        """获取用户的所有排期计划"""
        async with async_session_factory() as session:
            result = await session.execute(
                select(CalendarPlan)
                .where(CalendarPlan.user_id == user_id)
                .order_by(CalendarPlan.created_at.desc())
            )
            plans = result.scalars().all()
            return [self._plan_to_dict(p) for p in plans]

    # ==================== 日历条目 CRUD ====================

    async def create_event(
        self,
        user_id: uuid.UUID,
        title: str,
        scheduled_date: date,
        content_type: str = "education",
        platform: List[str] = None,
        description: str = "",
        scheduled_time: str = None,
        hotspot_tag: str = None,
        plan_id: uuid.UUID = None,
        priority: int = 3,
    ) -> Dict:
        """创建日历内容条目"""
        async with async_session_factory() as session:
            event = CalendarEvent(
                user_id=user_id,
                plan_id=plan_id,
                title=title,
                content_type=content_type,
                platform=platform or [],
                description=description,
                scheduled_date=scheduled_date,
                scheduled_time=scheduled_time,
                status=EventStatus.draft.value,
                hotspot_tag=hotspot_tag,
                priority=priority,
            )
            session.add(event)
            await session.commit()
            await session.refresh(event)
            return self._event_to_dict(event)

    async def batch_create_events(
        self,
        user_id: uuid.UUID,
        events_data: List[Dict],
        plan_id: uuid.UUID = None,
    ) -> List[Dict]:
        """批量创建日历条目（AI 生成计划时使用）"""
        async with async_session_factory() as session:
            created = []
            for data in events_data:
                event = CalendarEvent(
                    user_id=user_id,
                    plan_id=plan_id,
                    title=data["title"],
                    content_type=data.get("content_type", "education"),
                    platform=data.get("platform", []),
                    description=data.get("description", ""),
                    scheduled_date=data["scheduled_date"],
                    scheduled_time=data.get("scheduled_time"),
                    status=EventStatus.scheduled.value,
                    hotspot_tag=data.get("hotspot_tag"),
                    priority=data.get("priority", 3),
                )
                session.add(event)
                created.append(event)

            await session.commit()
            for e in created:
                await session.refresh(e)

            # 更新计划的条目计数
            if plan_id:
                await session.execute(
                    update(CalendarPlan)
                    .where(CalendarPlan.id == plan_id)
                    .values(event_count=len(created))
                )
                await session.commit()

            return [self._event_to_dict(e) for e in created]

    async def get_events_by_month(
        self,
        user_id: uuid.UUID,
        year: int,
        month: int,
        status: str = None,
    ) -> List[Dict]:
        """按月查询用户的日历条目"""
        async with async_session_factory() as session:
            # 计算月份日期范围
            start_date = date(year, month, 1)
            if month == 12:
                end_date = date(year + 1, 1, 1)
            else:
                end_date = date(year, month + 1, 1)

            query = (
                select(CalendarEvent)
                .where(
                    and_(
                        CalendarEvent.user_id == user_id,
                        CalendarEvent.scheduled_date >= start_date,
                        CalendarEvent.scheduled_date < end_date,
                    )
                )
                .order_by(CalendarEvent.scheduled_date, CalendarEvent.priority)
            )

            if status:
                query = query.where(CalendarEvent.status == status)

            result = await session.execute(query)
            events = result.scalars().all()
            return [self._event_to_dict(e) for e in events]

    async def get_event(self, event_id: uuid.UUID, user_id: uuid.UUID) -> Optional[Dict]:
        """获取单个日历条目"""
        async with async_session_factory() as session:
            result = await session.execute(
                select(CalendarEvent).where(
                    and_(
                        CalendarEvent.id == event_id,
                        CalendarEvent.user_id == user_id,
                    )
                )
            )
            event = result.scalar_one_or_none()
            return self._event_to_dict(event) if event else None

    async def update_event(
        self,
        event_id: uuid.UUID,
        user_id: uuid.UUID,
        updates: Dict,
    ) -> Optional[Dict]:
        """更新日历条目（支持拖拽换日期、编辑内容等）"""
        async with async_session_factory() as session:
            result = await session.execute(
                select(CalendarEvent).where(
                    and_(
                        CalendarEvent.id == event_id,
                        CalendarEvent.user_id == user_id,
                    )
                )
            )
            event = result.scalar_one_or_none()
            if not event:
                return None

            # 允许更新的字段白名单
            allowed_fields = {
                "title", "content_type", "platform", "description",
                "scheduled_date", "scheduled_time", "status",
                "hotspot_tag", "priority", "thread_id",
            }
            for key, value in updates.items():
                if key in allowed_fields:
                    # scheduled_date 需要特殊处理字符串转 date
                    if key == "scheduled_date" and isinstance(value, str):
                        value = date.fromisoformat(value)
                    setattr(event, key, value)

            event.updated_at = datetime.utcnow()
            await session.commit()
            await session.refresh(event)
            return self._event_to_dict(event)

    async def delete_event(self, event_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        """删除日历条目"""
        async with async_session_factory() as session:
            result = await session.execute(
                delete(CalendarEvent).where(
                    and_(
                        CalendarEvent.id == event_id,
                        CalendarEvent.user_id == user_id,
                    )
                )
            )
            await session.commit()
            return result.rowcount > 0

    # ==================== 统计 ====================

    async def get_month_stats(self, user_id: uuid.UUID, year: int, month: int) -> Dict:
        """获取月度内容统计（四象限分布）"""
        events = await self.get_events_by_month(user_id, year, month)
        stats = {
            "total": len(events),
            "by_type": {
                "education": 0,
                "grass": 0,
                "interaction": 0,
                "brand_story": 0,
            },
            "by_status": {
                "draft": 0,
                "scheduled": 0,
                "in_progress": 0,
                "published": 0,
                "cancelled": 0,
            },
        }
        for e in events:
            ct = e.get("content_type", "education")
            st = e.get("status", "draft")
            if ct in stats["by_type"]:
                stats["by_type"][ct] += 1
            if st in stats["by_status"]:
                stats["by_status"][st] += 1
        return stats

    # ==================== 序列化 ====================

    def _plan_to_dict(self, plan: CalendarPlan) -> Dict:
        """排期计划序列化"""
        return {
            "id": str(plan.id),
            "title": plan.title,
            "brand_description": plan.brand_description,
            "industry": plan.industry,
            "year_month": plan.year_month,
            "ai_generated": plan.ai_generated,
            "event_count": plan.event_count,
            "created_at": plan.created_at.isoformat() if plan.created_at else None,
        }

    def _event_to_dict(self, event: CalendarEvent) -> Dict:
        """日历条目序列化"""
        return {
            "id": str(event.id),
            "plan_id": str(event.plan_id) if event.plan_id else None,
            "title": event.title,
            "content_type": event.content_type,
            "platform": event.platform or [],
            "description": event.description,
            "scheduled_date": event.scheduled_date.isoformat() if event.scheduled_date else None,
            "scheduled_time": event.scheduled_time,
            "status": event.status,
            "priority": event.priority,
            "hotspot_tag": event.hotspot_tag,
            "thread_id": event.thread_id,
            "created_at": event.created_at.isoformat() if event.created_at else None,
            "updated_at": event.updated_at.isoformat() if event.updated_at else None,
        }


# 单例
calendar_service = CalendarService()
