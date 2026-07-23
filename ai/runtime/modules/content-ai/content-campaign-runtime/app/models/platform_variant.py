"""
平台适配版本数据模型

存储文章的多平台改写结果，每篇原文对应多个平台版本。
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, DateTime, Integer, Boolean, JSON, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from app.core.db import Base


class PlatformVariant(Base):
    """
    平台适配版本表

    存储每篇文章针对不同平台的改写结果。
    一篇原文可对应多条 PlatformVariant 记录（一对多）。
    """
    __tablename__ = "platform_variants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
        comment="所属用户",
    )

    # ========== 来源关联 ==========
    source_thread_id = Column(
        String(200),
        nullable=True,
        index=True,
        comment="关联的工作流 thread_id（原文来自工作流时填写）",
    )
    source_article = Column(
        Text,
        nullable=False,
        comment="原文内容（冗余存储，防止原文删除后丢失）",
    )
    source_title = Column(
        String(200),
        nullable=True,
        comment="原文标题 / 选题",
    )

    # ========== 平台信息 ==========
    platform = Column(
        String(30),
        nullable=False,
        index=True,
        comment="目标平台标识 (xiaohongshu/douyin/wechat/bilibili/weibo)",
    )

    # ========== 改写结果 ==========
    adapted_content = Column(
        Text,
        nullable=False,
        comment="改写后的文案",
    )
    suggested_title = Column(
        String(200),
        nullable=True,
        comment="AI 推荐的适配标题",
    )
    suggested_tags = Column(
        JSON,
        nullable=True,
        default=list,
        comment="AI 推荐的标签列表",
    )
    word_count = Column(
        Integer,
        nullable=True,
        comment="改写后的字数",
    )
    image_ratio = Column(
        String(20),
        nullable=True,
        comment="推荐的图片比例",
    )

    # ========== 用户编辑 ==========
    is_edited = Column(
        Boolean,
        default=False,
        comment="用户是否手动编辑过改写结果",
    )

    # ========== 元数据 ==========
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<PlatformVariant {self.id} platform={self.platform}>"
