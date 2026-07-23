package com.shangmei.platform.aibusiness.sharedai;

import com.fasterxml.jackson.databind.JsonNode;

public interface SharedAiServicesGateway {
    JsonNode health(String tenantId, String subjectId, String traceId);

    JsonNode listTools(String tenantId, String subjectId, String traceId, String service);

    JsonNode callTool(
            String tenantId,
            String subjectId,
            String traceId,
            String service,
            String tool,
            JsonNode arguments
    );

    JsonNode listPrompts(String tenantId, String subjectId, String traceId, String service);

    JsonNode renderPrompt(
            String tenantId,
            String subjectId,
            String traceId,
            String service,
            String prompt,
            JsonNode arguments
    );

    JsonNode quota(String tenantId, String subjectId, String traceId);

    JsonNode agentChat(
            String tenantId, String subjectId, String traceId, String agent,
            String message, String sessionId, String style
    );

    JsonNode clearAgentSession(String tenantId, String subjectId, String traceId, String agent, String sessionId);

    JsonNode agentProfile(String tenantId, String subjectId, String traceId, String agent);
}
