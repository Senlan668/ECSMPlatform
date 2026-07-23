# 阶段 C：创建任务 —— 三问三答

> 对应代码：
> - 前端：`frontend/src/services/api.ts::createTask()`、调用点 `frontend/src/pages/UploadPage.tsx::handleUploadSuccess`
> - 后端：`backend/app/api/tasks.py::create_task()`
> - 数据模型：`backend/app/models/database.py::Task`
> - 请求/响应 schema：`backend/app/models/schemas.py::TaskCreate / TaskResponse`

> 接口签名：`POST /api/tasks`（`application/json`）
> 后端动作：`INSERT INTO tasks` → 返回完整 `TaskResponse(clips=[])` → 前端 `navigate(/tasks/${id})`

---

## 问题 1：前端发出去的 POST body 长什么样？

### 1.1 TypeScript 类型定义

`frontend/src/services/api.ts` 第 11-17 行：

```11:17:frontend/src/services/api.ts
export interface TaskCreate {
  video_path: string;
  video_filename: string;
  video_start_offset?: number;
  video_duration?: number;
  scene_mode?: string;
}
```

### 1.2 真正发出的位置

`frontend/src/pages/UploadPage.tsx::handleUploadSuccess` 拿到阶段 B 的上传结果后直接转手：

```52:60:frontend/src/pages/UploadPage.tsx
    try {
      const task = await createTask({
        video_filename: file.name,
        video_path: audioPath,
        video_start_offset: startOffset || 0,
        video_duration: videoDuration ?? undefined,
        scene_mode: sceneMode,
      });
```

### 1.3 实际网络上跑的 JSON 长这样

请求头：
```
POST /api/tasks HTTP/1.1
Content-Type: application/json
```

请求体（典型示例）：
```json
{
  "video_path": "D:\\dw_ai_project\\ai-slice-course\\backend\\storage\\uploads\\1715680000000_demo_live_replay.mp3",
  "video_filename": "demo_live_replay.mp4",
  "video_start_offset": 0,
  "video_duration": 7200.45,
  "scene_mode": "livestream"
}
```

> OBS 分段录制时的实际样例：
> ```json
> {
>   "video_path": "D:\\...\\1715680000000_obs_part2.mp3",
>   "video_filename": "obs_part2.mkv",
>   "video_start_offset": 3725.12,
>   "video_duration": 1800.00,
>   "scene_mode": "livestream"
> }
> ```

### 1.4 五个字段的来历与含义

| 字段 | 类型 | 怎么算出来的 | 干什么用 |
| --- | --- | --- | --- |
| `video_path` | string | **阶段 B 后端返回的 `audio_path`** | 后端写入 `tasks.source_path`，Worker 阶段 E 用它 `open()` MP3 喂给 Groq。命名是历史遗留，实际是音频路径 |
| `video_filename` | string | 浏览器里 `File.name`（原视频文件名，含原扩展名 `.mp4`/`.mkv`/...） | 写入 `tasks.video_filename`，仅用于 UI 显示任务标题，不参与任何文件操作 |
| `video_start_offset` | float (秒) | 阶段 A 在 `extractAudio()` 里通过 `-t 0.01` 跑一遍 FFmpeg 解析 log 拿到的 `start: XX.XX`（PTS 偏移） | 写入 `tasks.video_start_offset`。Worker 在 ASR 后会把每个 segment 的 `start/end` 加回这个偏移，让转录时间对齐音频起点；阶段 G 在浏览器切片时再减回去得到相对原视频的真实时间 |
| `video_duration` | float (秒) \| undefined | 阶段 A 解析 FFmpeg log 拿到的视频总时长 | 写入 `tasks.video_duration`，给 UI 显示"原视频时长"；同时 ASR 那段如果有这个值就不用再 `ffprobe` 一次省一次 IO |
| `scene_mode` | `'livestream' \| 'interview' \| 'lecture'` | 用户在 UploadPage 上选的"场景模式"单选按钮，默认 `livestream` | 写入 `tasks.scene_mode`，决定 `ClipAnalyzer` 用哪份 DeepSeek prompt 模板（直播找爆款 / 面试按问答切 / 课程按知识点切） |

### 1.5 后端 Pydantic 校验

`backend/app/models/schemas.py::TaskCreate`：

```10:18:backend/app/models/schemas.py
class TaskCreate(BaseModel):
    """创建任务请求"""

    video_path: str  # 本地存储路径
    video_filename: str
    video_start_offset: float = 0.0  # 视频 PTS 偏移（秒），OBS 分段录制时非 0
    video_duration: float | None = None  # 原视频时长（秒）
    scene_mode: str = "livestream"  # 场景模式：livestream / interview / lecture
```

字段类型不匹配 / 缺必填会被 FastAPI 自动转 `422 Unprocessable Entity`，前端 axios 会进 `catch` 走 `setStatus('error')` 分支。

---

## 问题 2：数据库存的是什么？有哪些字段？分别做什么用？

数据库写入动作就是 `tasks.py::create_task` 第 35-44 行：

```35:44:backend/app/api/tasks.py
    task = Task(
        source_path=data.video_path,
        video_filename=data.video_filename,
        video_start_offset=data.video_start_offset,
        video_duration=data.video_duration,
        scene_mode=data.scene_mode,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
```

注意：**只显式写了 5 个字段**，其它字段全部走 ORM 默认值。`Task` 模型定义在 `backend/app/models/database.py::Task` 第 23-48 行。

### 2.1 INSERT 后 `tasks` 表里这一行长什么样

```sql
INSERT INTO tasks (
    id, status, scene_mode, video_filename, source_path,
    video_duration, video_start_offset,
    progress, progress_message,
    transcript_json, error_message,
    created_at, updated_at
) VALUES (
    '7f2c8a91-4d6e-4b3a-9c11-2e8f7a6b5d10',  -- uuid 自动生成
    'pending',                                 -- 默认值
    'livestream',                              -- 前端给的
    'demo_live_replay.mp4',                    -- 前端给的
    'D:\\...\\1715680000000_demo.mp3',         -- ← video_path 映射进来
    7200.45,                                   -- 前端给的
    0.0,                                       -- 前端给的
    0,                                         -- 默认值
    '等待处理',                                 -- 默认值
    NULL,                                      -- 等 ASR 写入
    NULL,                                      -- 等失败时写入
    '2026-05-17 03:25:14.123',                 -- 默认 utcnow
    '2026-05-17 03:25:14.123'                  -- 默认 utcnow
);
```

### 2.2 完整字段拆解表

| 字段 | 类型 | INSERT 时的值 | 谁会写 | 谁会读 / 用来做什么 |
| --- | --- | --- | --- | --- |
| `id` | UUID (PK) | `uuid.uuid4()` 自动生成 | ORM 默认 | 全链路主键。返回给前端用作 `navigate(/tasks/${id})` / SSE / 详情 / 重试 / 删除 |
| `status` | String(20) | `'pending'`（默认值） | 创建时默认；Worker 不断推进 | 状态机：`pending → downloading → transcribing → analyzing → clipping → uploading → done`（失败统一 `failed`）。SSE 推它、列表轮询看它、是否允许重试看它 |
| `scene_mode` | String(30) | 前端传入，默认 `'livestream'` | 创建时一次 | `ClipAnalyzer.analyze()` 选 prompt 模板，决定切片粒度（直播 30s-3min / 面试 3-5min / 课程 5-10min） |
| `video_filename` | String(500) | 前端传入（原视频名，含 `.mp4`） | 创建 + `PATCH /rename` | 任务详情 UI 标题；阶段 G 浏览器导出 ZIP 文件名前缀 |
| `source_path` | String(500) | 前端 `video_path`（其实是音频本地路径） | 创建时一次 | Worker 拿它 `open()` MP3 喂 Groq；Worker 判断扩展名 `.mp3` 走"音频直传"分支，跳过本地 extract_audio |
| `video_duration` | Float \| NULL | 前端传入，可能为 NULL | 创建时；列表接口若发现 NULL 会自动 ffprobe 补齐（`hydrate_missing_task_durations`） | UI 显示原视频时长；ASR 切块时如果有就跳过 ffprobe；阶段 G 进度条计算 |
| `video_start_offset` | Float | 前端传入，默认 0.0 | 创建时一次 | ASR 转录后给每个 segment 的 start/end 加这个偏移，对齐音频起点；阶段 G 切片时再减回去得到相对原视频的真实时间 |
| `progress` | Integer | 默认 `0` | Worker 每一步都更新 | SSE 推送；列表/详情进度条 |
| `progress_message` | String(200) | 默认 `'等待处理'` | Worker 每一步都更新 | SSE 推送；UI 显示"正在转录..."等人话提示 |
| `transcript_json` | JSON \| NULL | NULL | 阶段 E2 Groq 转录完成后一次性写入 | DeepSeek 切片分析的输入；`_align_to_transcript` 把 LLM 给的时间对齐到 segment 边界防止编造 |
| `error_message` | Text \| NULL | NULL | Worker 抛异常时写入 | UI 失败时弹错误详情；重试时不清空（保留历史） |
| `created_at` | DateTime | 默认 `datetime.utcnow()` | 创建时一次 | 任务列表按它倒序排列 |
| `updated_at` | DateTime | 默认 `datetime.utcnow()`，`onupdate` 自动更新 | 任何字段变更触发 | 调试用；前端目前不显示 |

### 2.3 字段命名陷阱（容易踩坑）

| 看起来的意思 | 实际意思 | 为什么这么糟 |
| --- | --- | --- |
| `tasks.source_path` | "原视频路径" | **实际存的是 MP3 音频路径** | 早期版本支持视频直传，列名没改 |
| `TaskCreate.video_path`（前端字段） | "视频路径" | **实际传的是音频路径** | 同上 |
| `tasks.video_filename` | "视频文件名" | 真的是原视频文件名（如 `xxx.mp4`），但磁盘上实际存的是 `xxx.mp3`，**两者扩展名不一致** | 历史命名沿用 |
| `TaskClip.oss_key`（前端类型） | "OSS Key" | **是后端 `clips.file_key`（本地相对路径）** | 重构前用过 OSS，前端类型没改 |

> 一句话记忆：**这套字段名都是历史遗留，命名里出现的 `video_` / `oss_` 一律不代表字面意思**。`source_path` 是音频，`oss_key` 是本地路径。

### 2.4 关联表：`clips`（阶段 E5 才会写，本阶段空表）

虽然阶段 C 不写 `clips` 表，但 ORM 通过 `relationship` 把它绑死：

```46:48:backend/app/models/database.py
    clips: Mapped[list["Clip"]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )
```

`cascade="all, delete-orphan"` 含义：**删除 Task 时 PostgreSQL 会级联删除所有 clips**。所以 `DELETE /api/tasks/:id` 不需要手动清 clips 表。

### 2.5 一张图看清"前端字段 → DB 字段"映射

```
前端 POST body                       数据库 tasks 行
────────────────────                ──────────────────────
{                                   id              ← uuid.uuid4() 自动
  video_path        ──────────────► source_path        (字符串，本地音频绝对路径)
  video_filename    ──────────────► video_filename     (原视频名)
  video_start_offset ─────────────► video_start_offset (秒)
  video_duration    ──────────────► video_duration     (秒，可空)
  scene_mode        ──────────────► scene_mode         (livestream/interview/lecture)
}                                   status          ← 'pending' 默认
                                    progress        ← 0 默认
                                    progress_message ← '等待处理' 默认
                                    transcript_json ← NULL  (等阶段 E2)
                                    error_message   ← NULL  (等失败)
                                    created_at      ← utcnow()
                                    updated_at      ← utcnow()
```

---

## 问题 3：后端返回什么？

返回的是 `TaskResponse`（`backend/app/models/schemas.py::TaskResponse`）的 JSON 序列化，**HTTP 200**。

### 3.1 实际响应 JSON

```json
{
  "id": "7f2c8a91-4d6e-4b3a-9c11-2e8f7a6b5d10",
  "status": "pending",
  "video_filename": "demo_live_replay.mp4",
  "source_path": "",
  "video_duration": 7200.45,
  "scene_mode": "livestream",
  "video_start_offset": 0.0,
  "progress": 0,
  "progress_message": "等待处理",
  "error_message": null,
  "created_at": "2026-05-17T03:25:14.123456",
  "updated_at": "2026-05-17T03:25:14.123456",
  "clips": []
}
```

### 3.2 字段含义和"细节坑"

| 字段 | 值 | 备注 |
| --- | --- | --- |
| `id` | UUID 字符串 | **前端立刻 `navigate(/tasks/${id})` 用这个跳详情页** |
| `status` | `'pending'` | 还没被 Worker 拾起 |
| `video_filename` | 原视频名 | UI 标题 |
| `source_path` | **空字符串 `""`** | ⚠️ 这是个坑：`TaskResponse` 给了默认值 `""`（schema 第 56 行），而 `create_task` 在手动构建 response 时**没传 source_path**（看下方 3.3 代码），所以前端拿到的是空串。**但 DB 里实际是存了音频路径的**，列表/详情接口走 `model_validate(task)` 才会拿到真值 |
| `video_duration` | 秒数或 null | 与 INSERT 一致 |
| `scene_mode` | 与 INSERT 一致 | |
| `video_start_offset` | 与 INSERT 一致 | |
| `progress` | `0` | |
| `progress_message` | `'等待处理'` | |
| `error_message` | `null` | 新建任务没有错误 |
| `created_at` / `updated_at` | ISO8601 字符串 | UTC 时间 |
| `clips` | `[]` | **新建任务一定为空数组**。详情接口在 `status=done` 后才会有元素 |

### 3.3 为什么响应是手动构建的（不是 `model_validate`）

`backend/app/api/tasks.py` 第 46-58 行：

```46:58:backend/app/api/tasks.py
    # 新建任务不会有 clips，手动构建避免异步懒加载
    return TaskResponse(
        id=task.id,
        status=task.status.value if hasattr(task.status, 'value') else task.status,
        video_filename=task.video_filename,
        video_duration=task.video_duration,
        progress=task.progress,
        progress_message=task.progress_message,
        error_message=task.error_message,
        created_at=task.created_at,
        updated_at=task.updated_at,
        clips=[],
    )
```

原因：SQLAlchemy 异步模式下，访问 `task.clips` 会触发懒加载，但当前 session 还没 select 过 `clips`，会抛 `MissingGreenlet` 错误。手动构建直接给 `clips=[]` 绕开这个问题（反正新建任务必为空）。

**副作用**：`source_path / scene_mode / video_start_offset` 这三个字段没显式传，Pydantic 走 schema 的默认值（`""` / `"livestream"` / `0.0`）。
- 如果用户选的是 `interview`，**这里返回的 `scene_mode` 仍然是 `"livestream"`**（schema 默认）—— 不影响功能因为前端马上跳详情页会重新 GET。
- 同理 `source_path` 返回空串，但 DB 里有真值。

> 这是一个**隐蔽 bug**，正常流程下用户感知不到（前端紧接着 GET /api/tasks/:id 会拿到真值）。如果想修，可以把 `scene_mode=task.scene_mode, source_path=task.source_path, video_start_offset=task.video_start_offset` 也补上。

### 3.4 前端怎么消费响应

```52:61:frontend/src/pages/UploadPage.tsx
    try {
      const task = await createTask({
        video_filename: file.name,
        video_path: audioPath,
        video_start_offset: startOffset || 0,
        video_duration: videoDuration ?? undefined,
        scene_mode: sceneMode,
      });

      navigate(`/tasks/${task.id}`);
```

`createTask` 内部还经过 `normalizeTaskDetailResponse(data)`，把后端字段命名差异（`source_path` ↔ `video_oss_key`，`file_key` ↔ `oss_key`）抹平到前端 `TaskDetail` 类型。

**前端实际只用了 `task.id` 一个字段**！其它字段会被丢弃，因为下一步立刻 `navigate(/tasks/${id})` 进详情页，详情页会重新 `GET /api/tasks/${id}` 拿到一份带完整 clips 的新数据（虽然此刻 clips 还是空的，因为状态还是 pending）。

### 3.5 错误情况下的响应

| HTTP 状态码 | 触发条件 | body 形态 |
| --- | --- | --- |
| `200` | 正常创建 | 上面的 `TaskResponse` |
| `422` | 请求体字段类型/缺失校验失败 (Pydantic) | `{"detail": [{"loc": [...], "msg": "...", "type": "..."}]}` |
| `500` | DB commit 失败、连接断等 | `{"detail": "Internal Server Error"}` |

前端 axios catch 后统一走 `setStatus('error')` 并把 `error.message` 渲染到错误条上。

---

## 一句话回顾阶段 C

> 前端把阶段 B 拿到的 `audio_path` 改名叫 `video_path`，连同原视频文件名、PTS 偏移、视频时长、场景选项，打包成一个 5 字段的 JSON `POST /api/tasks`。后端用 `TaskCreate` Pydantic 校验后 **`INSERT INTO tasks`** 一行 `status='pending'` 的任务（13 个字段，其中 5 个来自请求，其余走默认值），同步返回一个**带 `id` 但 `clips=[]` 的精简 `TaskResponse`**。前端只用响应里的 `id` 立刻 `navigate(/tasks/${id})`，剩下的字段在详情页会再 GET 一次拿到。Worker 在后台每秒轮询 `status='pending'` 把这个任务拾起来，从此走入阶段 E 的流水线。
