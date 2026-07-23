package com.shangmei.platform.aibusiness.sharedai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

@Component
public class HttpSharedAiServicesGateway implements SharedAiServicesGateway {
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String baseUrl;
    private final String controlToken;

    public HttpSharedAiServicesGateway(
            ObjectMapper objectMapper,
            @Value("${platform.runtimes.shared-ai-services}") String baseUrl,
            @Value("${platform.runtimes.control-token:}") String controlToken
    ) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(3))
                .build();
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.controlToken = controlToken;
    }

    @Override
    public JsonNode health(String tenantId, String subjectId, String traceId) {
        return get(tenantId, subjectId, traceId, "/api/health", "共享 AI 服务健康检查失败");
    }

    @Override
    public JsonNode listTools(String tenantId, String subjectId, String traceId, String service) {
        ObjectNode payload = objectMapper.createObjectNode().put("service", service);
        return post(tenantId, subjectId, traceId, "/api/tool/list", payload, "MCP 工具发现失败");
    }

    @Override
    public JsonNode callTool(
            String tenantId,
            String subjectId,
            String traceId,
            String service,
            String tool,
            JsonNode arguments
    ) {
        ObjectNode payload = objectMapper.createObjectNode()
                .put("service", service)
                .put("tool", tool)
                .set("arguments", safeArguments(arguments));
        return post(tenantId, subjectId, traceId, "/api/tool/call", payload, "MCP 工具调用失败");
    }

    @Override
    public JsonNode listPrompts(String tenantId, String subjectId, String traceId, String service) {
        String encoded = URLEncoder.encode(service, StandardCharsets.UTF_8).replace("+", "%20");
        return get(
                tenantId,
                subjectId,
                traceId,
                "/api/prompt/list?service=" + encoded,
                "MCP Prompt 发现失败"
        );
    }

    @Override
    public JsonNode renderPrompt(
            String tenantId,
            String subjectId,
            String traceId,
            String service,
            String prompt,
            JsonNode arguments
    ) {
        ObjectNode payload = objectMapper.createObjectNode()
                .put("service", service)
                .put("prompt", prompt)
                .set("arguments", safeArguments(arguments));
        return post(tenantId, subjectId, traceId, "/api/prompt/get", payload, "MCP Prompt 渲染失败");
    }

    @Override
    public JsonNode quota(String tenantId, String subjectId, String traceId) {
        return get(tenantId, subjectId, traceId, "/api/quota/usage", "MCP 配额查询失败");
    }

    @Override
    public JsonNode agentChat(
            String tenantId,
            String subjectId,
            String traceId,
            String agent,
            String message,
            String sessionId,
            String style
    ) {
        ObjectNode payload = objectMapper.createObjectNode().put("message", message).put("style", style);
        if (sessionId != null && !sessionId.isBlank()) payload.put("session_id", sessionId);
        return post(
                tenantId, subjectId, traceId, "/api/agents/" + agent + "/chat", payload,
                "Agent 工作流调用失败"
        );
    }

    @Override
    public JsonNode clearAgentSession(
            String tenantId, String subjectId, String traceId, String agent, String sessionId
    ) {
        ObjectNode payload = objectMapper.createObjectNode().put("session_id", sessionId);
        return post(
                tenantId, subjectId, traceId, "/api/agents/" + agent + "/clear", payload,
                "Agent 会话清理失败"
        );
    }

    @Override
    public JsonNode agentProfile(String tenantId, String subjectId, String traceId, String agent) {
        return post(
                tenantId, subjectId, traceId, "/api/agents/" + agent + "/profile",
                objectMapper.createObjectNode(), "Agent 用户画像读取失败"
        );
    }

    private JsonNode get(String tenantId, String subjectId, String traceId, String path, String operation) {
        HttpRequest request = request(tenantId, subjectId, traceId, path)
                .GET()
                .build();
        return send(request, operation);
    }

    private JsonNode post(
            String tenantId,
            String subjectId,
            String traceId,
            String path,
            JsonNode body,
            String operation
    ) {
        HttpRequest request = request(tenantId, subjectId, traceId, path)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(toJson(body), StandardCharsets.UTF_8))
                .build();
        return send(request, operation);
    }

    private HttpRequest.Builder request(String tenantId, String subjectId, String traceId, String path) {
        if (controlToken.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "共享 AI 服务控制令牌未配置");
        }
        try {
            return HttpRequest.newBuilder(URI.create(baseUrl + path))
                    .version(HttpClient.Version.HTTP_1_1)
                    .timeout(Duration.ofSeconds(45))
                    .header("Accept", "application/json")
                    .header("X-Runtime-Token", controlToken)
                    .header("X-Tenant-Id", tenantId)
                    .header("X-Subject-Id", subjectId)
                    .header("X-Request-ID", traceId);
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "共享 AI 服务请求地址无效");
        }
    }

    private JsonNode send(HttpRequest request, String operation) {
        try {
            HttpResponse<String> response = httpClient.send(
                    request,
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
            );
            JsonNode payload = response.body().isBlank()
                    ? objectMapper.createObjectNode()
                    : objectMapper.readTree(response.body());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ResponseStatusException(mappedStatus(response.statusCode()), operation + "：" + errorDetail(payload));
            }
            return payload;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, operation + "：调用被中断");
        } catch (IOException | IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, operation + "：共享 AI 服务不可用");
        }
    }

    private HttpStatus mappedStatus(int statusCode) {
        return switch (statusCode) {
            case 400, 422 -> HttpStatus.BAD_REQUEST;
            case 404 -> HttpStatus.NOT_FOUND;
            case 409 -> HttpStatus.CONFLICT;
            case 429 -> HttpStatus.TOO_MANY_REQUESTS;
            default -> HttpStatus.SERVICE_UNAVAILABLE;
        };
    }

    private JsonNode safeArguments(JsonNode arguments) {
        return arguments == null || arguments.isNull() ? objectMapper.createObjectNode() : arguments.deepCopy();
    }

    private String errorDetail(JsonNode payload) {
        String value = payload.path("error").asText(payload.path("detail").asText("上游服务拒绝了请求"));
        value = value.replaceAll("[\\r\\n]+", " ").trim();
        return value.length() > 300 ? value.substring(0, 300) : value;
    }

    private String toJson(JsonNode node) {
        try {
            return objectMapper.writeValueAsString(node);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("无法序列化共享 AI 服务请求", exception);
        }
    }
}
