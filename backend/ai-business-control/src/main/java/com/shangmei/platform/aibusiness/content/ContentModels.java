package com.shangmei.platform.aibusiness.content;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class ContentModels {
    private ContentModels() {
    }

    public record ContentBrief(
            String id,
            String title,
            String product,
            String goal,
            String channel,
            String tone,
            String status,
            List<String> topics,
            String selectedTopic,
            String draft,
            String executionMode,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    public record CreateBrief(
            @NotBlank @Size(max = 160) String title,
            @NotBlank @Size(max = 160) String product,
            @NotBlank @Size(max = 160) String goal,
            @NotBlank @Size(max = 80) String channel,
            @NotBlank @Size(max = 120) String tone
    ) {
    }

    public record SelectTopic(@NotBlank @Size(max = 300) String topic) {
    }

    public record ReviewDecision(@Pattern(regexp = "approved|rejected") String decision) {
    }

    public record CalendarEvent(
            String id,
            String briefId,
            String title,
            String channel,
            LocalDate date,
            String status,
            Instant createdAt
    ) {
    }

    public record CreateCalendarEvent(@NotBlank String briefId, LocalDate date) {
    }

    public record MediaIntent(
            String id,
            String briefId,
            String title,
            String kind,
            String status,
            String dependency,
            Instant createdAt
    ) {
    }

    public record CreateMediaIntent(
            @NotBlank String briefId,
            @Pattern(regexp = "海报|短视频|平台适配") String kind
    ) {
    }
}
