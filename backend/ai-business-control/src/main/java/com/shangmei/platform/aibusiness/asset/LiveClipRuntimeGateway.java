package com.shangmei.platform.aibusiness.asset;

import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

public interface LiveClipRuntimeGateway {
    record DispatchMetadata(
            String videoFileName,
            String scene,
            double videoStartOffset,
            Double videoDuration
    ) {
    }

    record RuntimeClip(
            String id,
            int clipIndex,
            String title,
            String summary,
            String clipType,
            double startTime,
            double endTime,
            int viralityScore,
            String suggestedCaption,
            List<String> viralTitles,
            Map<String, Object> editingGuide
    ) {
    }

    record RuntimeTask(
            String id,
            String status,
            int progress,
            String progressMessage,
            String errorMessage,
            List<RuntimeClip> clips
    ) {
    }

    RuntimeTask dispatch(MultipartFile audio, DispatchMetadata metadata);

    RuntimeTask dispatchVideo(MultipartFile video, DispatchMetadata metadata);

    RuntimeTask getTask(String runtimeTaskId);

    RuntimeTask retryTask(String runtimeTaskId);

    RuntimeTask renameTask(String runtimeTaskId, String fileName);

    List<String> generateViralTitles(String runtimeClipId);

    Map<String, Object> generateEditingGuide(String runtimeClipId);

    void deleteTask(String runtimeTaskId);
}
