"""
用户模型 & 用户偏好设置模型
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from app.core.db import Base


class User(Base):
    """用户表 — 包含基础认证信息和个人资料"""
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False, comment="是否为后台管理员")
    is_active = Column(Boolean, default=True, nullable=False, comment="账号是否启用")

    # ========== 个人资料扩展 ==========
    avatar_url = Column(String(500), nullable=True, comment="头像 URL")
    nickname = Column(String(50), nullable=True, comment="显示昵称")
    bio = Column(String(200), nullable=True, comment="个人简介")

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<User {self.username}>"


class UserPreference(Base):
    """用户偏好设置表 — 每用户一条记录"""
    __tablename__ = "user_preferences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        unique=True,
        index=True,
        comment="关联用户，每用户唯一"
    )

    # 生成偏好
    default_aspect_ratio = Column(String(20), default="3:4", comment="默认生成比例")
    default_style_tag = Column(String(50), nullable=True, comment="默认风格标签")
    default_mode = Column(String(30), default="custom", comment="默认生成模式")
    auto_save_to_gallery = Column(Boolean, default=True, comment="自动保存到作品库")

    # 图片生成引擎选择
    image_provider = Column(String(20), nullable=True, comment="图片引擎: gemini/gemini_ch/doubao/gpt_image，NULL=跟随系统")
    image_model_config_id = Column(
        UUID(as_uuid=True),
        ForeignKey("image_model_configs.id"),
        nullable=True,
        comment="全站公共图片模型配置 ID，优先级高于 image_provider"
    )

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<UserPreference user={self.user_id}>"
