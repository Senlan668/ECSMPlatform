# 本地一键切片交互 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把任务详情页的“一键切片”从手动输入本地路径改成选择原视频文件后在浏览器本地切片下载，同时不影响现有 AI 自动直播切片主流程。

**Architecture:** 保持后端 `/api/tasks/{id}` 继续提供 clip 时间段，不新增后端导出接口。前端新增一个独立的本地切片服务，基于 FFmpeg.wasm + WORKERFS 逐段裁切视频，再用轻量 ZIP 库在浏览器内打包下载。任务详情页只替换“一键切片”弹窗，不动上传页、SRT 导出、文案导出和剪映草稿导出逻辑。

**Tech Stack:** React 19, TypeScript 6, Vite 8, FFmpeg.wasm, fflate, Node test runner

---

## File Map

- Create: `frontend/src/utils/videoFileMatch.ts`
  负责把“任务文件名”和“用户选择的文件”做轻量匹配，输出是否像视频、是否高概率匹配、是否需要警告。
- Create: `frontend/tests/videoFileMatch.test.ts`
  覆盖文件名规范化、非视频文件拦截、近似文件名警告。
- Create: `frontend/src/utils/localClipExport.ts`
  负责把任务 clips 转成本地导出规格，保留原始 `start_time` / `end_time`，生成安全文件名，并汇总成功/失败结果文案。
- Create: `frontend/tests/localClipExport.test.ts`
  覆盖原始时间保留、非法字符清洗、零时长片段过滤、结果汇总。
- Create: `frontend/src/services/videoClipExporter.ts`
  负责 FFmpeg.wasm 初始化、WORKERFS 挂载、逐段切片、ZIP 打包、取消与资源清理。
- Create: `frontend/src/components/LocalClipExportModal.tsx`
  负责“一键切片”弹窗 UI，包括文件拖拽/选择、警告文案、进度状态和取消操作。
- Modify: `frontend/src/pages/TaskDetailPage.tsx`
  接入新弹窗和本地导出服务，删除路径输入框与后端 `exportClips` 调用，保留其他导出能力不变。
- Modify: `frontend/package.json`
  增加 `fflate` 依赖。
- Modify: `frontend/package-lock.json`
  锁定新增依赖版本。

不计划修改后端文件。现有 [export.py](/Users/lizexi/Documents/AI/Agent/ai-slice/backend/app/api/export.py) 中的 `/api/tasks/{task_id}/export/clips` 接口先保留，但不再由前端任务详情页调用。

---

### Task 1: 文件选择匹配规则

**Files:**
- Create: `frontend/src/utils/videoFileMatch.ts`
- Test: `frontend/tests/videoFileMatch.test.ts`

- [ ] **Step 1: 写失败用例**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateVideoSelection } from '../src/utils/videoFileMatch.ts';

test('完全相同的文件名视为高匹配', () => {
  const result = evaluateVideoSelection({
    taskFilename: '3.31 25K C++ 11K到21k-01.mp4',
    fileName: '3.31 25K C++ 11K到21k-01.mp4',
    mimeType: 'video/mp4',
    sizeBytes: 1024,
  });

  assert.equal(result.isVideoLike, true);
  assert.equal(result.isLikelyMatch, true);
  assert.equal(result.warning, null);
});

test('非视频文件直接标记为无效', () => {
  const result = evaluateVideoSelection({
    taskFilename: '直播回放.mp4',
    fileName: '直播回放.txt',
    mimeType: 'text/plain',
    sizeBytes: 512,
  });

  assert.equal(result.isVideoLike, false);
});

test('文件名差异明显时给出警告', () => {
  const result = evaluateVideoSelection({
    taskFilename: '直播回放.mp4',
    fileName: '别的素材.mp4',
    mimeType: 'video/mp4',
    sizeBytes: 1024,
  });

  assert.equal(result.isLikelyMatch, false);
  assert.match(result.warning ?? '', /可能不是本任务的原视频/);
});
```

- [ ] **Step 2: 运行用例确认失败**

Run: `cd frontend && node --test tests/videoFileMatch.test.ts`

Expected: FAIL，报 `ERR_MODULE_NOT_FOUND` 或 `evaluateVideoSelection is not exported`

- [ ] **Step 3: 实现最小匹配工具**

```ts
export interface VideoSelectionInput {
  taskFilename: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface VideoSelectionResult {
  isVideoLike: boolean;
  isLikelyMatch: boolean;
  warning: string | null;
}

const normalizeBaseName = (name: string) =>
  name
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[\s._-]+/g, '')
    .replace(/[()[\]【】]/g, '');

export function evaluateVideoSelection(input: VideoSelectionInput): VideoSelectionResult {
  const taskBase = normalizeBaseName(input.taskFilename);
  const fileBase = normalizeBaseName(input.fileName);
  const isVideoLike =
    input.mimeType.startsWith('video/') ||
    /\.(mp4|mov|mkv|avi|flv|wmv|ts|m4v)$/i.test(input.fileName);
  const isLikelyMatch =
    taskBase === fileBase || taskBase.includes(fileBase) || fileBase.includes(taskBase);

  if (!isVideoLike) return { isVideoLike: false, isLikelyMatch: false, warning: '请选择视频文件' };
  if (!isLikelyMatch) {
    return {
      isVideoLike: true,
      isLikelyMatch: false,
      warning: '你选择的可能不是本任务的原视频，切片时间点可能不匹配',
    };
  }

  return { isVideoLike: true, isLikelyMatch: true, warning: null };
}
```

- [ ] **Step 4: 运行用例确认通过**

Run: `cd frontend && node --test tests/videoFileMatch.test.ts`

Expected: PASS，3 个测试全部通过

- [ ] **Step 5: 提交这一小步**

```bash
git add frontend/src/utils/videoFileMatch.ts frontend/tests/videoFileMatch.test.ts
git commit -m "feat: add local clip video file matching"
```

### Task 2: 本地切片规格与结果汇总

**Files:**
- Create: `frontend/src/utils/localClipExport.ts`
- Test: `frontend/tests/localClipExport.test.ts`

- [ ] **Step 1: 写失败用例**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLocalClipSpecs,
  buildClipArchiveName,
  summarizeLocalClipExport,
} from '../src/utils/localClipExport.ts';

test('导出规格保留原始 clip 时间，不使用展示时间', () => {
  const specs = buildLocalClipSpecs([
    { clip_index: 1, title: '第一段', start_time: 2482, end_time: 2533 },
  ]);

  assert.deepEqual(specs[0], {
    clipIndex: 1,
    title: '第一段',
    startTime: 2482,
    endTime: 2533,
    duration: 51,
    outputName: '01_第一段.mp4',
  });
});

test('非法字符会被替换成安全文件名', () => {
  const specs = buildLocalClipSpecs([
    { clip_index: 2, title: 'A/B:C*D?', start_time: 10, end_time: 20 },
  ]);

  assert.equal(specs[0].outputName, '02_A_B_C_D_.mp4');
});

test('零时长片段会被过滤', () => {
  const specs = buildLocalClipSpecs([
    { clip_index: 3, title: '空片段', start_time: 10, end_time: 10 },
  ]);

  assert.equal(specs.length, 0);
});

test('汇总文案会区分成功和失败数量', () => {
  assert.equal(
    summarizeLocalClipExport({ succeeded: 9, failed: [{ clipIndex: 4, title: '片段 4', reason: 'ffmpeg error' }] }),
    '已成功导出 9 段，失败 1 段'
  );
});
```

- [ ] **Step 2: 运行用例确认失败**

Run: `cd frontend && node --test tests/localClipExport.test.ts`

Expected: FAIL，报 `ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: 实现最小导出规格工具**

```ts
export interface LocalClipSpec {
  clipIndex: number;
  title: string;
  startTime: number;
  endTime: number;
  duration: number;
  outputName: string;
}

export function buildLocalClipSpecs(clips: Array<{
  clip_index: number;
  title: string;
  start_time: number;
  end_time: number;
}>): LocalClipSpec[] {
  return clips
    .map((clip) => {
      const duration = clip.end_time - clip.start_time;
      return {
        clipIndex: clip.clip_index,
        title: clip.title,
        startTime: clip.start_time,
        endTime: clip.end_time,
        duration,
        outputName: `${String(clip.clip_index).padStart(2, '0')}_${sanitizeClipTitle(clip.title)}.mp4`,
      };
    })
    .filter((clip) => clip.duration > 0);
}

function sanitizeClipTitle(title: string): string {
  const cleaned = title.replace(/[\/\\:*?"<>|]/g, '_').trim();
  return cleaned.length > 0 ? cleaned.slice(0, 50) : '未命名片段';
}

export function buildClipArchiveName(videoFilename: string): string {
  return `${videoFilename.replace(/\.[^.]+$/, '') || 'AI切片'}_AI切片.zip`;
}

export function summarizeLocalClipExport(result: {
  succeeded: number;
  failed: Array<{ clipIndex: number; title: string; reason: string }>;
}): string {
  return result.failed.length > 0
    ? `已成功导出 ${result.succeeded} 段，失败 ${result.failed.length} 段`
    : `切片完成！已下载 ZIP 文件`;
}
```

- [ ] **Step 4: 运行用例确认通过**

Run: `cd frontend && node --test tests/localClipExport.test.ts`

Expected: PASS，4 个测试全部通过

- [ ] **Step 5: 提交这一小步**

```bash
git add frontend/src/utils/localClipExport.ts frontend/tests/localClipExport.test.ts
git commit -m "feat: add local clip export helpers"
```

### Task 3: 浏览器本地切片服务

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/src/services/videoClipExporter.ts`

- [ ] **Step 1: 安装 ZIP 依赖**

Run: `cd frontend && npm install fflate`

Expected: `package.json` 和 `package-lock.json` 新增 `fflate`，无依赖冲突

- [ ] **Step 2: 实现 FFmpeg.wasm 本地切片服务**

```ts
import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { zipSync } from 'fflate';

import { buildLocalClipSpecs } from '../utils/localClipExport';

export interface LocalClipExportProgress {
  stage: 'loading' | 'reading' | 'clipping' | 'zipping' | 'done';
  currentClip: number;
  totalClips: number;
  message: string;
}

export interface LocalClipExportFailure {
  clipIndex: number;
  title: string;
  reason: string;
}

let exporterFFmpeg: FFmpeg | null = null;
let exporterLoadPromise: Promise<FFmpeg> | null = null;

async function getExporterFFmpeg(
  onProgress?: (progress: LocalClipExportProgress) => void,
  signal?: AbortSignal,
): Promise<FFmpeg> {
  if (exporterFFmpeg && exporterLoadPromise) return exporterLoadPromise;

  exporterFFmpeg = new FFmpeg();
  exporterLoadPromise = (async () => {
    onProgress?.({ stage: 'loading', currentClip: 0, totalClips: 0, message: '正在加载本地切片引擎' });
    const coreURL = await toBlobURL('/ffmpeg/ffmpeg-core.js', 'text/javascript');
    const wasmURL = await toBlobURL('/ffmpeg/ffmpeg-core.wasm', 'application/wasm');
    await exporterFFmpeg!.load({ coreURL, wasmURL }, { signal });
    return exporterFFmpeg!;
  })();

  return exporterLoadPromise;
}

export async function exportVideoClipsLocally(options: {
  videoFile: File;
  clips: Array<{ clip_index: number; title: string; start_time: number; end_time: number }>;
  onProgress?: (progress: LocalClipExportProgress) => void;
  signal?: AbortSignal;
}): Promise<{ blob: Blob; succeeded: number; failed: LocalClipExportFailure[] }> {
  const ffmpeg = await getExporterFFmpeg(options.onProgress, options.signal);
  const clipSpecs = buildLocalClipSpecs(options.clips);
  const archiveEntries: Record<string, Uint8Array> = {};
  const failed: LocalClipExportFailure[] = [];

  await ffmpeg.createDir('/input');
  await ffmpeg.createDir('/output');
  await ffmpeg.mount(FFFSType.WORKERFS, { files: [options.videoFile] }, '/input');

  try {
    for (const [index, clip] of clipSpecs.entries()) {
      options.onProgress?.({
        stage: 'clipping',
        currentClip: index + 1,
        totalClips: clipSpecs.length,
        message: `正在切片 ${index + 1} / ${clipSpecs.length}`,
      });

      try {
        const outputPath = `/output/${clip.outputName}`;
        const exitCode = await ffmpeg.exec([
          '-ss', clip.startTime.toFixed(3),
          '-i', `/input/${options.videoFile.name}`,
          '-t', clip.duration.toFixed(3),
          '-c', 'copy',
          '-avoid_negative_ts', 'make_zero',
          '-y',
          outputPath,
        ], -1, { signal: options.signal });

        if (exitCode !== 0) throw new Error(`ffmpeg exit code ${exitCode}`);
        archiveEntries[clip.outputName] = new Uint8Array(await ffmpeg.readFile(outputPath));
        await ffmpeg.deleteFile(outputPath);
      } catch (error) {
        failed.push({ clipIndex: clip.clipIndex, title: clip.title, reason: String(error) });
      }
    }

    if (Object.keys(archiveEntries).length === 0) {
      throw new Error('所有片段导出失败，未生成可下载文件');
    }

    options.onProgress?.({
      stage: 'zipping',
      currentClip: clipSpecs.length,
      totalClips: clipSpecs.length,
      message: '正在打包 ZIP',
    });

    const zipBytes = zipSync(archiveEntries);
    return {
      blob: new Blob([zipBytes], { type: 'application/zip' }),
      succeeded: clipSpecs.length - failed.length,
      failed,
    };
  } finally {
    try { await ffmpeg.unmount('/input'); } catch {}
    try { await ffmpeg.deleteDir('/output'); } catch {}
    try { await ffmpeg.deleteDir('/input'); } catch {}
  }
}
```

- [ ] **Step 3: 把取消逻辑做完整**

实现要求：

- `AbortController` 中断当前 `exec()` / `readFile()`
- 中断时调用 `ffmpeg.terminate()`
- 终止后清空单例引用，下一次导出可重新 `load()`
- `unmount('/input')`、删除输出目录等清理逻辑放在 `finally`

- [ ] **Step 4: 运行构建确认服务可编译**

Run: `cd frontend && npm run build`

Expected: PASS，TypeScript 和 Vite 构建均成功

- [ ] **Step 5: 提交这一小步**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/services/videoClipExporter.ts
git commit -m "feat: add browser local clip exporter"
```

### Task 4: 替换任务详情页的一键切片弹窗

**Files:**
- Create: `frontend/src/components/LocalClipExportModal.tsx`
- Modify: `frontend/src/pages/TaskDetailPage.tsx`

- [ ] **Step 1: 创建独立弹窗组件**

```tsx
interface LocalClipExportModalProps {
  open: boolean;
  taskFilename: string;
  clips: ClipItemProps[];
  exporting: boolean;
  exportMessage: string;
  progress: LocalClipExportProgress | null;
  onClose: () => void;
  onConfirm: (file: File) => Promise<void>;
  onCancelExport: () => void;
}
```

组件职责：

- 渲染拖拽区和“选择原视频”按钮
- 维护本地 `selectedFile` 状态
- 展示 [videoFileMatch.ts](/Users/lizexi/Documents/AI/Agent/ai-slice/frontend/src/utils/videoFileMatch.ts) 的校验结果
- 导出中显示阶段进度和“取消”按钮

- [ ] **Step 2: 在详情页接入本地导出流程**

把 [TaskDetailPage.tsx](/Users/lizexi/Documents/AI/Agent/ai-slice/frontend/src/pages/TaskDetailPage.tsx) 中这几类逻辑替换掉：

- 删除 `videoPath` 文本输入状态
- 删除对 `exportClips(taskId, videoPath)` 的调用
- 保留 `triggerDownload()` 并改用 `buildClipArchiveName()` 生成 ZIP 文件名
- 新增 `AbortController`、`clipExportProgress`、`clipExportResult` 等状态
- 调用 `exportVideoClipsLocally({ videoFile, clips, onProgress, signal })`

- [ ] **Step 3: 确保其他导出功能不受影响**

在 [TaskDetailPage.tsx](/Users/lizexi/Documents/AI/Agent/ai-slice/frontend/src/pages/TaskDetailPage.tsx) 中只替换“一键切片”按钮与弹窗相关代码，保持这些方法不变：

- `handleExportSrt`
- `handleExportCaptions`
- `handleRetry`
- SSE 任务进度逻辑

- [ ] **Step 4: 运行 lint 和 build**

Run: `cd frontend && npm run lint`

Expected: PASS，无未使用变量、无 Hook 规则错误

Run: `cd frontend && npm run build`

Expected: PASS，详情页与新组件均通过类型检查

- [ ] **Step 5: 提交这一小步**

```bash
git add frontend/src/components/LocalClipExportModal.tsx frontend/src/pages/TaskDetailPage.tsx
git commit -m "feat: switch one-click clipping to local file export"
```

### Task 5: 整体验证

**Files:**
- Test: `frontend/tests/videoFileMatch.test.ts`
- Test: `frontend/tests/localClipExport.test.ts`

- [ ] **Step 1: 跑纯逻辑测试**

Run: `cd frontend && node --test tests/videoFileMatch.test.ts tests/localClipExport.test.ts`

Expected: PASS，所有测试通过

- [ ] **Step 2: 跑前端静态验证**

Run: `cd frontend && npm run lint && npm run build`

Expected: PASS，无 lint / TS / Vite 构建错误

- [ ] **Step 3: 手工验证 macOS Chrome**

验证清单：

- 打开一个已完成任务详情页
- 点击“`一键切片`”
- 选择与任务同名的原视频文件
- 观察阶段进度从“加载引擎”推进到“打包 ZIP”
- 成功下载 `<视频名>_AI切片.zip`
- 再次打开弹窗，选择错误文件名时能看到警告
- 切片中点击“取消”后页面仍可重新开始

- [ ] **Step 4: 手工验证 Windows Chrome**

验证清单与 macOS 一致，重点确认：

- 文件选择器交互正常
- ZIP 文件名正常
- 大文件切片过程中页面不会进入不可恢复状态

- [ ] **Step 5: 记录验证结果**

在最终实现说明中明确写出：

- 哪些验证已实际完成
- 是否已在 Windows Chrome 与 macOS Chrome 都完成手测
- 如果无法做双平台验证，缺口是什么
