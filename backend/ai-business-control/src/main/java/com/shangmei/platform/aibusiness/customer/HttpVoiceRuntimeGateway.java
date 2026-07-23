package com.shangmei.platform.aibusiness.customer;

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
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

@Component
public class HttpVoiceRuntimeGateway implements VoiceRuntimeGateway {
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String baseUrl;
    private final String controlToken;

    public HttpVoiceRuntimeGateway(
            ObjectMapper objectMapper,
            @Value("${platform.runtimes.voice}") String baseUrl,
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
    public RtcAccess issueAccess(String roomId, String userId) {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("room_id", roomId);
        payload.put("user_id", userId);
        JsonNode response = post("/getScenes", payload, "RTC 凭证签发失败");
        JsonNode scene = response.path("Result").path("scenes").path(0);
        JsonNode rtc = scene.path("rtc");
        String appId = rtc.path("AppId").asText("");
        String token = rtc.path("Token").asText("");
        if (appId.isBlank() || token.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Voice 运行时没有返回有效 RTC 凭证");
        }
        return new RtcAccess(
                appId,
                rtc.path("RoomId").asText(roomId),
                rtc.path("UserId").asText(userId),
                token,
                scene.path("scene").path("botName").asText("AiAgent"),
                scene.path("scene").path("isInterruptMode").asBoolean(true)
        );
    }

    @Override
    public void startAgent(String roomId, String userId, String runtimeSessionId) {
        controlAgent("StartVoiceChat", roomId, userId, runtimeSessionId, "语音智能体启动失败");
    }

    @Override
    public void stopAgent(String roomId, String userId, String runtimeSessionId) {
        controlAgent("StopVoiceChat", roomId, userId, runtimeSessionId, "语音智能体停止失败");
    }

    private void controlAgent(String action, String roomId, String userId, String taskId, String operation) {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("RoomId", roomId);
        payload.put("UserId", userId);
        payload.put("TaskId", taskId);
        JsonNode response = post("/proxy?Action=" + action + "&Version=2024-12-01", payload, operation);
        JsonNode error = response.path("ResponseMetadata").path("Error");
        if (!error.isMissingNode() && !error.isNull()) {
            String message = error.path("Message").asText(operation);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, operation + "：" + safeText(message));
        }
    }

    private JsonNode post(String path, JsonNode payload, String operation) {
        requireConfigured();
        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + path))
                .version(HttpClient.Version.HTTP_1_1)
                .timeout(Duration.ofSeconds(40))
                .header("Accept", "application/json")
                .header("Content-Type", "application/json")
                .header("X-Runtime-Token", controlToken)
                .POST(HttpRequest.BodyPublishers.ofString(toJson(payload), StandardCharsets.UTF_8))
                .build();
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ResponseStatusException(
                        HttpStatus.SERVICE_UNAVAILABLE,
                        operation + "：" + responseDetail(response.body())
                );
            }
            return objectMapper.readTree(response.body());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, operation + "：调用被中断");
        } catch (IOException | IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, operation + "：Voice 运行时不可用");
        }
    }

    private String responseDetail(String body) {
        try {
            JsonNode detail = objectMapper.readTree(body).path("detail");
            if (detail.isTextual()) return safeText(detail.asText());
            if (!detail.isMissingNode() && !detail.isNull()) return safeText(detail.toString());
        } catch (Exception ignored) {
            // Fall through to a stable non-sensitive message.
        }
        return "Voice 运行时拒绝了请求";
    }

    private String safeText(String value) {
        String normalized = value == null ? "" : value.replaceAll("[\\r\\n]+", " ").trim();
        return normalized.length() > 300 ? normalized.substring(0, 300) : normalized;
    }

    private String toJson(JsonNode payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("无法序列化 Voice 运行时请求", exception);
        }
    }

    private void requireConfigured() {
        if (controlToken.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Voice 运行时控制令牌未配置");
        }
    }
}
