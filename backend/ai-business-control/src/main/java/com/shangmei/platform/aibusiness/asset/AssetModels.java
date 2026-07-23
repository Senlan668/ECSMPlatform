package com.shangmei.platform.aibusiness.asset;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class AssetModels {
    private AssetModels() {
    }

    public record ClipTask(
            String id,
            String fileName,
            long fileSize,
            String scene,
            String status,
            String executionMode,
            String runtimeTaskId,
            int runtimeProgress,
            String runtimeMessage,
            String audioStatus,
            String audioFileName,
            Long audioFileSize,
            double videoStartOffset,
            Double videoDuration,
            List<ClipSegment> segments,
            ClipExport lastExport,
            String error,
            Instant createdAt,
            Instant updatedAt
    ) {
        ClipTask withAudio(
                String nextAudioStatus,
                String nextAudioFileName,
                Long nextAudioFileSize,
                double nextVideoStartOffset,
                Double nextVideoDuration,
                String nextError
        ) {
            return new ClipTask(
                    id, fileName, fileSize, scene, status, executionMode, runtimeTaskId,
                    runtimeProgress, runtimeMessage, nextAudioStatus, nextAudioFileName, nextAudioFileSize,
                    nextVideoStartOffset, nextVideoDuration, segments, lastExport, nextError, createdAt, Instant.now()
            );
        }

        ClipTask withRuntime(
                String nextStatus,
                String nextExecutionMode,
                String nextRuntimeTaskId,
                int nextRuntimeProgress,
                String nextRuntimeMessage,
                List<ClipSegment> nextSegments,
                String nextError
        ) {
            return new ClipTask(
                    id, fileName, fileSize, scene, nextStatus, nextExecutionMode, nextRuntimeTaskId,
                    nextRuntimeProgress, nextRuntimeMessage, audioStatus, audioFileName, audioFileSize,
                    videoStartOffset, videoDuration, nextSegments, lastExport, nextError, createdAt, Instant.now()
            );
        }

        ClipTask withSegments(List<ClipSegment> nextSegments, ClipExport nextLastExport) {
            return new ClipTask(
                    id, fileName, fileSize, scene, status, executionMode, runtimeTaskId,
                    runtimeProgress, runtimeMessage, audioStatus, audioFileName, audioFileSize,
                    videoStartOffset, videoDuration, nextSegments, nextLastExport, error, createdAt, Instant.now()
            );
        }

        ClipTask withExport(ClipExport nextLastExport) {
            return withSegments(segments, nextLastExport);
        }

        ClipTask withFileName(String nextFileName) {
            return new ClipTask(
                    id, nextFileName, fileSize, scene, status, executionMode, runtimeTaskId,
                    runtimeProgress, runtimeMessage, audioStatus, audioFileName, audioFileSize,
                    videoStartOffset, videoDuration, segments, lastExport, error, createdAt, Instant.now()
            );
        }
    }

    public record AudioExtractionUpdate(
            @NotBlank @Pattern(regexp = "processing|ready|cancelled|failed") String status,
            @Size(max = 255) String audioFileName,
            @Min(0) Long audioFileSize,
            @DecimalMin("0.0") Double videoStartOffset,
            @DecimalMin("0.0") Double videoDuration,
            @Size(max = 500) String error
    ) {
    }

    public record ClipSegment(
            String id,
            int clipIndex,
            String source,
            String runtimeClipId,
            String title,
            String summary,
            String clipType,
            double startTime,
            double endTime,
            Integer viralityScore,
            String suggestedCaption,
            List<String> viralTitles,
            Map<String, Object> editingGuide,
            Instant createdAt
    ) {
        ClipSegment withIndex(int nextIndex) {
            return new ClipSegment(
                    id, nextIndex, source, runtimeClipId, title, summary, clipType, startTime, endTime,
                    viralityScore, suggestedCaption, viralTitles, editingGuide, createdAt
            );
        }

        ClipSegment withViralTitles(List<String> nextViralTitles) {
            return new ClipSegment(
                    id, clipIndex, source, runtimeClipId, title, summary, clipType, startTime, endTime,
                    viralityScore, suggestedCaption, List.copyOf(nextViralTitles), editingGuide, createdAt
            );
        }

        ClipSegment withEditingGuide(Map<String, Object> nextEditingGuide) {
            return new ClipSegment(
                    id, clipIndex, source, runtimeClipId, title, summary, clipType, startTime, endTime,
                    viralityScore, suggestedCaption, viralTitles, Map.copyOf(nextEditingGuide), createdAt
            );
        }
    }

    public record SaveClipSegment(
            @NotBlank @Size(max = 120) String title,
            @NotNull @DecimalMin("0.0") Double startTime,
            @NotNull @DecimalMin(value = "0.0", inclusive = false) Double endTime
    ) {
    }

    public record RecordClipExport(
            @Min(1) int succeeded,
            @Min(0) int failed
    ) {
    }

    public record ClipExport(int succeeded, int failed, Instant createdAt) {
    }

    public record CreateClipTask(
            @NotBlank @Size(max = 255) String fileName,
            @Min(0) long fileSize,
            @NotBlank @Size(max = 80) String scene
    ) {
    }

    public record RenameClipTask(
            @NotBlank @Size(max = 255) String fileName
    ) {
    }

    public record Material(
            String id,
            String name,
            String kind,
            String purpose,
            String status,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    public record SaveMaterial(
            @NotBlank @Size(max = 160) String name,
            @NotBlank @Size(max = 80) String kind,
            @NotBlank @Size(max = 80) String purpose
    ) {
    }
}
