# 阶段 A：浏览器端抽音频 —— 原理逐题拆解

> 对应代码：`frontend/src/services/audioExtractor.ts::extractAudio()` 与 `frontend/src/services/ffmpegRuntime.ts`
> 触发位置：`frontend/src/components/FileUploader.tsx::processFile()`

---

## 1. WASM 在前端领域是什么？解决什么问题？

### 1.1 是什么

**WASM = WebAssembly**，一种可以在浏览器里运行的"二进制字节码格式"。

可以把它理解成浏览器里的"第二个 JS"：

| 维度 | JavaScript | WebAssembly |
| --- | --- | --- |
| 形态 | 文本（源码） | 二进制（编译产物，类似 `.exe`/`.so`） |
| 速度 | 解释 + JIT | 接近原生（汇编级） |
| 来源 | 直接写 | 用 C/C++/Rust/Go 等编译过来 |
| 内存模型 | GC 托管 | 自己一块**线性内存**（`ArrayBuffer`） |
| 运行环境 | 浏览器 JS 引擎 | 浏览器 WASM 虚拟机（V8/SpiderMonkey 都内置） |

### 1.2 解决了什么问题

浏览器原生 JS 在这些场景**力不从心**：

1. **CPU 密集计算**：视频转码、音频编解码、图像处理、加密、压缩、3D 渲染、PDF/Office 解析、SQL 引擎……纯 JS 慢 5–20 倍。
2. **复用已有 C/C++ 生态**：FFmpeg、SQLite、OpenCV、PDFium、libheif…… 这些库花了几十年打磨，没人会用 JS 重写。WASM 让它们**直接搬到浏览器里跑**。
3. **跨平台一致性**：同一份 `.wasm`，Windows/Mac/Linux/Android/iOS 浏览器跑出来的结果完全一致。

### 1.3 本项目里的角色

我们用的 `@ffmpeg/ffmpeg`（FFmpeg.wasm）就是把整个 FFmpeg（C 写的、几百万行）编译成 `.wasm`，让浏览器里跑出和命令行 `ffmpeg` **同样的转码效果**。

```ts
import bundledCoreScriptUrl from '@ffmpeg/core?url';
import bundledCoreWasmUrl from '@ffmpeg/core/wasm?url';
```

`@ffmpeg/core/wasm` 就是那个二进制大文件（约 30 MB），浏览器加载它之后就拥有了"本地 FFmpeg"的能力。

**对项目的直接收益**：用户不用装任何软件 → 打开网页 → 浏览器里完成视频转音频。

---

## 2. "FFmpeg.wasm + WORKERFS 挂载，不把视频整体读进内存" 什么意思？WORKERFS 是什么？

### 2.1 先看"旧的、错误的"做法

FFmpeg.wasm 官方最简单的用法（很多教程都这么写）：

```ts
// ❌ 反例：会 OOM
const data = await fetchFile(videoFile);   // 把 2.5GB 视频整体读成 Uint8Array
await ffmpeg.writeFile('input.mp4', data); // 再拷一份到 WASM 虚拟文件系统
await ffmpeg.exec(['-i', 'input.mp4', ...]);
```

问题在于：
- `Uint8Array` 在 JS 堆里占 **2.5 GB**；
- `writeFile` 又拷到 WASM 的线性内存里占 **2.5 GB**；
- 浏览器单个 Tab 通常只有 2–4 GB 可用堆，**直接崩溃 / OOM**。

### 2.2 WORKERFS 是什么

WORKERFS 是 **Emscripten 提供的一种"虚拟文件系统"驱动**（Emscripten 是把 C 代码编译成 WASM 的工具链）。

它在 Web Worker 环境下，**直接把浏览器的 `File` / `Blob` 对象挂成"文件"**，让 WASM 里运行的 C 代码（FFmpeg）可以像读本地磁盘一样 `fopen/fread` 它。

关键特性：**惰性读取（lazy / on-demand）**——FFmpeg 真正读到哪一段字节，WORKERFS 才用 `File.slice(start, end)` 去读那一小段，**永远不把整个文件加载进内存**。

### 2.3 项目里怎么用

看 `ffmpegRuntime.ts::mountWorkerFile`：

```139:147:frontend/src/services/ffmpegRuntime.ts
export async function mountWorkerFile(
  ffmpeg: WorkerFsFFmpegLike,
  file: File,
  mountPoint: string,
): Promise<string> {
  await ensureDir(ffmpeg, mountPoint);
  await ffmpeg.mount('WORKERFS', { files: [file] }, mountPoint);
  return `${mountPoint}/${file.name}`;
}
```

然后在 `audioExtractor.ts` 里：

```87:96:frontend/src/services/audioExtractor.ts
// 1. 用 WORKERFS 挂载视频文件（零拷贝，惰性读取，不占 WASM 堆内存）
//    对比旧方案 fetchFile() + writeFile()：那会把整个文件复制到 WASM 内存里，
//    2.5 GB 视频 → 需要 ~5 GB 内存（Uint8Array + WASM FS 各一份），直接 OOM。
//    WORKERFS 通过 Emscripten 的虚拟文件系统直接引用浏览器的 File handle，
//    FFmpeg 只在需要时读取对应的字节区间，内存占用降到几十 MB。
onProgress?.({ ratio: 0.05, message: '正在挂载视频文件...' });

// WORKERFS 挂载后，文件可通过 /input/<原始文件名> 访问
const inputPath = await mountWorkerFile(instance, videoFile, MOUNT_POINT);
```

### 2.4 形象比喻

| 方式 | 比喻 |
| --- | --- |
| `fetchFile + writeFile`（旧） | 想看书，先把整本书复印一份带回家，再开始读。书 2 GB，复印纸不够用 → 崩溃 |
| `WORKERFS mount`（新） | 把书放图书馆桌上，需要哪页翻哪页，看完就走，**家里永远只有一支笔的空间** |

**结论**：WORKERFS 让浏览器可以处理 **4 GB 甚至更大**的视频文件，内存占用只有几十 MB，这是阶段 A 能成立的核心技术前提。

---

## 3. `-vn -acodec libmp3lame -ar 16000 -ac 1 -b:a 64k` 这段参数什么意思？

这是 FFmpeg 命令行参数，对应代码：

```137:149:frontend/src/services/audioExtractor.ts
await instance.exec(
  [
    '-i', inputPath,
    '-vn',                   // 去掉视频流
    '-acodec', 'libmp3lame', // MP3 编码
    '-ar', '16000',          // 16kHz 采样率
    '-ac', '1',              // 单声道
    '-b:a', '64k',           // 64kbps 码率
    outputName,
  ],
  -1,
  signal ? { signal } : undefined,
);
```

逐个解释：

| 参数 | 全称 | 含义 | 为什么这么选 |
| --- | --- | --- | --- |
| `-i inputPath` | input | 输入文件路径 | WORKERFS 挂载点下的视频 |
| `-vn` | **v**ideo **n**o | **丢掉视频流**，只处理音频 | 我们只要音频做转写，视频部分不要 |
| `-acodec libmp3lame` | **a**udio **codec** = lame | 输出编码器选 LAME MP3 | MP3 体积小、兼容性最好、ASR 服务都吃 |
| `-ar 16000` | **a**udio **r**ate | **采样率 16 kHz** | 人声频谱上限约 8 kHz，奈奎斯特定理 16 kHz 足够；Whisper/通义 ASR 内部就是 16 kHz |
| `-ac 1` | **a**udio **c**hannels | **单声道（mono）** | 语音转写不需要立体声，单声道直接体积减半 |
| `-b:a 64k` | **b**itrate of **a**udio | **音频码率 64 kbps** | 语音清晰度足够；2h 视频 → 约 `64 kbps × 7200s ÷ 8 ≈ 57 MB` |
| `outputName` | — | 输出文件路径 `/output.mp3` | 写到 WASM 虚拟 FS，后面再 `readFile` 取出来 |

### 一句话总结

> **"扔掉画面，把声音压成最适合语音识别的 16kHz 单声道 64kbps MP3"** —— 这套参数是语音转写场景下"体积/质量/识别准确率"的甜点区，和后端 `extract_audio()` 保持一致，保证前后端切换不影响识别结果。

### 体积估算（直观感受降本）

| 阶段 | 数据形态 | 大小（2h 视频） |
| --- | --- | --- |
| 原视频 | 1080p H.264 + AAC | 1.5 ~ 2.5 GB |
| 抽完音频 | MP3 16kHz/mono/64kbps | **~57 MB** |
| 压缩比 | — | **约 97~99% 缩减** |

---

## 4. `{ blob, filename, startOffset, videoDuration }` 输出的是啥？2h 视频会得到 2h 的 MP3 吗？

### 4.1 字段含义

```ts
return { blob, filename: audioFilename, startOffset, videoDuration };
```

| 字段 | 类型 | 含义 | 举例（2h 视频） |
| --- | --- | --- | --- |
| `blob` | `Blob`（`audio/mpeg`） | **完整 MP3 音频的二进制数据**，浏览器内存对象 | `Blob { size: 57_000_000, type: 'audio/mpeg' }` |
| `filename` | `string` | 给后端 / 下载用的文件名 | 视频叫 `live_2026.mkv` → `live_2026.mp3` |
| `startOffset` | `number`（秒） | 视频容器的 **PTS 起始偏移**，OBS 分段录制会有这个值 | 一般 `0`；OBS 第二段录制可能是 `3600.0` |
| `videoDuration` | `number \| null`（秒） | 视频总时长，从 FFmpeg log 里解析出来 | `7200`（即 2h） |

### 4.2 是不是 2h 的 MP3？

**是的，是完整 2h 的 MP3。**

注意命令里**没有 `-t`（截断时长）也没有 `-ss`（跳过开头）**：

```ts
'-i', inputPath,
'-vn',
'-acodec', 'libmp3lame',
'-ar', '16000',
'-ac', '1',
'-b:a', '64k',
outputName,
```

FFmpeg 会**从头到尾完整转码音频流**，所以：

- 输入：2h 视频
- 输出：**2h 的 MP3**，大约 57 MB
- 后续 ASR 服务收到的也是 2h 的完整音频，转写出来的字幕时间戳是 `0s ~ 7200s` 覆盖全程

> ⚠️ 上面的"用 `-t 0.01` 那次 `exec`"是**探测元信息用的另一次调用**，目的是借 FFmpeg 启动时打印的 log 拿到 `Duration` 和 `start`。它会在真正的转码之前先跑一次，几乎瞬间结束（只读 0.01s）。**真正生成 MP3 的是第二次 `exec`，没有时长限制**。

### 4.3 内存里的 Blob 后面去哪了

回到 `FileUploader.tsx`：

```74:101:frontend/src/components/FileUploader.tsx
const { blob, filename, startOffset, videoDuration } = await extractAudio(...);

// ...

// ── Step 2：上传音频（体积已从 GB 缩减到 ~30 MB）──
const result = await uploadAudio(
  blob,
  filename,
  (p: number) => { ... },
  abortController.signal,
);
```

`blob` 通过 `uploadAudio()`（FormData + XHR）传给后端 → 后端拿到的就是这份 57 MB MP3，**根本不需要再用原视频**。

---

## 5. "通过解析 FFmpeg log 探测出 `start: XX.XX`（PTS 偏移）和总时长" —— 副产物是啥？

### 5.1 副产物 = `startOffset` + `videoDuration`

它们不是 MP3 的一部分，是**附加的元数据**，来自下面这段 log 解析逻辑：

```98:132:frontend/src/services/audioExtractor.ts
let startOffset = 0;
let videoDuration: number | null = null;
const logLines: string[] = [];
const logHandler = ({ message }: { message: string }) => {
  logLines.push(message);
};
instance.on('log', logHandler);
try {
  // 用 -t 0.01 只读极短的一段来获取文件信息，几乎瞬间完成
  await instance.exec(['-i', inputPath, '-t', '0.01', '-f', 'null', '-'], -1, signal ? { signal } : undefined);
} catch {
  // 即使 exec 报错（无输出格式等），log 中已经包含了文件信息
}
instance.off('log', logHandler);

// 从 FFmpeg log 中解析 start: XXXX.XXXX
for (const line of logLines) {
  const durationMatch = line.match(/Duration:\s+(\d+):(\d+):([\d.]+)/);
  if (durationMatch && videoDuration === null) {
    const hours = parseInt(durationMatch[1], 10);
    const minutes = parseInt(durationMatch[2], 10);
    const seconds = parseFloat(durationMatch[3]);
    videoDuration = hours * 3600 + minutes * 60 + seconds;
  }

  const match = line.match(/start:\s+([\d.]+)/);
  if (match) {
    const parsed = parseFloat(match[1]);
    if (parsed > 1) {  // 忽略极小偏移（<1s 通常是编码延迟，不是 PTS 偏移）
      startOffset = parsed;
      console.log(`[AudioExtractor] Detected video start_time: ${startOffset}s`);
    }
    break;
  }
}
```

### 5.2 PTS 是什么？

**PTS = Presentation Time Stamp**，"显示时间戳"。

视频容器（MP4/MKV/TS）里每一帧都带一个时间戳，告诉播放器"这帧应该在第几秒显示"。

正常录制：第一帧 PTS = `0.000s`，第二帧 `0.040s`（25fps）…… 一路递增。

### 5.3 为什么 OBS 分段录制会有 `start` 偏移？

OBS 的"按时长 / 大小自动分段"功能，会**保留全局时间轴**：

| 段 | 物理文件 | 视频内 PTS 范围 |
| --- | --- | --- |
| `live_001.mkv` | 第 1 个文件 | `0s ~ 3600s` |
| `live_002.mkv` | 第 2 个文件 | **`3600s ~ 7200s`** ← 第一帧 PTS 不是 0！ |
| `live_003.mkv` | 第 3 个文件 | `7200s ~ 10800s` |

FFmpeg 读 `live_002.mkv` 时，log 会打印：

```
Duration: 01:00:00.00, start: 3600.000000, bitrate: ...
```

如果不处理这个偏移会怎样？

- ASR 服务转写出来的字幕时间戳是 `3600.0s ~ 7200.0s`（跟着 PTS 走）
- 但用户看视频时，文件本身是 0~3600s
- → **字幕全错位 1 小时**，剪辑/跳转全废

### 5.4 解决思路

把 `startOffset = 3600` 一路透传给后端：

```105:105:frontend/src/components/FileUploader.tsx
onUploadSuccess(file, result.audio_path, startOffset, videoDuration);
```

后端拿到 ASR 时间戳后，统一做 `t_real = t_asr - startOffset`，字幕和视频就对齐了。

### 5.5 `videoDuration` 拿来做什么

- 给前端进度条估算用（"已转写 1230s / 7200s"）
- 给后端做时长校验（音频时长应该 ≈ 视频时长，差太多就报错）
- 给生成切片时做边界检查（切片结束时间不能超过总时长）

### 5.6 为什么要单独跑一次 `-t 0.01`

因为 FFmpeg.wasm 的 `log` 事件只在 `exec` 期间触发，必须**真的让它跑一次**才能拿到 `Duration` / `start` 这些行。
用 `-t 0.01 -f null -` 表示"只读 0.01 秒，输出丢弃"，**几毫秒就结束**，但 log 已经包含了所有元信息。

---

## 6. 用户视频 2h，切片时文字的时间是 ASR 那边解析对应上的吗？这个阶段不解析这个时间吧？

**完全正确，阶段 A 不做任何文字 / 时间戳解析。**

### 6.1 阶段 A 的边界（只做这 4 件事）

1. 浏览器加载 FFmpeg.wasm
2. WORKERFS 挂载用户的视频文件
3. 探测元数据：`startOffset`、`videoDuration`
4. 抽音频得到完整 MP3 Blob

**整个过程不接触一个字、一句话、一个时间戳。**

### 6.2 文字 + 时间戳从哪来

来自后端 / ASR 服务（阶段 B 及之后），大概链路：

```
[阶段 A：前端] ─ MP3 + startOffset + videoDuration ──► [阶段 B：后端上传/落盘]
                                                            │
                                                            ▼
                                  [阶段 C：调用 ASR（通义/Whisper/...）]
                                  返回带时间戳的字幕：
                                  [
                                    { start: 12.3, end: 15.8, text: "今天给大家..." },
                                    { start: 15.8, end: 19.2, text: "讲一下..." },
                                    ...
                                  ]
                                                            │
                                                            ▼
                                  [阶段 D：用 startOffset 修正时间，再做切片/打点]
```

### 6.3 字幕时间为什么能"对应上"视频

依赖三件事环环相扣：

1. **音频是完整的、无裁剪的**：阶段 A 给 ASR 的是 2h 完整 MP3，时间轴 `0 ~ 7200s` 和视频一一对应。
2. **采样率/单声道与 ASR 期望一致**：`16kHz mono` 是绝大多数 ASR 的默认输入，避免内部再重采样引入时间漂移。
3. **PTS 偏移已被前端探测出来**：`startOffset` 透传给后端，后端做减法即可对齐。

只要这三件事都成立，**ASR 返回的 `start/end` 秒数 = 用户视频里看到的真实时间**，切片自然能精确到秒。

### 6.4 简单对照表

| 信息 | 在阶段 A 出现吗？ | 由谁产出 |
| --- | --- | --- |
| MP3 数据 | ✅ 出现（产出） | 前端 FFmpeg.wasm |
| 视频总时长 `videoDuration` | ✅ 出现（探测） | 前端 FFmpeg log 解析 |
| PTS 偏移 `startOffset` | ✅ 出现（探测） | 前端 FFmpeg log 解析 |
| 字幕文本 | ❌ 不出现 | 后端 ASR |
| 每句字幕的 `start/end` 时间 | ❌ 不出现 | 后端 ASR |
| 切片区间（爆点段） | ❌ 不出现 | 后端 LLM / 规则引擎 |

---

## 附：阶段 A 全景一句话总结

> **把"传 2 GB 视频上服务器再抽音频"这件事，搬到用户的浏览器里 0 元做完**——
> 靠 WASM 让浏览器跑 FFmpeg，靠 WORKERFS 让大文件零拷贝惰性读取，靠固定的语音参数（`-vn -acodec libmp3lame -ar 16000 -ac 1 -b:a 64k`）把体积压到 1% 不到，顺带从 FFmpeg log 里"白嫖"出 `startOffset` 和 `videoDuration` 两个元数据，作为后续字幕对齐和切片的基础。
> 至于字、时间戳、切片点，全都是后面阶段的事，阶段 A 一概不管。
