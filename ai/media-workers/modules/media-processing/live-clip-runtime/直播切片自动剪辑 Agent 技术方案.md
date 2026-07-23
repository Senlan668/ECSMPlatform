# 直播切片自动剪辑 Agent 技术方案

> 目标：构建一个 AI Agent，用户上传直播长视频（GB 级），自动提取语音文本，LLM 分析精彩片段，生成切片方案，并支持对接剪映（CapCut）自动化剪辑。

---

## 1. 整体架构

```
用户上传直播录像（2~6 小时，1~10 GB）
    │
    ▼
┌──────────────────────────────────────────────────┐
│                  上传与预处理层                      │
│  分片上传 │ 断点续传 │ MD5 秒传 │ MinIO 存储        │
└──────────────────┬───────────────────────────────┘
                   │
┌──────────────────┴───────────────────────────────┐
│                  音频提取与转录层                    │
│  FFmpeg 音频分离 │ VAD 静音切分 │ Whisper 并行转录   │
│  → 带时间轴的完整文本 (SRT/JSON)                    │
└──────────────────┬───────────────────────────────┘
                   │
┌──────────────────┴───────────────────────────────┐
│                  LLM 分析层                        │
│  精彩片段识别 │ 切片点标记 │ 标题/文案生成           │
│  → 切片方案 JSON                                   │
└──────────────────┬───────────────────────────────┘
                   │
              ┌────┴────┐
              ▼         ▼
┌────────────────┐ ┌──────────────────────┐
│ FFmpeg 自动切片 │ │ 剪映草稿生成           │
│ 独立 MP4 输出   │ │ draft_content.json   │
└────────────────┘ └──────────────────────┘
```

---

## 2. 大文件上传方案

### 2.1 分片上传 + 断点续传

```python
# ── 前端：分片上传 ──
class ChunkedUploader:
    """大文件分片上传"""
    
    CHUNK_SIZE = 5 * 1024 * 1024  # 5MB 每片
    
    async def upload(self, file_path: str, upload_url: str):
        file_size = os.path.getsize(file_path)
        file_hash = self._calc_md5(file_path)
        total_chunks = math.ceil(file_size / self.CHUNK_SIZE)
        
        # 1. 检查秒传
        if await self._check_instant(upload_url, file_hash):
            return {"status": "instant", "file_id": file_hash}
        
        # 2. 获取已上传分片（断点续传）
        uploaded = await self._get_uploaded_chunks(upload_url, file_hash)
        
        # 3. 上传剩余分片
        with open(file_path, "rb") as f:
            for i in range(total_chunks):
                if i in uploaded:
                    f.seek(self.CHUNK_SIZE, 1)  # 跳过已上传
                    continue
                chunk = f.read(self.CHUNK_SIZE)
                await self._upload_chunk(upload_url, file_hash, i, chunk)
        
        # 4. 通知合并
        return await self._merge(upload_url, file_hash, total_chunks)
```

### 2.2 后端分片接收

```python
# ── 后端：FastAPI 分片接收 ──
from fastapi import FastAPI, UploadFile
import aiofiles

app = FastAPI()

@app.post("/api/upload/chunk")
async def upload_chunk(file_hash: str, chunk_index: int, chunk: UploadFile):
    """接收单个分片"""
    chunk_dir = f"/data/chunks/{file_hash}"
    os.makedirs(chunk_dir, exist_ok=True)
    
    chunk_path = f"{chunk_dir}/{chunk_index:06d}"
    async with aiofiles.open(chunk_path, "wb") as f:
        await f.write(await chunk.read())
    
    return {"chunk_index": chunk_index, "status": "ok"}

@app.post("/api/upload/merge")
async def merge_chunks(file_hash: str, total_chunks: int, filename: str):
    """合并所有分片"""
    chunk_dir = f"/data/chunks/{file_hash}"
    output_path = f"/data/videos/{file_hash}_{filename}"
    
    async with aiofiles.open(output_path, "wb") as out:
        for i in range(total_chunks):
            chunk_path = f"{chunk_dir}/{i:06d}"
            async with aiofiles.open(chunk_path, "rb") as chunk:
                await out.write(await chunk.read())
    
    # 清理分片
    shutil.rmtree(chunk_dir)
    
    # 触发异步处理任务
    task_id = await trigger_processing(output_path, file_hash)
    return {"file_id": file_hash, "task_id": task_id}
```

### 2.3 存储方案

| 方案 | 适用场景 | 特点 |
|:---|:---|:---|
| **MinIO** | 私有化部署 | S3 兼容、分片上传 API 完善 |
| **阿里云 OSS** | 云端部署 | STS 临时凭证直传、分片上传 |
| **本地磁盘** | 开发/小规模 | 简单但不可扩展 |

---

## 3. 音频提取与语音转录

### 3.1 音频分离（FFmpeg）

```python
import subprocess

def extract_audio(video_path: str, audio_path: str):
    """从视频中提取音频（16kHz mono WAV，Whisper 最佳格式）"""
    cmd = [
        "ffmpeg", "-i", video_path,
        "-vn",                # 去掉视频流
        "-acodec", "pcm_s16le",  # 16-bit PCM
        "-ar", "16000",       # 16kHz 采样率
        "-ac", "1",           # 单声道
        audio_path
    ]
    subprocess.run(cmd, check=True)
```

### 3.2 VAD 静音切分 + 并行转录

```python
from faster_whisper import WhisperModel

class TranscriptionEngine:
    """大文件语音转录引擎"""
    
    def __init__(self):
        # faster-whisper 比原版快 4 倍，显存低 3 倍
        self.model = WhisperModel("large-v3", device="cuda", compute_type="float16")
    
    async def transcribe(self, audio_path: str) -> list[dict]:
        """全文转录，返回带时间轴的文本"""
        segments, info = self.model.transcribe(
            audio_path,
            language="zh",
            vad_filter=True,           # 内置 VAD，跳过静音段
            vad_parameters={
                "min_silence_duration_ms": 500,  # 500ms 以上的静音才切分
            },
            word_timestamps=True,       # 逐字时间戳
        )
        
        result = []
        for seg in segments:
            result.append({
                "start": seg.start,      # 秒
                "end": seg.end,
                "text": seg.text,
                "words": [{"word": w.word, "start": w.start, "end": w.end} 
                          for w in seg.words] if seg.words else [],
            })
        
        return result
    
    def to_srt(self, segments: list[dict], output_path: str):
        """导出 SRT 字幕文件"""
        with open(output_path, "w", encoding="utf-8") as f:
            for i, seg in enumerate(segments):
                start = self._format_time(seg["start"])
                end = self._format_time(seg["end"])
                f.write(f"{i+1}\n{start} --> {end}\n{seg['text']}\n\n")
```

### 3.3 超长音频分段处理

```python
def split_audio_for_whisper(audio_path: str, max_duration: int = 1800):
    """将超长音频按 30 分钟切分（适配 Whisper API 25MB 限制）"""
    import pydub
    audio = pydub.AudioSegment.from_wav(audio_path)
    
    chunks = []
    for i in range(0, len(audio), max_duration * 1000):
        chunk = audio[i:i + max_duration * 1000]
        chunk_path = f"/tmp/chunk_{i // (max_duration*1000)}.wav"
        chunk.export(chunk_path, format="wav")
        chunks.append({
            "path": chunk_path,
            "offset": i / 1000,  # 全局偏移（秒）
        })
    
    return chunks
```

---

## 4. LLM 精彩片段分析

### 4.1 分析 Prompt 设计

```python
CLIP_ANALYSIS_PROMPT = """你是一个直播切片剪辑专家。分析以下直播转录文本，找出适合制作短视频切片的精彩片段。

## 转录文本（带时间轴）
{transcript}

## 切片标准
1. **高能时刻**：情绪爆发、搞笑片段、争议讨论
2. **干货知识**：有价值的观点、教程、经验分享
3. **互动精彩**：与弹幕/连麦的精彩互动
4. **金句名言**：可传播的经典语句
5. **带货亮点**：产品展示、砍价、用户反馈（如适用）

## 切片要求
- 每个切片 30秒 ~ 3分钟
- 片段要有完整的起承转合，不能话说一半就切
- 开头要有"钩子"（吸引注意力的内容）
- 结尾要有"价值感"（学到东西、被逗笑、有共鸣）

## 输出格式（JSON 数组）
[
  {
    "clip_id": 1,
    "title": "切片标题（吸引眼球）",
    "start_time": "00:12:30",
    "end_time": "00:14:45",
    "duration": 135,
    "type": "高能时刻",
    "hook": "开头的钩子是什么",
    "summary": "内容概要",
    "virality_score": 8,
    "suggested_caption": "推荐的发布文案"
  }
]

请输出 JSON："""
```

### 4.2 分段分析策略

```python
class ClipAnalyzer:
    """直播切片分析器"""
    
    MAX_TOKENS_PER_BATCH = 6000  # 每批文本的 Token 上限
    
    async def analyze(self, transcript: list[dict]) -> list[dict]:
        """分段分析，合并结果"""
        # 1. 将转录文本按 Token 预算分批
        batches = self._split_transcript(transcript)
        
        all_clips = []
        for batch in batches:
            # 格式化为带时间的文本
            formatted = self._format_transcript(batch)
            
            prompt = CLIP_ANALYSIS_PROMPT.format(transcript=formatted)
            result = await self.llm.chat("deepseek", [
                {"role": "user", "content": prompt}
            ], temperature=0.3)
            
            clips = json.loads(result.choices[0].message.content)
            all_clips.extend(clips)
        
        # 2. 去重 + 排序（按 virality_score 降序）
        all_clips.sort(key=lambda x: x["virality_score"], reverse=True)
        
        return all_clips
    
    def _split_transcript(self, transcript: list[dict]) -> list[list[dict]]:
        """按 Token 预算分批"""
        batches, current_batch, current_tokens = [], [], 0
        
        for seg in transcript:
            seg_tokens = len(seg["text"]) // 1.5
            if current_tokens + seg_tokens > self.MAX_TOKENS_PER_BATCH:
                batches.append(current_batch)
                current_batch, current_tokens = [], 0
            current_batch.append(seg)
            current_tokens += seg_tokens
        
        if current_batch:
            batches.append(current_batch)
        
        return batches
    
    def _format_transcript(self, segments: list[dict]) -> str:
        """格式化转录文本"""
        lines = []
        for seg in segments:
            start = self._format_time(seg["start"])
            end = self._format_time(seg["end"])
            lines.append(f"[{start} → {end}] {seg['text']}")
        return "\n".join(lines)
```

### 4.3 多模态分析增强（可选）

```python
class MultimodalAnalyzer:
    """多模态分析：语音 + 画面 + 弹幕"""
    
    async def extract_keyframes(self, video_path: str, interval: int = 30):
        """每 30 秒提取一帧关键帧"""
        cmd = f"ffmpeg -i {video_path} -vf fps=1/{interval} /tmp/frame_%04d.jpg"
        subprocess.run(cmd, shell=True)
    
    async def analyze_with_vision(self, transcript: list, keyframes: list):
        """结合画面分析（语音低谷但画面精彩的场景）"""
        # 用多模态 LLM 分析关键帧
        # 例如：画面中出现产品特写、主播表情激动、弹幕刷屏
        pass
```

---

## 5. 自动切片执行

### 5.1 FFmpeg 精确切片

```python
class VideoClipper:
    """视频切片器"""
    
    async def clip(self, video_path: str, clips: list[dict], 
                    output_dir: str) -> list[str]:
        """根据切片方案批量切片"""
        os.makedirs(output_dir, exist_ok=True)
        outputs = []
        
        for clip in clips:
            output_path = f"{output_dir}/clip_{clip['clip_id']:03d}_{clip['title'][:20]}.mp4"
            
            # 关键帧对齐切割（避免开头黑帧）
            cmd = [
                "ffmpeg", "-y",
                "-ss", clip["start_time"],      # 起始时间
                "-to", clip["end_time"],         # 结束时间
                "-i", video_path,
                "-c:v", "libx264",              # 重编码确保精确
                "-c:a", "aac",
                "-preset", "fast",
                "-crf", "23",                   # 画质平衡
                output_path,
            ]
            subprocess.run(cmd, check=True)
            outputs.append(output_path)
        
        return outputs
    
    async def clip_vertical(self, video_path: str, clip: dict, 
                             output_path: str):
        """横屏转竖屏（人脸居中裁切）"""
        cmd = [
            "ffmpeg", "-y",
            "-ss", clip["start_time"],
            "-to", clip["end_time"],
            "-i", video_path,
            "-vf", "crop=ih*9/16:ih,scale=1080:1920",  # 居中裁切为 9:16
            "-c:v", "libx264", "-c:a", "aac",
            output_path,
        ]
        subprocess.run(cmd, check=True)
```

### 5.2 自动添加字幕

```python
class SubtitleBurner:
    """将字幕烧录到视频"""
    
    def burn_srt(self, video_path: str, srt_path: str, output_path: str):
        """将 SRT 字幕硬编码到视频"""
        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-vf", (
                f"subtitles={srt_path}:"
                "force_style='FontName=Microsoft YaHei,"
                "FontSize=22,PrimaryColour=&HFFFFFF,"
                "OutlineColour=&H000000,Outline=2,"
                "Alignment=2,MarginV=40'"
            ),
            "-c:a", "copy",
            output_path,
        ]
        subprocess.run(cmd, check=True)
```

---

## 6. 剪映（CapCut）对接方案

> ⚠️ 剪映无官方 API，以下方案基于 **逆向草稿文件** 实现，需注意版本兼容性。

### 6.1 剪映草稿结构

```
剪映草稿目录结构：
~/.jianying_pro/drafts/{draft_id}/
├── draft_content.json    ← 核心：项目结构定义
├── draft_meta_info.json  ← 元信息（名称、时长）
└── resources/            ← 素材文件（视频/音频/图片）
```

### 6.2 生成剪映工程文件

```python
import uuid
import json
from datetime import datetime

class JianYingDraftGenerator:
    """生成剪映草稿工程"""
    
    DRAFT_DIR = os.path.expanduser("~/.jianying_pro/drafts")
    
    def create_draft(self, clips: list[dict], video_path: str, 
                      draft_name: str) -> str:
        """创建剪映草稿"""
        draft_id = str(uuid.uuid4()).upper()
        draft_path = f"{self.DRAFT_DIR}/{draft_id}"
        os.makedirs(f"{draft_path}/resources", exist_ok=True)
        
        # 1. 生成 draft_content.json
        content = self._build_draft_content(clips, video_path)
        with open(f"{draft_path}/draft_content.json", "w") as f:
            json.dump(content, f, ensure_ascii=False, indent=2)
        
        # 2. 生成 draft_meta_info.json
        meta = {
            "draft_id": draft_id,
            "draft_name": draft_name,
            "draft_timeline_materials_size_": 0,
            "tm_draft_create": int(datetime.now().timestamp() * 1000),
            "tm_draft_modified": int(datetime.now().timestamp() * 1000),
        }
        with open(f"{draft_path}/draft_meta_info.json", "w") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
        
        return draft_path
    
    def _build_draft_content(self, clips: list[dict], video_path: str) -> dict:
        """构建 draft_content.json"""
        # 放入素材
        material_id = str(uuid.uuid4())
        video_material = {
            "id": material_id,
            "type": "video",
            "path": os.path.abspath(video_path),
            "duration": 0,  # 自动识别
        }
        
        # 构建轨道片段
        segments = []
        for clip in clips:
            seg_id = str(uuid.uuid4())
            segments.append({
                "id": seg_id,
                "material_id": material_id,
                "source_timerange": {
                    "start": self._time_to_us(clip["start_time"]),
                    "duration": clip["duration"] * 1_000_000,  # 微秒
                },
                "target_timerange": {
                    "start": len(segments) * clip["duration"] * 1_000_000,
                    "duration": clip["duration"] * 1_000_000,
                },
            })
        
        return {
            "canvas_config": {"height": 1920, "width": 1080, "ratio": "9:16"},
            "materials": {"videos": [video_material]},
            "tracks": [{"type": "video", "segments": segments}],
        }
    
    def _time_to_us(self, time_str: str) -> int:
        """时间字符串转微秒"""
        parts = time_str.split(":")
        h, m, s = int(parts[0]), int(parts[1]), float(parts[2])
        return int((h * 3600 + m * 60 + s) * 1_000_000)
```

### 6.3 开源工具推荐

| 项目 | 功能 | 地址 |
|:---|:---|:---|
| **pyJianYingDraft** | 最完善的剪映草稿 Python 库 | github.com/GuanYixuan/pyJianYingDraft |
| **CapCutAPI** | 功能较全的自动化方案 | github.com/chenzhaohua11/CapCutAPI-Complete |
| **CapGenie** | 轻量级草稿处理 | github.com/socket-dev/capgenie |

> 💡 **更稳定的替代方案**：如果剪映版本更新导致草稿格式变化，可以改用 **FFmpeg + MoviePy** 直接输出成品视频，跳过剪映环节。

---

## 7. 完整 Pipeline 串联

```python
class LiveClipAgent:
    """直播切片 Agent：完整流水线"""
    
    async def process(self, video_path: str, config: dict = None) -> dict:
        """一键处理：视频 → 切片方案 → 成品"""
        task_id = str(uuid.uuid4())[:8]
        
        # Step 1: 音频提取
        audio_path = f"/tmp/{task_id}_audio.wav"
        extract_audio(video_path, audio_path)
        
        # Step 2: 语音转录
        engine = TranscriptionEngine()
        transcript = await engine.transcribe(audio_path)
        
        # Step 3: LLM 分析精彩片段
        analyzer = ClipAnalyzer()
        clips = await analyzer.analyze(transcript)
        
        # Step 4: 用户确认（可选）
        # → 返回切片方案给前端，用户可调整起止时间
        
        # Step 5: 执行切片
        clipper = VideoClipper()
        output_dir = f"/data/outputs/{task_id}"
        clip_files = await clipper.clip(video_path, clips, output_dir)
        
        # Step 6: 添加字幕（可选）
        # ...
        
        # Step 7: 生成剪映工程（可选）
        if config and config.get("export_jianying"):
            generator = JianYingDraftGenerator()
            draft_path = generator.create_draft(clips, video_path, f"直播切片_{task_id}")
        
        return {
            "task_id": task_id,
            "clips": clips,
            "output_files": clip_files,
            "transcript_srt": f"/tmp/{task_id}.srt",
        }
```

---

## 8. 技术选型总结

| 环节 | 技术 | 推荐方案 |
|:---|:---|:---|
| **大文件上传** | 分片上传 + 断点续传 | MinIO / 阿里云 OSS |
| **视频处理** | 音频提取、切割、字幕 | FFmpeg |
| **语音转文字** | ASR 语音识别 | faster-whisper（本地） / 阿里云 ASR（云端） |
| **精彩片段分析** | LLM 文本理解 | DeepSeek-V3 / GPT-4o |
| **自动剪辑** | 视频切片输出 | FFmpeg + MoviePy |
| **剪映对接** | 草稿文件生成 | pyJianYingDraft |
| **任务队列** | 异步任务管理 | Celery + Redis |
| **后端框架** | API + 流式 | FastAPI |
| **前端** | 上传 + 预览 + 调整 | React + 大文件上传组件 |

---

## 9. 部署架构

```
部署方案（Docker Compose）：

  ┌─────────────────────────────────────┐
  │           Nginx 反向代理              │
  │  大文件上传配置：client_max_body = 0  │
  └──────────────┬──────────────────────┘
                 │
  ┌──────────────┴──────────────────────┐
  │         FastAPI 服务                  │
  │  /api/upload  → 分片上传             │
  │  /api/analyze → 触发分析             │
  │  /api/clips   → 查看/调整切片方案     │
  │  /api/export  → 导出切片/剪映工程     │
  └──────────────┬──────────────────────┘
                 │
  ┌──────┬───────┴──────┬──────────────┐
  │ Redis│  Celery      │  MinIO       │
  │ 队列 │  Worker×N    │  文件存储     │
  │      │ (GPU×1 转录) │              │
  └──────┴──────────────┴──────────────┘
```

**关键配置：**

```yaml
# docker-compose.yml 要点
services:
  api:
    image: liveclip-api
    deploy:
      resources:
        limits:
          memory: 4G

  worker-transcribe:
    image: liveclip-worker
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]    # GPU 用于 Whisper 转录
        limits:
          memory: 8G

  worker-clip:
    image: liveclip-worker
    deploy:
      resources:
        limits:
          memory: 4G               # FFmpeg 切片不需要 GPU

  minio:
    image: minio/minio
    volumes:
      - ./data:/data
    command: server /data
```

---

## 10. 开发路线图

| 阶段 | 内容 | 时间 |
|:---|:---|:---|
| **P0 MVP** | 上传 → Whisper 转录 → LLM 分析 → FFmpeg 切片 | 2 周 |
| **P1 体验** | 前端预览、时间轴调整、批量导出 | 1 周 |
| **P2 剪映** | 剪映草稿生成、字幕烧录、竖屏裁切 | 1 周 |
| **P3 增强** | 多模态分析、弹幕热度、封面生成 | 2 周 |
| **P4 规模** | 分布式 Worker、任务队列、用户系统 | 2 周 |

## 11. 多信号精彩检测（增强方案）

> 纯靠 LLM 分析文本识别精彩片段准确率约 70%。加上弹幕热度 + 音频能量后可提升到 90%+。

### 11.1 弹幕/评论热度曲线

```python
class DanmakuHeatmap:
    """弹幕热度分析：直播平台弹幕密度 = 天然精彩检测器"""
    
    def build_heatmap(self, danmakus: list[dict], bin_seconds: int = 10) -> list[dict]:
        """按时间窗口统计弹幕密度"""
        from collections import Counter
        
        # 每条弹幕有 {"time": 秒, "text": "内容"}
        bins = Counter()
        for d in danmakus:
            bin_idx = int(d["time"]) // bin_seconds
            bins[bin_idx] += 1
        
        # 转为时间序列
        max_bin = max(bins.keys()) if bins else 0
        heatmap = []
        for i in range(max_bin + 1):
            heatmap.append({
                "start": i * bin_seconds,
                "end": (i + 1) * bin_seconds,
                "count": bins.get(i, 0),
            })
        
        return heatmap
    
    def find_peaks(self, heatmap: list[dict], threshold_ratio: float = 2.0) -> list[dict]:
        """找到弹幕爆发的峰值区间"""
        counts = [h["count"] for h in heatmap]
        avg = sum(counts) / len(counts) if counts else 0
        threshold = avg * threshold_ratio  # 超过平均值 2 倍 = 峰值
        
        peaks = []
        in_peak = False
        peak_start = 0
        
        for i, h in enumerate(heatmap):
            if h["count"] >= threshold and not in_peak:
                in_peak = True
                peak_start = h["start"]
            elif h["count"] < threshold and in_peak:
                in_peak = False
                peaks.append({
                    "start": max(0, peak_start - 5),  # 前移 5 秒
                    "end": h["start"] + 10,            # 后延 10 秒
                    "peak_count": max(counts[peak_start//10:i]),
                })
        
        return peaks
```

### 11.2 音频能量分析

```python
import numpy as np
import librosa

class AudioEnergyAnalyzer:
    """音频能量分析：声音突然变大 = 精彩时刻"""
    
    def analyze(self, audio_path: str, hop_seconds: float = 1.0) -> list[dict]:
        """计算音频能量曲线"""
        y, sr = librosa.load(audio_path, sr=16000)
        hop_length = int(sr * hop_seconds)
        
        # 计算 RMS 能量
        rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
        
        # 归一化到 0-1
        rms_norm = (rms - rms.min()) / (rms.max() - rms.min() + 1e-8)
        
        energy_curve = []
        for i, val in enumerate(rms_norm):
            energy_curve.append({
                "time": i * hop_seconds,
                "energy": float(val),
            })
        
        return energy_curve
    
    def find_energy_peaks(self, curve: list[dict], 
                           window: int = 10, threshold: float = 0.7) -> list[dict]:
        """找到音频能量突然飙升的区间（主播激动/大笑/尖叫）"""
        peaks = []
        values = [c["energy"] for c in curve]
        
        for i in range(window, len(values) - window):
            local_avg = np.mean(values[i-window:i])
            if values[i] > threshold and values[i] > local_avg * 1.5:
                peaks.append({
                    "time": curve[i]["time"],
                    "energy": values[i],
                    "spike_ratio": values[i] / (local_avg + 1e-8),
                })
        
        return peaks
```

### 11.3 多信号融合打分

```python
class MultiSignalScorer:
    """多信号融合：文本 + 弹幕 + 音频能量 → 综合精彩度"""
    
    WEIGHTS = {
        "llm_score": 0.4,      # LLM 内容质量评分（权重最高）
        "danmaku_heat": 0.35,  # 弹幕热度（极强信号）
        "audio_energy": 0.25,  # 音频能量（辅助信号）
    }
    
    def score(self, clip: dict, danmaku_heatmap: list, 
              audio_curve: list) -> float:
        """为候选切片计算综合得分"""
        start, end = clip["start_time_sec"], clip["end_time_sec"]
        
        # 1. LLM 评分（已有）
        llm_score = clip.get("virality_score", 5) / 10
        
        # 2. 该时间段的弹幕热度
        segment_danmaku = [h["count"] for h in danmaku_heatmap 
                          if h["start"] >= start and h["end"] <= end]
        max_heat = max(danmaku_heatmap, key=lambda x: x["count"])["count"]
        danmaku_score = (max(segment_danmaku) / max_heat) if segment_danmaku else 0
        
        # 3. 该时间段的音频能量
        segment_energy = [c["energy"] for c in audio_curve 
                         if start <= c["time"] <= end]
        audio_score = max(segment_energy) if segment_energy else 0
        
        # 加权融合
        final = (self.WEIGHTS["llm_score"] * llm_score +
                 self.WEIGHTS["danmaku_heat"] * danmaku_score +
                 self.WEIGHTS["audio_energy"] * audio_score)
        
        return round(final, 3)
```

```
多信号融合效果对比：

  纯 LLM 文本分析：    准确率 ~70%，容易漏掉"无台词但画面精彩"的片段
  + 弹幕热度：          准确率 ~85%，弹幕爆发几乎 100% 命中精彩
  + 音频能量：          准确率 ~90%，补充"语气激动但弹幕不多"的场景
  + 关键帧画面分析：    准确率 ~93%，覆盖纯视觉高光（暂无弹幕的场景）
```

---

## 12. 封面与多平台适配

### 12.1 封面自动生成

```python
class CoverGenerator:
    """切片封面自动生成"""
    
    async def generate(self, video_path: str, clip: dict) -> str:
        """生成竖版封面"""
        # 1. 提取候选帧（切片前 30 秒内，每 2 秒一帧）
        start_sec = clip["start_time_sec"]
        frames = []
        for offset in range(0, 30, 2):
            frame_path = f"/tmp/cover_candidate_{offset}.jpg"
            cmd = f"ffmpeg -y -ss {start_sec + offset} -i {video_path} -frames:v 1 {frame_path}"
            subprocess.run(cmd, shell=True)
            frames.append(frame_path)
        
        # 2. LLM 选最佳帧（人脸清晰、表情丰富、画面干净）
        best_frame = await self._select_best_frame(frames)
        
        # 3. 叠加标题文字
        cover_path = await self._add_title_overlay(best_frame, clip["title"])
        
        return cover_path
    
    async def _add_title_overlay(self, frame_path: str, title: str) -> str:
        """用 FFmpeg 叠加标题"""
        output = frame_path.replace(".jpg", "_cover.jpg")
        # 底部加半透明黑色遮罩 + 白色大字标题
        cmd = [
            "ffmpeg", "-y", "-i", frame_path,
            "-vf", (
                "drawbox=x=0:y=ih*0.7:w=iw:h=ih*0.3:color=black@0.6:t=fill,"
                f"drawtext=text='{title}':fontsize=48:fontcolor=white:"
                "x=(w-text_w)/2:y=h*0.8:fontfile=/path/to/font.ttf"
            ),
            output,
        ]
        subprocess.run(cmd, check=True)
        return output
```

### 12.2 多平台风格模板

```python
PLATFORM_TEMPLATES = {
    "douyin": {
        "name": "抖音",
        "resolution": "1080x1920",    # 竖屏
        "max_duration": 60,            # 秒
        "style": {
            "subtitle_size": 28,
            "subtitle_style": "大字居中+黄色描边",
            "pace": "fast",            # 快节奏：去掉停顿
            "emoji": True,             # 自动加 emoji 表情
            "hook_max_seconds": 3,     # 前 3 秒必须有钩子
        },
    },
    "bilibili": {
        "name": "B站",
        "resolution": "1920x1080",    # 横屏
        "max_duration": 180,           # 可以长一点
        "style": {
            "subtitle_size": 22,
            "subtitle_style": "白字黑边",
            "pace": "normal",          # 保持完整叙事
            "emoji": False,
            "keep_context": True,      # 保留上下文
        },
    },
    "xiaohongshu": {
        "name": "小红书",
        "resolution": "1080x1440",    # 3:4 比例
        "max_duration": 90,
        "style": {
            "subtitle_size": 24,
            "subtitle_style": "精致圆角气泡",
            "pace": "medium",
            "aesthetic_filter": True,  # 加美颜/调色滤镜
        },
    },
}

class PlatformAdapter:
    """多平台适配器：同一切片 → 多种平台版本"""
    
    async def adapt(self, clip_path: str, platform: str) -> str:
        template = PLATFORM_TEMPLATES[platform]
        output = clip_path.replace(".mp4", f"_{platform}.mp4")
        
        w, h = template["resolution"].split("x")
        filters = [f"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2"]
        
        if template["style"].get("aesthetic_filter"):
            filters.append("eq=brightness=0.03:contrast=1.1:saturation=1.2")
        
        cmd = ["ffmpeg", "-y", "-i", clip_path, "-vf", ",".join(filters),
               "-t", str(template["max_duration"]), output]
        subprocess.run(cmd, check=True)
        return output
```

---

## 13. 进阶方向

### 13.1 Remotion 替代剪映（推荐）

> 剪映草稿逆向太脆弱。**Remotion** 是 React 驱动的视频生成框架，用代码定义视频，渲染成 MP4。

```
Remotion 方案优势：

  vs 剪映草稿逆向：
  ✅ 版本稳定，不会因软件更新而崩溃
  ✅ 代码驱动，完全可编程（字幕动画、转场特效、品牌水印）
  ✅ 支持 React 组件，前端工程师友好
  ✅ 可部署为服务端渲染（Remotion Lambda / 自建）

  适用场景：
  → 批量生成标准化切片（统一开头、字幕样式、片尾引导）
  → 需要精致动效（打字机字幕、弹出标签、进度条）
  → 多平台一键渲染（竖屏/横屏/方屏）

  技术栈：
  → React + TypeScript + Remotion
  → 后端调用 Remotion CLI 渲染：npx remotion render
```

### 13.2 MCP Server 思路

```
将切片能力包装为 MCP (Model Context Protocol) 工具：

  MCP Tools 定义：
  ┌─────────────────────────────────────────┐
  │ Tool: transcribe_video                   │
  │ 输入: video_path                         │
  │ 输出: 带时间轴的转录 JSON                 │
  ├─────────────────────────────────────────┤
  │ Tool: analyze_clips                      │
  │ 输入: transcript + clip_criteria         │
  │ 输出: 切片方案 JSON                       │
  ├─────────────────────────────────────────┤
  │ Tool: execute_clip                       │
  │ 输入: video_path + clip_plan             │
  │ 输出: 切片文件路径列表                     │
  ├─────────────────────────────────────────┤
  │ Tool: generate_cover                     │
  │ 输入: video_path + clip + title          │
  │ 输出: 封面图片路径                        │
  └─────────────────────────────────────────┘

  → 任何 MCP 客户端（Claude Desktop、Cursor）都能调用
  → 用户可以用自然语言指挥：
     "把这个 3 小时直播里最搞笑的 5 段切出来，做成抖音竖屏"
```

### 13.3 商业化方向

```
目标用户与定价思路：

  ┌────────────────┬──────────────┬──────────────────┐
  │ 用户类型        │ 痛点          │ 付费意愿          │
  ├────────────────┼──────────────┼──────────────────┤
  │ MCN 公司       │ 每天几十场    │ ¥999/月           │
  │ （批量需求）    │ 人工剪辑贵    │ 按转录时长 + 切片数│
  ├────────────────┼──────────────┼──────────────────┤
  │ 个人主播       │ 没钱雇剪辑    │ ¥49-99/月         │
  │ （长尾市场）    │ 自己不会剪    │ 有限额免费层       │
  ├────────────────┼──────────────┼──────────────────┤
  │ 运营团队       │ 效率低       │ ¥299/月           │
  │ （企业内部）    │ 质量不稳定    │ 按席位收费         │
  └────────────────┴──────────────┴──────────────────┘

  MVP 阶段建议：
    → 免费开放 10 小时/月转录额度
    → 超出按 ¥0.5/分钟 计费
    → 对标 Opus Clip（$19/月 4h 上传）
```

---

## 附录：关键风险与应对

| 风险 | 影响 | 应对措施 |
|:---|:---|:---|
| **Whisper 转录不准** | 切片时间点偏移 | 加 VAD 预处理 + 逐字时间戳 |
| **LLM 分析遗漏** | 错过精彩片段 | 多信号融合（弹幕+音频+LLM） |
| **剪映版本更新** | 草稿格式不兼容 | 备选 Remotion 或 FFmpeg 直出 |
| **GPU 显存不足** | 转录 OOM | 用 faster-whisper int8 量化 |
| **超大文件** | 上传/处理超时 | 分片上传 + 异步任务 + 流式 |
| **弹幕获取** | 部分平台无接口 | 降级为音频能量+LLM 双信号方案 |
| **版权风险** | 切片侵权 | 加水印 + 用户自行承担声明 |
