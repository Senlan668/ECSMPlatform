package com.shangmei.platform.aibusiness.governance;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public final class GovernanceModels {
    private GovernanceModels() {
    }

    public record ModelRecord(
            String id,
            String name,
            String provider,
            String modelId,
            String status,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    public record SaveModel(
            @NotBlank @Size(max = 120) String name,
            @NotBlank @Size(max = 120) String provider,
            @NotBlank @Size(max = 200) String modelId
    ) {
    }

    public record ApiKeyRecord(
            String id,
            String name,
            String prefix,
            String lastFour,
            String status,
            Instant createdAt,
            Instant updatedAt,
            Instant lastUsedAt
    ) {
    }

    public record CreateApiKey(@NotBlank @Size(max = 120) String name) {
    }

    public record RenameApiKey(@NotBlank @Size(max = 120) String name) {
    }

    public record CreatedApiKey(ApiKeyRecord apiKey, String secret) {
    }

    public record PromptRecord(
            String id,
            String name,
            String purpose,
            String template,
            int version,
            String status,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    public record SavePrompt(
            @NotBlank @Size(max = 120) String name,
            @NotBlank @Size(max = 120) String purpose,
            @NotBlank @Size(max = 16000) String template
    ) {
    }

    public record ToolRecord(
            String id,
            String name,
            String transport,
            String endpoint,
            String status,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    public record SaveTool(
            @NotBlank @Size(max = 120) String name,
            @NotBlank @Pattern(regexp = "HTTP|MCP") String transport,
            @NotBlank @Size(max = 1000) String endpoint
    ) {
    }

    public record BudgetPolicy(@Min(0) long dailyTokenLimit, @NotBlank @Pattern(regexp = "observe|block") String mode) {
    }
}
