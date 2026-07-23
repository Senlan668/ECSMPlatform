package com.shangmei.platform.aibusiness.asset;

import com.shangmei.platform.aibusiness.asset.AssetModels.AudioExtractionUpdate;
import com.shangmei.platform.aibusiness.asset.AssetModels.ClipExport;
import com.shangmei.platform.aibusiness.asset.AssetModels.ClipSegment;
import com.shangmei.platform.aibusiness.asset.AssetModels.ClipTask;
import com.shangmei.platform.aibusiness.asset.AssetModels.CreateClipTask;
import com.shangmei.platform.aibusiness.asset.AssetModels.Material;
import com.shangmei.platform.aibusiness.asset.AssetModels.RecordClipExport;
import com.shangmei.platform.aibusiness.asset.AssetModels.RenameClipTask;
import com.shangmei.platform.aibusiness.asset.AssetModels.SaveClipSegment;
import com.shangmei.platform.aibusiness.asset.AssetModels.SaveMaterial;
import com.shangmei.platform.aibusiness.asset.LiveClipRuntimeGateway.RuntimeClip;
import com.shangmei.platform.aibusiness.asset.LiveClipRuntimeGateway.RuntimeTask;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class AssetService {
    private static final Map<String, String> NEXT_CLIP_STATUS = Map.of(
            "queued", "transcribing",
            "transcribing", "analyzing",
            "analyzing", "review"
    );

    private static final class TenantAssets {
        private final Map<String, ClipTask> clipTasks = new LinkedHashMap<>();
        private final Map<String, Material> materials = new LinkedHashMap<>();
    }

    private final Map<String, TenantAssets> data = new ConcurrentHashMap<>();

    public List<ClipTask> listClipTasks(String tenantId) {
        TenantAssets state = state(tenantId);
        synchronized (state) {
            return reversed(state.clipTasks.values());
        }
    }

    public ClipTask getClipTask(String tenantId, String taskId) {
        TenantAssets state = state(tenantId);
        synchronized (state) {
            return require(state.clipTasks, taskId, "切片任务不存在");
        }
    }

    public ClipTask createClipTask(String tenantId, CreateClipTask input) {
        TenantAssets state = state(tenantId);
        Instant now = Instant.now();
        ClipTask task = new ClipTask(
                UUID.randomUUID().toString(), input.fileName().trim(), input.fileSize(), input.scene().trim(),
                "queued", "control-plane", null, 0, null,
                "pending", null, null, 0, null, List.of(), null, null, now, now
        );
        synchronized (state) {
            state.clipTasks.put(task.id(), task);
        }
        return task;
    }

    public ClipTask renameClipTask(String tenantId, String taskId, RenameClipTask input) {
        TenantAssets state = state(tenantId);
        synchronized (state) {
            ClipTask current = require(state.clipTasks, taskId, "切片任务不存在");
            ClipTask updated = current.withFileName(input.fileName().trim());
            state.clipTasks.put(taskId, updated);
            return updated;
        }
    }

    public ClipTask advanceClipTask(String tenantId, String taskId) {
        TenantAssets state = state(tenantId);
        synchronized (state) {
            ClipTask current = require(state.clipTasks, taskId, "切片任务不存在");
            if (current.runtimeTaskId() != null) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "运行时任务不能手工推进");
            }
            String nextStatus = NEXT_CLIP_STATUS.get(current.status());
            if (nextStatus == null) throw new ResponseStatusException(HttpStatus.CONFLICT, "当前任务不能继续推进");
            ClipTask updated = current.withRuntime(
                    nextStatus, current.executionMode(), null, current.runtimeProgress(), current.runtimeMessage(),
                    current.segments(), current.error()
            );
            state.clipTasks.put(taskId, updated);
            return updated;
        }
    }

    public ClipTask updateAudioExtraction(String tenantId, String taskId, AudioExtractionUpdate input) {
        TenantAssets state = state(tenantId);
        synchronized (state) {
            ClipTask current = require(state.clipTasks, taskId, "切片任务不存在");
            if (current.runtimeTaskId() != null) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "已派发任务不能替换音频");
            }
            if ("ready".equals(input.status())
                    && (input.audioFileName() == null || input.audioFileName().isBlank() || input.audioFileSize() == null)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "音频就绪时必须登记文件名和大小");
            }
            String audioFileName = "ready".equals(input.status()) ? input.audioFileName().trim() : null;
            Long audioFileSize = "ready".equals(input.status()) ? input.audioFileSize() : null;
            double startOffset = input.videoStartOffset() == null ? 0 : input.videoStartOffset();
            String error = "failed".equals(input.status()) ? normalizedError(input.error()) : null;
            ClipTask updated = current.withAudio(
                    input.status(), audioFileName, audioFileSize, startOffset, input.videoDuration(), error
            );
            state.clipTasks.put(taskId, updated);
            return updated;
        }
    }

    public ClipTask prepareRuntimeDispatch(String tenantId, String taskId, String audioFileName, long audioFileSize) {
        TenantAssets state = state(tenantId);
        synchronized (state) {
            ClipTask current = require(state.clipTasks, taskId, "切片任务不存在");
            if (!"ready".equals(current.audioStatus())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "请先完成本地音频提取");
            }
            if (current.runtimeTaskId() != null) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "任务已经派发到运行时");
            }
            if (!current.audioFileName().equals(audioFileName) || current.audioFileSize() != audioFileSize) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "上传音频与已登记结果不一致");
            }
            ClipTask updated = current.withRuntime(
                    "transcribing", "live-clip-runtime", null, 0, "正在上传音频到 AI 运行时",
                    current.segments(), null
            );
            state.clipTasks.put(taskId, updated);
            return updated;
        }
    }

    public ClipTask prepareVideoRuntimeDispatch(String tenantId, String taskId, String fileName, long fileSize) {
        TenantAssets state = state(tenantId);
        synchronized (state) {
            ClipTask current = require(state.clipTasks, taskId, "切片任务不存在");
            if (current.runtimeTaskId() != null) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "任务已经派发到运行时");
            }
            if (!current.fileName().equals(fileName) || current.fileSize() != fileSize) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "上传视频与已登记源文件不一致");
            }
            ClipTask updated = current.withRuntime(
                    "transcribing", "live-clip-runtime-video-fallback", null, 0,
                    "正在上传完整视频到 AI 运行时", current.segments(), null
            );
            state.clipTasks.put(taskId, updated);
            return updated;
        }
    }

    public ClipTask failRuntimeDispatch(String tenantId, String taskId, String error) {
        TenantAssets state = state(tenantId);
        synchronized (state) {
            ClipTask current = require(state.clipTasks, taskId, "切片任务不存在");
            ClipTask updated = current.withRuntime(
                    "queued", "control-plane", null, 0, null, current.segments(), normalizedRuntimeError(error)
            );
            state.clipTasks.put(taskId, updated);
            return updated;
        }
    }

    public ClipTask applyRuntimeSnapshot(String tenantId, String taskId, RuntimeTask runtimeTask) {
        TenantAssets state = state(tenantId);
        synchronized (state) {
            ClipTask current = require(state.clipTasks, taskId, "切片任务不存在");
            if (current.runtimeTaskId() != null && !current.runtimeTaskId().equals(runtimeTask.id())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "运行时任务映射不一致");
            }
            String status = platformStatus(runtimeTask.status());
            List<ClipSegment> segments = mergeRuntimeSegments(current.segments(), runtimeTask.clips());
            String error = "failed".equals(status) ? normalizedRuntimeError(runtimeTask.errorMessage()) : null;
            ClipTask updated = current.withRuntime(
                    status, "live-clip-runtime", runtimeTask.id(), runtimeTask.progress(),
                    runtimeTask.progressMessage(), segments, error
            );
            state.clipTasks.put(taskId, updated);
            return updated;
        }
    }

    public ClipTask addSegment(String tenantId, String taskId, SaveClipSegment input) {
        TenantAssets state = state(tenantId);
        synchronized (state) {
            ClipTask current = require(state.clipTasks, taskId, "切片任务不存在");
            validateSegment(current, input.startTime(), input.endTime());
            if (current.segments().size() >= 100) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "单个任务最多保留 100 个片段");
            }
            List<ClipSegment> segments = new ArrayList<>(current.segments());
            segments.add(new ClipSegment(
                    UUID.randomUUID().toString(), segments.size() + 1, "manual", null, input.title().trim(),
                    "", "人工片段", input.startTime(), input.endTime(), null, "", List.of(), Map.of(), Instant.now()
            ));
            ClipTask updated = current.withSegments(List.copyOf(segments), current.lastExport());
            state.clipTasks.put(taskId, updated);
            return updated;
        }
    }

    public ClipTask deleteSegment(String tenantId, String taskId, String segmentId) {
        TenantAssets state = state(tenantId);
        synchronized (state) {
            ClipTask current = require(state.clipTasks, taskId, "切片任务不存在");
            List<ClipSegment> remaining = current.segments().stream()
                    .filter(segment -> !segment.id().equals(segmentId))
                    .toList();
            if (remaining.size() == current.segments().size()) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "片段不存在");
            }
            ClipTask updated = current.withSegments(reindex(remaining), null);
            state.clipTasks.put(taskId, updated);
            return updated;
        }
    }

    public String runtimeClipId(String tenantId, String taskId, String segmentId) {
        TenantAssets state = state(tenantId);
        synchronized (state) {
            ClipTask current = require(state.clipTasks, taskId, "切片任务不存在");
            ClipSegment segment = current.segments().stream()
                    .filter(candidate -> candidate.id().equals(segmentId))
                    .findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "片段不存在"));
            if (!"ai".equals(segment.source()) || segment.runtimeClipId() == null) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "人工片段不支持运行时增强");
            }
            return segment.runtimeClipId();
        }
    }

    public ClipTask applyViralTitles(String tenantId, String taskId, String segmentId, List<String> titles) {
        return updateRuntimeSegment(
                tenantId, taskId, segmentId,
                segment -> segment.withViralTitles(titles == null ? List.of() : titles)
        );
    }

    public ClipTask applyEditingGuide(
            String tenantId,
            String taskId,
            String segmentId,
            Map<String, Object> guide
    ) {
        return updateRuntimeSegment(
                tenantId, taskId, segmentId,
                segment -> segment.withEditingGuide(guide == null ? Map.of() : guide)
        );
    }

    public ClipTask recordExport(String tenantId, String taskId, RecordClipExport input) {
        TenantAssets state = state(tenantId);
        synchronized (state) {
            ClipTask current = require(state.clipTasks, taskId, "切片任务不存在");
            if (current.segments().isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT, "没有可导出的片段");
            if (input.succeeded() + input.failed() != current.segments().size()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "导出结果数量与片段数量不一致");
            }
            ClipTask updated = current.withExport(new ClipExport(input.succeeded(), input.failed(), Instant.now()));
            state.clipTasks.put(taskId, updated);
            return updated;
        }
    }

    public void deleteClipTask(String tenantId, String taskId) {
        TenantAssets state = state(tenantId);
        synchronized (state) {
            if (state.clipTasks.remove(taskId) == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "切片任务不存在");
            }
        }
    }

    public List<Material> listMaterials(String tenantId) {
        TenantAssets state = state(tenantId);
        synchronized (state) {
            return reversed(state.materials.values());
        }
    }

    public Material createMaterial(String tenantId, SaveMaterial input) {
        TenantAssets state = state(tenantId);
        Instant now = Instant.now();
        Material material = new Material(
                UUID.randomUUID().toString(), input.name().trim(), input.kind().trim(), input.purpose().trim(),
                "draft", now, now
        );
        synchronized (state) {
            state.materials.put(material.id(), material);
        }
        return material;
    }

    public Material confirmMaterial(String tenantId, String materialId) {
        TenantAssets state = state(tenantId);
        synchronized (state) {
            Material current = require(state.materials, materialId, "素材不存在");
            Material updated = new Material(
                    current.id(), current.name(), current.kind(), current.purpose(), "ready", current.createdAt(), Instant.now()
            );
            state.materials.put(materialId, updated);
            return updated;
        }
    }

    public void deleteMaterial(String tenantId, String materialId) {
        TenantAssets state = state(tenantId);
        synchronized (state) {
            if (state.materials.remove(materialId) == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "素材不存在");
            }
        }
    }

    public Map<String, Long> stats(String tenantId) {
        TenantAssets state = state(tenantId);
        synchronized (state) {
            return Map.of(
                    "clipTasks", (long) state.clipTasks.size(),
                    "reviewedClips", state.clipTasks.values().stream().filter(task -> "review".equals(task.status())).count(),
                    "materials", (long) state.materials.size()
            );
        }
    }

    private List<ClipSegment> mergeRuntimeSegments(List<ClipSegment> existing, List<RuntimeClip> runtimeClips) {
        if (runtimeClips == null || runtimeClips.isEmpty()) return existing;
        List<ClipSegment> merged = new ArrayList<>(existing.stream()
                .filter(segment -> "manual".equals(segment.source()))
                .toList());
        for (RuntimeClip clip : runtimeClips) {
            merged.add(new ClipSegment(
                    "ai:" + clip.id(), merged.size() + 1, "ai", clip.id(), clip.title(), clip.summary(),
                    clip.clipType(), clip.startTime(), clip.endTime(), clip.viralityScore(), clip.suggestedCaption(),
                    clip.viralTitles(), clip.editingGuide(), Instant.now()
            ));
        }
        return reindex(merged);
    }

    private ClipTask updateRuntimeSegment(
            String tenantId,
            String taskId,
            String segmentId,
            java.util.function.UnaryOperator<ClipSegment> updater
    ) {
        TenantAssets state = state(tenantId);
        synchronized (state) {
            ClipTask current = require(state.clipTasks, taskId, "切片任务不存在");
            boolean found = false;
            List<ClipSegment> segments = new ArrayList<>();
            for (ClipSegment segment : current.segments()) {
                if (segment.id().equals(segmentId)) {
                    if (!"ai".equals(segment.source()) || segment.runtimeClipId() == null) {
                        throw new ResponseStatusException(HttpStatus.CONFLICT, "人工片段不支持运行时增强");
                    }
                    segments.add(updater.apply(segment));
                    found = true;
                } else {
                    segments.add(segment);
                }
            }
            if (!found) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "片段不存在");
            ClipTask updated = current.withSegments(List.copyOf(segments), current.lastExport());
            state.clipTasks.put(taskId, updated);
            return updated;
        }
    }

    private List<ClipSegment> reindex(List<ClipSegment> segments) {
        List<ClipSegment> result = new ArrayList<>();
        for (int index = 0; index < segments.size(); index++) result.add(segments.get(index).withIndex(index + 1));
        return List.copyOf(result);
    }

    private String platformStatus(String runtimeStatus) {
        return switch (runtimeStatus) {
            case "pending", "downloading", "transcribing" -> "transcribing";
            case "analyzing", "clipping", "uploading" -> "analyzing";
            case "done" -> "review";
            case "failed" -> "failed";
            default -> "transcribing";
        };
    }

    private void validateSegment(ClipTask task, double startTime, double endTime) {
        if (endTime <= startTime) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "片段结束时间必须晚于开始时间");
        }
        if (task.videoDuration() != null && endTime > task.videoDuration() + 0.01) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "片段结束时间超出视频时长");
        }
    }

    private TenantAssets state(String tenantId) {
        return data.computeIfAbsent(tenantId, ignored -> new TenantAssets());
    }

    private <T> T require(Map<String, T> source, String id, String detail) {
        T value = source.get(id);
        if (value == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, detail);
        return value;
    }

    private <T> List<T> reversed(Iterable<T> values) {
        List<T> result = new ArrayList<>();
        values.forEach(result::add);
        Collections.reverse(result);
        return List.copyOf(result);
    }

    private String normalizedError(String error) {
        return error == null || error.isBlank() ? "浏览器本地音频提取失败" : error.trim();
    }

    private String normalizedRuntimeError(String error) {
        return error == null || error.isBlank() ? "Live Clip 运行时处理失败" : error.trim();
    }
}
