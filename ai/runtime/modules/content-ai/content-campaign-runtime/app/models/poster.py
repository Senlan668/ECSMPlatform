"""
海报/封面生成数据模型
包含：生成记录、模板定义、风格标签
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Text, Integer, Boolean, JSON, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from app.core.db import Base


class PosterGeneration(Base):
    """
    海报生成记录表 — 记录每次生成的完整信息
    同时作为「作品库 / 素材中心」的核心数据源
    """
    __tablename__ = "poster_generations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)

    # 生成模式（覆盖全部 9 种）:
    #   custom / template / edit / style_transfer /
    #   inpaint / erase / adapt / export_all / batch
    mode = Column(String(30), nullable=False, default="custom", index=True)
    source_mode = Column(String(30), nullable=True, index=True)  # 来源模式扩展

    # ========== 作品库扩展字段 ==========
    title = Column(String(200), nullable=True)         # 作品标题（用户自定义或 AI 自动摘要）
    tags = Column(JSON, nullable=True)                 # 用户标签列表，如 ["穿搭", "系列封面"]
    thumbnail_url = Column(String(500), nullable=True) # 缩略图路径（列表页加速加载）
    file_size = Column(Integer, nullable=True)         # 文件大小（字节），便于统计用量

    # 编辑链追溯：二次编辑时记录来源作品 ID
    parent_id = Column(UUID(as_uuid=True), ForeignKey("poster_generations.id"), nullable=True, index=True)
    # 批量任务关联：批量生成的作品归属
    batch_task_id = Column(UUID(as_uuid=True), ForeignKey("batch_tasks.id"), nullable=True, index=True)

    # ========== 用户输入 ==========
    prompt = Column(Text, nullable=True)              # 用户提示词
    template_id = Column(UUID(as_uuid=True), nullable=True)  # 使用的模板 ID
    style_tags = Column(JSON, nullable=True)           # 使用的风格标签列表
    params = Column(JSON, nullable=True)               # 模板参数（标题、副标题、色调等）

    # ========== 生成配置 ==========
    aspect_ratio = Column(String(20), default="3:4")   # 输出比例
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)

    # ========== 生成结果 ==========
    image_url = Column(String(500), nullable=True)     # 生成图片的访问路径
    ai_prompt_used = Column(Text, nullable=True)       # 实际发送给 AI 的提示词
    success = Column(Boolean, default=False)

    # ========== 元数据 ==========
    is_favorite = Column(Boolean, default=False, index=True)  # 是否收藏（加索引加速筛选）
    is_template = Column(Boolean, default=False, index=True)  # 是否已存为个人模板

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<PosterGeneration {self.id} mode={self.mode} title={self.title}>"





class PosterTemplate(Base):
    """海报模板表 — 系统预置 + 用户自建模板"""
    __tablename__ = "poster_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)  # NULL = 系统模板

    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    thumbnail_url = Column(String(500), nullable=True)  # 模板缩略图

    # 风格与分类
    category = Column(String(50), nullable=True)        # 分类: 美食、穿搭、知识…
    style_tag = Column(String(50), nullable=True)       # 主风格标签

    # 模板配置 (JSON Schema)
    # 包含: ai_prompt_template, layout, text_slots, color_scheme 等
    config = Column(JSON, nullable=False, default=dict)

    # 来源追溯：从作品库「存为模板」时关联来源生成记录
    source_generation_id = Column(
        UUID(as_uuid=True),
        ForeignKey("poster_generations.id"),
        nullable=True,
        comment="从作品库存为模板时的来源作品 ID"
    )
    use_count = Column(Integer, default=0, comment="模板使用次数统计")

    # 模板状态
    is_system = Column(Boolean, default=False)          # 是否为系统预置模板
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<PosterTemplate {self.name}>"


class StyleTag(Base):
    """风格标签表 — 系统预设 + 用户自定义风格"""
    __tablename__ = "style_tags"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
        index=True,
        comment="NULL = 系统风格；非 NULL = 用户自定义风格"
    )
    name = Column(String(50), nullable=False)                    # 风格名称（如：赛博朋克）
    name_en = Column(String(50), nullable=True)                  # 英文名（如：cyberpunk）
    description = Column(Text, nullable=True)                    # 风格描述
    prompt_snippet = Column(Text, nullable=False)                # 对应的提示词片段
    color_palette = Column(JSON, nullable=True)                  # 推荐配色方案
    icon = Column(String(10), nullable=True)                     # emoji 图标
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    def __repr__(self):
        return f"<StyleTag {self.name} user={self.user_id}>"
