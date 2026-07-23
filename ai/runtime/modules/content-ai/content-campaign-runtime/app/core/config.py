"""
应用配置模块
使用 pydantic-settings 管理环境变量
"""
from functools import lru_cache
import secrets
from typing import Literal
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """应用配置类"""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )
    
    # 应用配置
    app_name: str = "商媒智营 Content Campaign Runtime"
    debug: bool = False

    # 仅接受 Java 控制面调用；空值时受保护接口返回 503。
    runtime_control_token: str = ""
    runtime_data_dir: str = ".runtime/content-campaign"
    
    # 数据库配置 (SQLAlchemy AsyncIO)
    database_url: str = "sqlite+aiosqlite:///./.runtime/content_campaign.db"
    
    # PostgreSQL 连接配置 (psycopg3 / LangGraph Checkpointer)
    postgres_uri: str = ""
    checkpoint_backend: Literal["memory", "postgres"] = "memory"
    
    # ============== 日志配置 ==============
    # 日志级别: DEBUG, INFO, WARNING, ERROR
    log_level: str = "INFO"
    
    # 日志输出目标: file, loki, aliyun, volcengine
    # 目前支持 file，后续可扩展云服务
    log_target: Literal["file", "loki", "aliyun", "volcengine"] = "file"
    
    # 日志文件目录
    log_dir: str = "logs"
    
    # 是否输出 JSON 格式（文件始终是 JSON，此选项影响控制台）
    log_json: bool = False
    
    # 是否在控制台输出日志（开发时建议开启）
    log_console: bool = True
    
    # 是否启用 PII 脱敏（邮箱、信用卡、API Key、手机号）
    log_pii_anonymize: bool = True

    # ============== 销售系统对接配置 ==============
    # AiWxChat / 销售系统后端地址，例如 http://127.0.0.1:8010
    sales_api_base_url: str = ""
    # 如销售系统部署层需要 Bearer Token，可在这里配置；本地 AiWxChat 当前素材/学员接口不强制认证
    sales_api_token: str = ""
    sales_api_timeout: float = 30.0
    sales_uploaded_by: str = "graph_xiaohongshu"

    # ============== 视频生成配置 ==============
    tts_app_id: str = ""
    tts_access_token: str = ""
    tts_voice_type: str = "zh_female_cancan_mars"
    tts_api_url: str = "https://openspeech.bytedance.com/api/v1/tts"
    remotion_service_url: str = "http://localhost:3100"

    # ============== 管理员配置 ==============
    # 逗号分隔用户名；另外系统会把最早创建的用户视为管理员，便于老项目无角色字段时使用。
    admin_usernames: str = "admin"
    
    # ============== JWT 认证配置 ==============
    jwt_secret_key: str = Field(default_factory=lambda: secrets.token_urlsafe(48))
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440  # 24小时
    
    @property
    def async_database_url(self) -> str:
        """获取异步数据库 URL"""
        return self.database_url


@lru_cache
def get_settings() -> Settings:
    """获取配置单例"""
    return Settings()


settings = get_settings()
