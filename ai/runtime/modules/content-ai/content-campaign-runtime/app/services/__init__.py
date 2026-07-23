"""
服务模块 - 提供 LLM、图片生成和海报生成服务
"""
from app.services.llm_service import llm_service, LLMUsageInfo, TopicsResponse, StreamResult
from app.services.image_service import image_service
from app.services.poster_service import poster_service
from app.services.gallery_service import gallery_service
from app.services.platform_adapter_service import platform_adapter_service


def get_llm_service():
    """获取 LLM 服务实例"""
    return llm_service


def get_image_service():
    """获取图片服务实例"""
    return image_service


def get_poster_service():
    """获取海报生成服务实例"""
    return poster_service


def get_gallery_service():
    """获取作品库服务实例"""
    return gallery_service


def get_platform_adapter_service():
    """获取平台适配服务实例"""
    return platform_adapter_service
