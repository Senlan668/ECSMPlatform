"""
批量生成任务数据模型
包含：BatchTask（批量任务主表）、BatchTaskItem（子任务条目表）
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Text, Integer, Boolean, JSON, ForeignKey, Float
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.db import Base


class BatchTask(Base):
    """
    批量生成任务主表 — 记录一次批量生成的整体状态

    状态流转: pending → running → completed / partial_failed
    """
    __tablename__ = "batch_tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)

    # 任务状态: pending（待执行）/ running（执行中）/ completed（全部完成）/ partial_failed（部分失败）
    status = Column(String(30), nullable=False, default="pending", index=True)

    # 统计字段
    total_count = Column(Integer, nullable=False, default=0)        # 子任务总数
    success_count = Column(Integer, nullable=False, default=0)      # 成功数
    failed_count = Column(Integer, nullable=False, default=0)       # 失败数
    running_count = Column(Integer, nullable=False, default=0)      # 正在执行数

    # 共享生成配置（所有子任务继承此配置）
    shared_config = Column(JSON, nullable=False, default=dict)
    # 共享配置结构示例:
    # {
    #   "mode": "custom" | "template",
    #   "style_tags": ["日系清新"],
    #   "aspect_ratio": "3:4",
    #   "color_tone": "暖色调",
    #   "template_index": 0,          # mode=template 时使用
    #   "series_mode": true,          # 是否启用系列一致性模式
    #   "series_style_anchor": "..."  # 首张图的 prompt，用于风格锚定
    # }

    # 时间戳
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    started_at = Column(DateTime(timezone=True), nullable=True)     # 开始执行时间
    completed_at = Column(DateTime(timezone=True), nullable=True)   # 全部完成时间

    # 关联子任务
    items = relationship("BatchTaskItem", back_populates="batch_task", order_by="BatchTaskItem.order_index")

    def __repr__(self):
        return f"<BatchTask {self.id} status={self.status} {self.success_count}/{self.total_count}>"


class BatchTaskItem(Base):
    """
    批量任务子条目表 — 记录每张图片的独立生成状态

    状态流转: pending → running → success / failed
    """
    __tablename__ = "batch_task_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_task_id = Column(UUID(as_uuid=True), ForeignKey("batch_tasks.id"), nullable=False, index=True)

    # 排列顺序
    order_index = Column(Integer, nullable=False, default=0)

    # 子任务独立参数（覆盖或补充共享配置）
    # 示例: { "title": "春日穿搭", "subtitle": "第一集", "prompt": "..." }
    item_params = Column(JSON, nullable=False, default=dict)

    # 生成状态: pending / running / success / failed
    status = Column(String(20), nullable=False, default="pending", index=True)

    # 生成结果
    image_url = Column(String(500), nullable=True)          # 生成图片路径
    ai_prompt_used = Column(Text, nullable=True)            # 实际使用的 AI 提示词
    error_message = Column(Text, nullable=True)             # 失败时的错误信息

    # 重试计数
    retry_count = Column(Integer, nullable=False, default=0)

    # 时间戳
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # 关联主任务
    batch_task = relationship("BatchTask", back_populates="items")

    def __repr__(self):
        return f"<BatchTaskItem {self.id} order={self.order_index} status={self.status}>"
