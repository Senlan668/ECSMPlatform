"""
品牌包数据模型
每个用户拥有一个 BrandKit，用于定义品牌视觉规范和表达口吻
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID

from app.core.db import Base


class BrandKit(Base):
    """
    品牌包 — 记录用户的专属品牌视觉规范与表达调性。
    每个用户仅拥有一个品牌包 (user_id UNIQUE)。
    """
    __tablename__ = "brand_kits"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        unique=True,
        index=True,
        comment="关联用户，每用户唯一"
    )

    # ========== 基础信息 ==========
    brand_name = Column(String(100), nullable=True, comment="品牌名称")
    logo_url = Column(String(500), nullable=True, comment="Logo 图片路径")

    # ========== 视觉识别 (VI) ==========
    colors = Column(JSON, nullable=True, comment="品牌色板 ['#FF6B00', '#1A1A2E', ...]")
    font_style = Column(String(50), nullable=True, comment="字体偏好: 无衬线粗体 / 优雅衬线体 / 手写书法体 等")

    # ========== 品牌调性 (Tone of Voice) ==========
    tone = Column(String(50), nullable=True, default="专业严谨", comment="默认口吻: 专业严谨 / 轻松活泼 / 知性优雅 ...")
    tone_prompt = Column(Text, nullable=True, comment="口吻补充提示词，注入 System Prompt")
    banned_words = Column(JSON, nullable=True, comment="禁用词列表 ['竞品名', '极限词', ...]")

    # ========== 扩展预留 ==========
    extra = Column(JSON, nullable=True, comment="预留扩展字段 (slogan、水印配置等)")

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<BrandKit user={self.user_id} brand={self.brand_name}>"
