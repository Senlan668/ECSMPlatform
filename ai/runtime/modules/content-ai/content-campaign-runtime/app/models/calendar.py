"""
内容日历数据模型

CalendarPlan — 月度排期计划（AI 整体生成的计划元数据）
CalendarEvent — 日历内容条目（每天具体的内容安排）
"""
import uuid
from datetime import datetime, date, time

from sqlalchemy import Column, String, Text, DateTime, Date, Time, Integer, Boolean, JSON, ForeignKey, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum

from app.core.db import Base


# ========== 枚举类型 ==========

class ContentType(str, enum.Enum):
    """内容类型四象限"""
    education = "education"           # 教育型：干货、教程、知识分享
    grass = "grass"                   # 种草型：好物推荐、测评、安利
    interaction = "interaction"       # 互动型：话题讨论、投票、问答
    brand_story = "brand_story"       # 品牌故事：个人经历、幕后、价值观


class EventStatus(str, enum.Enum):
    """内容条目状态"""
    draft = "draft"                   # 草稿（仅计划，未创作）
    scheduled = "scheduled"           # 已排期（确认日期）
    in_progress = "in_progress"       # 创作中（已关联工作流）
    published = "published"           # 已发布
    cancelled = "cancelled"           # 已取消


# ========== 月度排期计划 ==========

class CalendarPlan(Base):
    """
    月度排期计划表

    存储 AI 生成的排期计划元数据：品牌定位、行业、月份等。
    一个 plan 对应多条 calendar_event。
    """
    __tablename__ = "calendar_plans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
        comment="所属用户",
    )

    # ========== 计划信息 ==========
    title = Column(
        String(100),
        nullable=False,
        comment="计划名称，如 '3月美妆内容计划'",
    )
    brand_description = Column(
        Text,
        nullable=True,
        comment="品牌/账号定位描述",
    )
    industry = Column(
        String(50),
        nullable=True,
        comment="所属行业",
    )
    year_month = Column(
        String(7),
        nullable=False,
        index=True,
        comment="目标月份，格式 '2026-03'",
    )

    # ========== AI 属性 ==========
    ai_generated = Column(
        Boolean,
        default=False,
        comment="是否由 AI 生成",
    )
    event_count = Column(
        Integer,
        default=0,
        comment="计划包含的内容条目数量",
    )

    # ========== 元数据 ==========
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    # 关联的日历条目
    events = relationship("CalendarEvent", back_populates="plan", lazy="dynamic")

    def __repr__(self):
        return f"<CalendarPlan {self.title} ({self.year_month})>"


# ========== 日历内容条目 ==========

class CalendarEvent(Base):
    """
    日历内容条目表

    每天具体的内容安排。可由 AI 批量生成或用户手动创建。
    """
    __tablename__ = "calendar_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
        comment="所属用户",
    )
    plan_id = Column(
        UUID(as_uuid=True),
        ForeignKey("calendar_plans.id"),
        nullable=True,
        index=True,
        comment="关联排期计划（可选，手动创建的条目可不关联）",
    )

    # ========== 内容信息 ==========
    title = Column(
        String(200),
        nullable=False,
        comment="内容标题",
    )
    content_type = Column(
        String(20),
        nullable=False,
        default=ContentType.education.value,
        comment="内容类型：education/grass/interaction/brand_story",
    )
    platform = Column(
        JSON,
        nullable=True,
        default=list,
        comment="目标平台列表，如 ['xiaohongshu', 'douyin']",
    )
    description = Column(
        Text,
        nullable=True,
        comment="AI 生成的内容简要 / 用户备注",
    )

    # ========== 排期信息 ==========
    scheduled_date = Column(
        Date,
        nullable=False,
        index=True,
        comment="计划发布日期",
    )
    scheduled_time = Column(
        String(5),
        nullable=True,
        comment="建议发布时间，格式 'HH:MM'",
    )
    status = Column(
        String(20),
        nullable=False,
        default=EventStatus.draft.value,
        comment="状态：draft/scheduled/in_progress/published/cancelled",
    )
    priority = Column(
        Integer,
        default=3,
        comment="优先级 1-5，1 最高",
    )

    # ========== 关联 ==========
    hotspot_tag = Column(
        String(50),
        nullable=True,
        comment="关联节日/热点名称（可选）",
    )
    thread_id = Column(
        String(200),
        nullable=True,
        comment="关联已创作工作流的 thread_id（可选）",
    )

    # ========== 元数据 ==========
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关联排期计划
    plan = relationship("CalendarPlan", back_populates="events")

    def __repr__(self):
        return f"<CalendarEvent {self.title} ({self.scheduled_date})>"
