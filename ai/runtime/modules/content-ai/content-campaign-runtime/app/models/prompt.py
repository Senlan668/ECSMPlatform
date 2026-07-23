"""
提示词收藏模型
用户收藏的高效 Prompt 片段，支持分类、标签和公共共享
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Text, Integer, Boolean, JSON, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from app.core.db import Base


class PromptSnippet(Base):
    """提示词收藏表 — 用户收藏的高质量 Prompt 片段"""
    __tablename__ = "prompt_snippets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
        index=True,
        comment="所属用户，NULL = 系统预置公共 Prompt"
    )

    # 基本信息
    title = Column(String(100), nullable=False, comment="简短标题")
    content = Column(Text, nullable=False, comment="Prompt 正文")
    category = Column(
        String(30), default="poster", index=True,
        comment="分类: poster | workflow | other"
    )
    tags = Column(JSON, nullable=True, comment="标签列表，如 ['海报', '科技风']")

    # 来源追溯
    source_mode = Column(
        String(30), nullable=True,
        comment="来源场景: custom | edit | batch | style 等"
    )

    # 共享与统计
    is_public = Column(Boolean, default=False, index=True, comment="是否公开共享")
    use_count = Column(Integer, default=0, comment="被引用次数")
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<PromptSnippet {self.title} user={self.user_id}>"
