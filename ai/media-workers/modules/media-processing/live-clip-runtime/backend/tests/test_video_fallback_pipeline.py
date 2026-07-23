import tempfile
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, MagicMock, patch

from app.models.database import TaskStatus
from app.workers import pipeline


class FakeResult:
    def __init__(self, task):
        self.task = task

    def scalar_one_or_none(self):
        return self.task


class FakeSession:
    def __init__(self, task):
        self.task = task
        self.added = []

    async def execute(self, _query):
        return FakeResult(self.task)

    async def commit(self):
        return None

    async def rollback(self):
        return None

    def add(self, value):
        self.added.append(value)


class FakeSessionContext:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, exc_type, exc, traceback):
        return False


class VideoFallbackPipelineTests(IsolatedAsyncioTestCase):
    async def test_full_video_is_probed_and_converted_before_transcription(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            video = root / "source.mp4"
            video.write_bytes(b"video")
            task_id = uuid.uuid4()
            task = SimpleNamespace(
                id=task_id,
                source_path=str(video),
                video_duration=None,
                video_start_offset=0.0,
                scene_mode="livestream",
                progress=0,
                progress_message="queued",
                status=TaskStatus.pending.value,
                transcript_json=None,
                error_message=None,
            )
            session = FakeSession(task)
            transcriber = SimpleNamespace(
                transcribe=AsyncMock(return_value=[{"start": 0.0, "end": 8.0, "text": "demo"}])
            )
            analyzer = SimpleNamespace(analyze=AsyncMock(return_value=[{
                "clip_id": 1,
                "title": "demo clip",
                "summary": "summary",
                "type": "sales",
                "start_time": 0.0,
                "end_time": 8.0,
                "duration": 8.0,
                "virality_score": 8,
                "suggested_caption": "caption",
            }]))

            def extract_audio(_video_path, audio_path):
                Path(audio_path).write_bytes(b"audio")
                return audio_path

            async def update_progress(_db, current, progress, message, status=None, **_kwargs):
                current.progress = progress
                current.progress_message = message
                if status:
                    current.status = status

            with (
                patch.object(pipeline.settings, "temp_dir", str(root / "temp")),
                patch.object(pipeline, "async_session", return_value=FakeSessionContext(session)),
                patch.object(pipeline, "get_video_duration", return_value=42.0) as probe,
                patch.object(pipeline, "extract_audio", side_effect=extract_audio) as extract,
                patch.object(pipeline, "get_transcriber", return_value=transcriber),
                patch.object(pipeline, "ClipAnalyzer", return_value=analyzer),
                patch.object(pipeline, "update_task_progress", side_effect=update_progress),
            ):
                await pipeline.run_video_pipeline(str(task_id))

            probe.assert_called_once_with(str(video))
            extract.assert_called_once()
            extracted_path = extract.call_args.args[1]
            self.assertTrue(extracted_path.endswith("server-extracted.mp3"))
            transcriber.transcribe.assert_awaited_once_with(extracted_path, audio_duration=42.0)
            analyzer.analyze.assert_awaited_once()
            self.assertEqual(task.status, TaskStatus.done.value)
            self.assertEqual(task.progress, 100)
            self.assertEqual(task.video_duration, 42.0)
            self.assertEqual(len(session.added), 1)
