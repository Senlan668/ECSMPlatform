package com.shangmei.platform.aibusiness.asset;

import com.shangmei.platform.aibusiness.asset.AssetModels.ClipTask;
import com.shangmei.platform.aibusiness.asset.AssetModels.RenameClipTask;
import com.shangmei.platform.aibusiness.asset.LiveClipRuntimeGateway.DispatchMetadata;
import com.shangmei.platform.aibusiness.asset.LiveClipRuntimeGateway.RuntimeTask;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AssetRuntimeService {
    private final AssetService assets;
    private final LiveClipRuntimeGateway runtime;

    public AssetRuntimeService(AssetService assets, LiveClipRuntimeGateway runtime) {
        this.assets = assets;
        this.runtime = runtime;
    }

    public ClipTask dispatch(String tenantId, String taskId, MultipartFile audio) {
        String filename = audio.getOriginalFilename() == null ? "" : audio.getOriginalFilename();
        ClipTask prepared = assets.prepareRuntimeDispatch(tenantId, taskId, filename, audio.getSize());
        try {
            RuntimeTask runtimeTask = runtime.dispatch(audio, new DispatchMetadata(
                    prepared.fileName(), prepared.scene(), prepared.videoStartOffset(), prepared.videoDuration()
            ));
            return assets.applyRuntimeSnapshot(tenantId, taskId, runtimeTask);
        } catch (ResponseStatusException exception) {
            assets.failRuntimeDispatch(tenantId, taskId, exception.getReason());
            throw exception;
        } catch (RuntimeException exception) {
            assets.failRuntimeDispatch(tenantId, taskId, "Live Clip 运行时调用失败");
            throw exception;
        }
    }

    public ClipTask dispatchVideo(String tenantId, String taskId, MultipartFile video) {
        String filename = video.getOriginalFilename() == null ? "" : video.getOriginalFilename();
        ClipTask prepared = assets.prepareVideoRuntimeDispatch(tenantId, taskId, filename, video.getSize());
        try {
            RuntimeTask runtimeTask = runtime.dispatchVideo(video, new DispatchMetadata(
                    prepared.fileName(), prepared.scene(), 0, prepared.videoDuration()
            ));
            return assets.applyRuntimeSnapshot(tenantId, taskId, runtimeTask);
        } catch (ResponseStatusException exception) {
            assets.failRuntimeDispatch(tenantId, taskId, exception.getReason());
            throw exception;
        } catch (RuntimeException exception) {
            assets.failRuntimeDispatch(tenantId, taskId, "Live Clip 视频兜底派发失败");
            throw exception;
        }
    }

    public ClipTask rename(String tenantId, String taskId, RenameClipTask input) {
        ClipTask current = assets.getClipTask(tenantId, taskId);
        if (current.runtimeTaskId() != null) {
            runtime.renameTask(current.runtimeTaskId(), input.fileName().trim());
        }
        return assets.renameClipTask(tenantId, taskId, input);
    }

    public ClipTask refresh(String tenantId, String taskId) {
        ClipTask task = assets.getClipTask(tenantId, taskId);
        if (task.runtimeTaskId() == null) return task;
        return assets.applyRuntimeSnapshot(tenantId, taskId, runtime.getTask(task.runtimeTaskId()));
    }

    public ClipTask retry(String tenantId, String taskId) {
        ClipTask task = assets.getClipTask(tenantId, taskId);
        if (task.runtimeTaskId() == null) return task;
        return assets.applyRuntimeSnapshot(tenantId, taskId, runtime.retryTask(task.runtimeTaskId()));
    }

    public ClipTask generateViralTitles(String tenantId, String taskId, String segmentId) {
        String runtimeClipId = assets.runtimeClipId(tenantId, taskId, segmentId);
        return assets.applyViralTitles(
                tenantId, taskId, segmentId, runtime.generateViralTitles(runtimeClipId)
        );
    }

    public ClipTask generateEditingGuide(String tenantId, String taskId, String segmentId) {
        String runtimeClipId = assets.runtimeClipId(tenantId, taskId, segmentId);
        return assets.applyEditingGuide(
                tenantId, taskId, segmentId, runtime.generateEditingGuide(runtimeClipId)
        );
    }

    public void delete(String tenantId, String taskId) {
        ClipTask task = assets.getClipTask(tenantId, taskId);
        if (task.runtimeTaskId() != null) runtime.deleteTask(task.runtimeTaskId());
        assets.deleteClipTask(tenantId, taskId);
    }
}
