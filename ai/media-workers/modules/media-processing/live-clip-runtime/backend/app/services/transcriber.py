"""Speech transcription service — Groq Whisper ASR."""

import logging
import os
import subprocess
from abc import ABC, abstractmethod

import httpx

from app.config import settings
from app.services.ffmpeg_tools import require_command

logger = logging.getLogger(__name__)

def _get_audio_duration(audio_path: str) -> float:
    """Read audio duration in seconds via ffprobe."""
    ffprobe_bin = require_command("ffprobe", "detect audio duration")
    cmd = [
        ffprobe_bin,
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        audio_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed to read audio duration: {result.stderr}")
    return float(result.stdout.strip())


def _split_audio(
    audio_path: str,
    chunk_seconds: int,
    known_duration: float | None = None,
) -> list[tuple[str, float]]:
    """
    Split long audio into multiple chunks.

    Returns:
        [(chunk_path, offset_seconds), ...]
    """
    duration = known_duration if known_duration and known_duration > 0 else _get_audio_duration(audio_path)
    if duration <= chunk_seconds:
        return [(audio_path, 0.0)]

    ffmpeg_bin = require_command(
        "ffmpeg",
        "split audio for cloud ASR",
    )

    base, ext = os.path.splitext(audio_path)
    chunks: list[tuple[str, float]] = []
    start = 0.0

    while start < duration:
        chunk_idx = len(chunks)
        chunk_path = f"{base}_chunk{chunk_idx:03d}{ext}"
        end = min(start + chunk_seconds, duration)

        cmd = [
            ffmpeg_bin,
            "-y",
            "-ss",
            str(start),
            "-to",
            str(end),
            "-i",
            audio_path,
            "-c",
            "copy",
            chunk_path,
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        chunks.append((chunk_path, start))
        logger.info("Audio chunk %s: %.0fs -> %.0fs -> %s", chunk_idx, start, end, chunk_path)
        start = end

    logger.info("Split audio into %s chunks (total %.0fs)", len(chunks), duration)
    return chunks


class BaseTranscriber(ABC):
    """Base transcriber."""

    @abstractmethod
    async def transcribe(
        self,
        audio_path: str,
        audio_duration: float | None = None,
    ) -> list[dict]:
        """Return timestamped transcript segments."""


class GroqASRTranscriber(BaseTranscriber):
    """Use Groq Whisper transcription with segment timestamps."""

    TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions"

    def __init__(self):
        self.model = settings.groq_asr_model
        logger.info("GroqASRTranscriber initialized: model=%s", self.model)

    def _get_api_key(self) -> str:
        api_key = settings.groq_api_key.strip()
        if not api_key:
            raise RuntimeError("未配置 Groq API Key。请在 .env 中设置 GROQ_API_KEY。")
        return api_key

    async def _transcribe_single(self, audio_path: str) -> list[dict]:
        api_key = self._get_api_key()

        file_size_mb = os.path.getsize(audio_path) / 1024 / 1024
        logger.info(
            "Groq ASR uploading %.1f MB audio: %s, model=%s",
            file_size_mb,
            os.path.basename(audio_path),
            self.model,
        )

        with open(audio_path, "rb") as file_obj:
            audio_data = file_obj.read()

        data = {
            "model": self.model,
            "response_format": "verbose_json",
            "timestamp_granularities[]": "segment",
        }
        headers = {"Authorization": f"Bearer {api_key}"}

        async with httpx.AsyncClient(
            timeout=httpx.Timeout(60.0, read=600.0, write=600.0)
        ) as client:
            response = await client.post(
                self.TRANSCRIPTION_URL,
                data=data,
                files={"file": (os.path.basename(audio_path), audio_data, "audio/mpeg")},
                headers=headers,
            )

        if response.status_code != 200:
            error_detail = response.text[:500]
            logger.error(
                "Groq ASR HTTP error: status_code=%s, body=%s",
                response.status_code,
                error_detail,
            )
            raise RuntimeError(f"Groq ASR request failed (HTTP {response.status_code}): {error_detail}")

        payload = response.json()
        segments = payload.get("segments") or []
        result = []
        for segment in segments:
            text = segment.get("text", "").strip()
            if not text:
                continue
            result.append(
                {
                    "start": float(segment.get("start", 0.0)),
                    "end": float(segment.get("end", 0.0)),
                    "text": text,
                }
            )

        logger.info("Groq ASR chunk transcribed: %s segments", len(result))
        return result

    async def transcribe(
        self,
        audio_path: str,
        audio_duration: float | None = None,
    ) -> list[dict]:
        chunk_minutes = max(1, settings.groq_asr_chunk_minutes)
        chunk_seconds = chunk_minutes * 60
        if audio_duration:
            logger.info("Groq ASR using known audio duration from task metadata: %.1fs", audio_duration)

        chunks = _split_audio(audio_path, chunk_seconds, known_duration=audio_duration)
        logger.info("Audio split into %s chunk(s) for Groq ASR", len(chunks))

        all_segments = []
        for index, (chunk_path, offset) in enumerate(chunks, start=1):
            logger.info("Groq transcribing chunk %s/%s (offset=%.0fs)", index, len(chunks), offset)
            segments = await self._transcribe_single(chunk_path)

            for seg in segments:
                seg["start"] += offset
                seg["end"] += offset

            all_segments.extend(segments)

            if chunk_path != audio_path and os.path.exists(chunk_path):
                os.remove(chunk_path)

        all_segments.sort(key=lambda item: item["start"])
        logger.info("Groq ASR total: %s segments from %s", len(all_segments), audio_path)
        return all_segments


def get_transcriber() -> BaseTranscriber:
    """Return the Groq ASR transcriber."""
    return GroqASRTranscriber()
