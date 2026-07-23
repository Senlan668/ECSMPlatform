"""
数据模型模块
"""
from app.models.user import User
from app.models.poster import PosterGeneration, PosterTemplate, StyleTag
from app.models.batch_task import BatchTask, BatchTaskItem
from app.models.platform_variant import PlatformVariant
from app.models.calendar import CalendarPlan, CalendarEvent
from app.models.image_model import ImageModelConfig
from app.models.prompt import PromptSnippet
from app.models.video_task import VideoTask

__all__ = [
    "User",
    "PosterGeneration",
    "PosterTemplate",
    "StyleTag",
    "BatchTask",
    "BatchTaskItem",
    "PlatformVariant",
    "CalendarPlan",
    "CalendarEvent",
    "ImageModelConfig",
    "PromptSnippet",
    "VideoTask",
]
