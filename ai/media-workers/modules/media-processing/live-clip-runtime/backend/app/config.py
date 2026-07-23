from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """应用配置，从环境变量或 .env 文件加载"""

    # Database
    database_url: str = "sqlite+aiosqlite:///./.runtime/ai_slice.db"

    # DeepSeek
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"

    # Groq ASR
    groq_api_key: str = ""
    groq_asr_model: str = "whisper-large-v3-turbo"
    groq_asr_chunk_minutes: int = 25

    # 本地文件存储
    storage_dir: str = "./.runtime/storage"

    # Pipeline
    temp_dir: str = "./.runtime/temp"

    # 服务端 FFmpeg 路径（可选，仅历史任务的时长补救需要）
    # 纯前端 FFmpeg 架构下，服务端不再切视频，留空即可
    ffmpeg_bin_dir: str = ""

    # Worker 后台协程池大小：同一时刻最多并行处理的任务数
    # 纯前端 FFmpeg 架构下服务端只做 ASR + LLM（纯网络 I/O），无 CPU 抢核
    # 真正瓶颈是 Groq / DeepSeek 的 RPM 限制，可放心调高
    worker_concurrency: int = 2

    # Internal service authentication. The Java control plane and this runtime
    # must receive the same high-entropy value at startup.
    runtime_control_token: str = ""
    max_audio_upload_bytes: int = 536_870_912
    max_video_upload_bytes: int = 2_147_483_648

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
