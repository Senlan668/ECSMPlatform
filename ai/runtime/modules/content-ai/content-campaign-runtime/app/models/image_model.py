"""
图片模型配置模型
管理员维护的全站公共图片生成模型配置。
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.core.db import Base


class ImageModelConfig(Base):
    """全站公共图片生成模型配置"""
    __tablename__ = "image_model_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    provider_type = Column(String(30), nullable=False, index=True)  # openai_image / gemini / doubao
    base_url = Column(String(500), nullable=False)
    model_name = Column(String(120), nullable=False)
    api_key = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    is_default = Column(Boolean, default=False, index=True)
    sort_order = Column(Integer, default=0, index=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<ImageModelConfig {self.name} type={self.provider_type}>"
