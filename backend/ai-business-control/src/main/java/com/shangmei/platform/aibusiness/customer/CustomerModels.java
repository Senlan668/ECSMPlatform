package com.shangmei.platform.aibusiness.customer;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

public final class CustomerModels {
    private CustomerModels() {
    }

    public record KnowledgeRelease(
            String id,
            String name,
            String source,
            String purpose,
            String status,
            String indexStatus,
            Instant createdAt,
            Instant publishedAt
    ) {
    }

    public record CreateKnowledgeRelease(
            @NotBlank @Size(max = 160) String name,
            @NotBlank @Size(max = 80) String source,
            @NotBlank @Size(max = 80) String purpose
    ) {
    }

    public record ConversationMessage(String id, String role, String content, Instant createdAt) {
    }

    public record Conversation(
            String id,
            String customer,
            String status,
            List<ConversationMessage> messages,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    public record AppendMessage(
            @NotBlank @Pattern(regexp = "customer|operator") String role,
            @NotBlank @Size(max = 4000) String content
    ) {
    }

    public record ConversationAction(@NotBlank @Pattern(regexp = "handoff|close") String action) {
    }

    public record VoiceSession(
            String id,
            String roomId,
            String userId,
            String status,
            String providerStatus,
            String runtimeSessionId,
            int interruptCount,
            String error,
            List<VoiceTranscript> transcripts,
            Instant consentConfirmedAt,
            Instant createdAt,
            Instant closedAt
    ) {
    }

    public record RtcCredential(
            String appId,
            String roomId,
            String userId,
            String token,
            Instant expiresAt
    ) {
    }

    public record VoiceSessionAccess(
            VoiceSession session,
            RtcCredential rtc,
            String agentUserId,
            boolean interruptSupported
    ) {
    }

    public record VoiceTranscript(
            String id,
            String role,
            String content,
            boolean interrupted,
            Instant createdAt
    ) {
    }

    public record AppendVoiceTranscript(
            @NotBlank @Pattern(regexp = "customer|agent") String role,
            @NotBlank @Size(max = 8000) String content,
            boolean interrupted
    ) {
    }

    public record Assessment(
            String id,
            String title,
            String releaseId,
            String question,
            String referenceAnswer,
            String answer,
            String status,
            Integer aiScore,
            Integer humanScore,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    public record CreateAssessment(
            @NotBlank @Size(max = 160) String title,
            String releaseId,
            @NotBlank @Size(max = 2000) String question,
            @NotBlank @Size(max = 4000) String referenceAnswer
    ) {
    }

    public record SubmitAssessment(@NotBlank @Size(max = 8000) String answer) {
    }

    public record ReviewAssessment(@Min(0) @Max(100) int humanScore) {
    }
}
