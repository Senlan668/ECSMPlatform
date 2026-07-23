/**
 * Remotion 视频渲染逻辑封装
 * 
 * 将 Remotion Composition 打包并渲染为 MP4 文件
 */
import path from "path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

/** 渲染任务状态 */
export interface RenderTask {
  taskId: string;
  tenantHash: string;
  status: "queued" | "bundling" | "rendering" | "completed" | "failed";
  progress: number; // 0-100
  outputPath?: string;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

/** 渲染请求参数 */
export interface RenderRequest {
  compositionId: string;
  inputProps: Record<string, unknown>;
  outputFormat?: "mp4";
  codec?: "h264";
  width?: number;
  height?: number;
}

// 内存中的任务存储（Phase 0 简化版，生产环境应使用 Redis）
const tasks = new Map<string, RenderTask>();

function taskKey(tenantHash: string, taskId: string): string {
  return `${tenantHash}:${taskId}`;
}

/**
 * 获取任务状态
 */
export function getTask(tenantHash: string, taskId: string): RenderTask | undefined {
  return tasks.get(taskKey(tenantHash, taskId));
}

/**
 * 设置任务
 */
export function setTask(tenantHash: string, taskId: string, task: RenderTask): void {
  tasks.set(taskKey(tenantHash, taskId), task);
}

/**
 * 执行渲染（异步，不阻塞请求）
 */
export async function executeRender(
  taskId: string,
  tenantHash: string,
  request: RenderRequest,
  outputDir: string
): Promise<void> {
  const key = taskKey(tenantHash, taskId);
  const task = tasks.get(key);
  if (!task) return;

  try {
    // 1. 打包 Remotion 项目
    task.status = "bundling";
    task.progress = 10;
    tasks.set(key, { ...task });

    const entryPoint = path.resolve(__dirname, "Root.tsx");
    const bundleLocation = await bundle({
      entryPoint,
      // 关闭 webpack 缓存以避免内存问题
      webpackOverride: (config) => config,
    });

    task.progress = 30;
    tasks.set(key, { ...task });

    // 2. 选择 Composition（支持动态尺寸覆盖）
    const compositionOverrides: Record<string, unknown> = {};
    if (request.width) compositionOverrides.width = request.width;
    if (request.height) compositionOverrides.height = request.height;

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: request.compositionId,
      inputProps: request.inputProps,
      ...compositionOverrides,
    });

    // 3. 渲染视频
    task.status = "rendering";
    task.progress = 40;
    tasks.set(key, { ...task });

    const outputPath = path.join(outputDir, `${taskId}.mp4`);

    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: (request.codec as "h264") || "h264",
      outputLocation: outputPath,
      inputProps: request.inputProps,
      onProgress: ({ progress }) => {
        // progress 是 0~1 之间的数
        task.progress = Math.round(40 + progress * 55); // 40% ~ 95%
        tasks.set(key, { ...task });
      },
    });

    // 4. 完成
    task.status = "completed";
    task.progress = 100;
    task.outputPath = outputPath;
    task.completedAt = Date.now();
    tasks.set(key, { ...task });

    console.log(`[Render] Task ${taskId} completed: ${outputPath}`);
  } catch (error: any) {
    task.status = "failed";
    task.error = error.message || String(error);
    task.completedAt = Date.now();
    tasks.set(key, { ...task });
    console.error(`[Render] Task ${taskId} failed:`, error.message);
  }
}
