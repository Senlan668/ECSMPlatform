"""
TTS 语音合成服务
使用火山引擎 TTS HTTP 接口（一次性合成）。未配置时明确返回能力不可用。
"""
import os
import uuid
import json
import base64
import asyncio
from pathlib import Path
from typing import List, Optional

import httpx
from dotenv import load_dotenv

from app.core.errors import CapabilityUnavailableError
from app.core.runtime_context import has_runtime_identity, tenant_static_path

load_dotenv()

# 音频存储目录
AUDIO_DIR = Path(__file__).resolve().parent.parent.parent / "static" / "audio"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)


class TTSService:
    """火山引擎 TTS 服务"""

    def __init__(self):
        self.app_id = os.getenv("TTS_APP_ID", "")
        self.access_token = os.getenv("TTS_ACCESS_TOKEN", "")
        self.voice_type = os.getenv("TTS_VOICE_TYPE", "zh_female_cancan_mars")
        self.api_url = os.getenv(
            "TTS_API_URL",
            "https://openspeech.bytedance.com/api/v1/tts"
        )
        self._semaphore = asyncio.Semaphore(3)  # 并发限流

        if not self.app_id or not self.access_token:
            print("[TTS] WARNING: 未配置火山引擎 TTS 凭证，语音合成功能不可用")
        else:
            print(f"[TTS] 已配置火山引擎 TTS（音色: {self.voice_type}）")

    @property
    def is_configured(self) -> bool:
        """是否已配置真实 TTS 服务"""
        return bool(self.app_id and self.access_token)

    async def synthesize(
        self,
        text: str,
        voice_type: Optional[str] = None,
        speed_ratio: float = 1.0,
    ) -> dict:
        """
        单段文本合成

        Returns:
            {
                "audio_path": "static/audio/xxx.mp3",
                "audio_url": "/static/audio/xxx.mp3",
                "duration": 5.0  (估算)
            }
        """
        if not self.is_configured:
            raise CapabilityUnavailableError(
                "tts",
                "语音合成服务未配置，不能生成占位静音音频",
            )

        async with self._semaphore:
            return await self._call_volcano_tts(text, voice_type, speed_ratio)

    async def batch_synthesize(
        self,
        segments: List[str],
        voice_type: Optional[str] = None,
        speed_ratio: float = 1.0,
    ) -> List[dict]:
        """
        批量合成（并发限流）

        Args:
            segments: 文本列表
        Returns:
            [{ audio_path, audio_url, duration }, ...]
        """
        tasks = [
            self.synthesize(text, voice_type, speed_ratio)
            for text in segments
        ]
        return await asyncio.gather(*tasks)

    async def _call_volcano_tts(
        self,
        text: str,
        voice_type: Optional[str] = None,
        speed_ratio: float = 1.0,
    ) -> dict:
        """调用火山引擎 TTS HTTP 接口"""
        filename = f"{uuid.uuid4().hex}.mp3"
        audio_dir = tenant_static_path("audio") if has_runtime_identity() else AUDIO_DIR
        audio_dir.mkdir(parents=True, exist_ok=True)
        audio_path = audio_dir / filename

        payload = {
            "app": {
                "appid": self.app_id,
                "token": "access_token",
                "cluster": "volcano_tts",
            },
            "user": {"uid": "video-generator"},
            "audio": {
                "voice_type": voice_type or self.voice_type,
                "encoding": "mp3",
                "speed_ratio": speed_ratio,
            },
            "request": {
                "reqid": uuid.uuid4().hex,
                "text": text,
                "operation": "query",
            },
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    self.api_url,
                    json=payload,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer;{self.access_token}",
                    },
                )
                resp.raise_for_status()
                result = resp.json()

                if result.get("code") != 3000:
                    raise Exception(
                        f"TTS API error: code={result.get('code')}, "
                        f"message={result.get('message')}"
                    )

                # 解码 base64 音频数据
                audio_data = base64.b64decode(result["data"])
                audio_path.write_bytes(audio_data)

                # 估算时长: 中文约 4 字/秒
                estimated_duration = max(2.0, len(text) / 4.0 / speed_ratio)

                print(f"[TTS] 合成成功: {filename} ({len(text)} 字, ~{estimated_duration:.1f}s)")

                return {
                    "audio_path": str(audio_path),
                    "audio_url": f"/static/audio/{filename}",
                    "duration": estimated_duration,
                }

        except Exception as e:
            print(f"[TTS] 合成失败: {e}")
            raise

# 单例
tts_service = TTSService()
