"""
视频生成任务数据模型
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Text, JSON, ForeignKey, Float
from sqlalchemy.dialects.postgresql import UUID

from app.core.db import Base


class VideoTask(Base):
    """
    视频生成任务表 — 记录一次视频生成的完整生命周期

    状态流转:
      pending → generating_script → synthesizing_audio → rendering → completed
                                                                   → failed
    """
    __tablename__ = "video_tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)

    # 视频信息
    title = Column(String(200), nullable=True)           # 视频标题（由 LLM 生成）
    topic = Column(String(500), nullable=False)           # 用户输入的主题

    # 脚本与素材
    script_json = Column(JSON, nullable=True)             # 结构化脚本 JSON
    audio_urls = Column(JSON, nullable=True)              # 各段音频文件路径列表
    image_urls = Column(JSON, nullable=True)              # 各段配图路径列表

    # 渲染结果
    video_url = Column(String(500), nullable=True)        # 最终 MP4 文件路径
    duration_seconds = Column(Float, nullable=True)       # 视频总时长（秒）

    # 任务状态
    # pending | generating_script | synthesizing_audio | rendering | completed | failed
    status = Column(String(30), nullable=False, default="pending", index=True)
    error_message = Column(Text, nullable=True)           # 失败时的错误信息

    # 渲染配置
    config = Column(JSON, nullable=True)
    # 配置结构:
    # {
    #   "voice_type": "zh_female_cancan_mars",
    #   "style": "幽默",
    #   "width": 1080,
    #   "height": 1920
    # }

    # 时间戳
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self):
        return f"<VideoTask {self.id} topic='{self.topic}' status={self.status}>"
