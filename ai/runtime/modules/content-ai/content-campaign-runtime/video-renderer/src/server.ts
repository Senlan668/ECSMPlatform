import crypto from "crypto";
import express from "express";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

import {
  executeRender,
  getTask,
  setTask,
  type RenderRequest,
  type RenderTask,
} from "./render-video";

const app = express();
const PORT = Number(process.env.REMOTION_PORT || 3100);
const CONTROL_TOKEN = process.env.RUNTIME_CONTROL_TOKEN || "";
const DATA_ROOT = process.env.CONTENT_CAMPAIGN_DATA_DIR
  ? path.resolve(process.env.CONTENT_CAMPAIGN_DATA_DIR)
  : path.resolve(__dirname, "..", "..", ".runtime", "content-campaign");
const ALLOWED_COMPOSITIONS = new Set(["KnowledgeVideo", "DataVizVideo"]);

app.use(express.json({ limit: "100mb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "remotion-renderer",
    runtimeAuthConfigured: Boolean(CONTROL_TOKEN),
    uptime: process.uptime(),
  });
});

app.use((req, res, next) => {
  if (!CONTROL_TOKEN) {
    res.status(503).json({ code: "RUNTIME_NOT_CONFIGURED", detail: "Runtime control token is not configured" });
    return;
  }
  const supplied = req.header("X-Runtime-Token") || "";
  const expectedBuffer = Buffer.from(CONTROL_TOKEN, "utf8");
  const suppliedBuffer = Buffer.from(supplied, "utf8");
  if (expectedBuffer.length !== suppliedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    res.status(401).json({ code: "RUNTIME_AUTHENTICATION_REQUIRED", detail: "Runtime authentication failed" });
    return;
  }
  const tenantId = (req.header("X-Tenant-Id") || "").trim();
  if (!tenantId || tenantId.length > 128 || /[\u0000-\u001f\u007f]/.test(tenantId)) {
    res.status(400).json({ code: "INVALID_RUNTIME_CONTEXT", detail: "Tenant context is invalid" });
    return;
  }
  next();
});

app.post("/render", (req, res) => {
  const request = req.body as RenderRequest;
  if (!request || !ALLOWED_COMPOSITIONS.has(request.compositionId) || !request.inputProps) {
    res.status(400).json({ error: "Invalid compositionId or inputProps" });
    return;
  }
  if (!validDimension(request.width) || !validDimension(request.height)) {
    res.status(400).json({ error: "Invalid render dimensions" });
    return;
  }

  const tenantHash = requestTenantHash(req);
  const outputDir = path.join(DATA_ROOT, "tenants", tenantHash, "static", "videos");
  fs.mkdirSync(outputDir, { recursive: true });

  const taskId = uuidv4();
  const task: RenderTask = {
    taskId,
    tenantHash,
    status: "queued",
    progress: 0,
    startedAt: Date.now(),
  };
  setTask(tenantHash, taskId, task);
  executeRender(taskId, tenantHash, request, outputDir).catch((error) => {
    console.error(`[Server] Render error for ${taskId}:`, error);
  });
  res.json({ taskId, status: "queued" });
});

app.get("/status/:taskId", (req, res) => {
  const task = getTask(requestTenantHash(req), req.params.taskId);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json({
    taskId: task.taskId,
    status: task.status,
    progress: task.progress,
    error: task.error,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
  });
});

app.get("/download/:taskId", (req, res) => {
  const task = getTask(requestTenantHash(req), req.params.taskId);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (task.status !== "completed" || !task.outputPath) {
    res.status(400).json({ error: "Render not completed", status: task.status, progress: task.progress });
    return;
  }
  if (!fs.existsSync(task.outputPath)) {
    res.status(404).json({ error: "Output file not found" });
    return;
  }
  res.download(task.outputPath, `video_${req.params.taskId}.mp4`);
});

function requestTenantHash(req: express.Request): string {
  return crypto.createHash("sha256").update(req.header("X-Tenant-Id") || "", "utf8").digest("hex").slice(0, 32);
}

function validDimension(value: number | undefined): boolean {
  return value === undefined || (Number.isInteger(value) && value >= 320 && value <= 4096);
}

app.listen(PORT, () => {
  console.log(`Remotion renderer listening on ${PORT}`);
});
