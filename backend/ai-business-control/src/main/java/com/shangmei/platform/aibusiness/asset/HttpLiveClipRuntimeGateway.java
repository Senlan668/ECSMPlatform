package com.shangmei.platform.aibusiness.asset;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.shangmei.platform.aibusiness.asset.LiveClipRuntimeGateway.DispatchMetadata;
import com.shangmei.platform.aibusiness.asset.LiveClipRuntimeGateway.RuntimeClip;
import com.shangmei.platform.aibusiness.asset.LiveClipRuntimeGateway.RuntimeTask;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
public class HttpLiveClipRuntimeGateway implements LiveClipRuntimeGateway {
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String baseUrl;
    private final String controlToken;

    public HttpLiveClipRuntimeGateway(
            ObjectMapper objectMapper,
            @Value("${platform.runtimes.live-clip}") String baseUrl,
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
    public RuntimeTask dispatch(MultipartFile audio, DispatchMetadata metadata) {
        requireConfigured();
        JsonNode upload = upload(audio, "/api/upload/audio", "audio.mp3", "audio/mpeg", "音频上传失败");
        String audioPath = upload.path("audio_path").asText("");
        if (audioPath.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "运行时没有返回音频引用");
        }
        return createTask(audioPath, metadata);
    }

    @Override
    public RuntimeTask dispatchVideo(MultipartFile video, DispatchMetadata metadata) {
        requireConfigured();
        JsonNode upload = upload(
                video, "/api/upload/video", "source-video.bin", "application/octet-stream", "视频上传失败"
        );
        String videoPath = upload.path("video_path").asText("");
        if (videoPath.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "运行时没有返回视频引用");
        }
        return createTask(videoPath, metadata);
    }

    private JsonNode upload(
            MultipartFile file,
            String path,
            String wireFilename,
            String contentType,
            String operation
    ) {
        String boundary = "ShangmeiBoundary" + UUID.randomUUID().toString().replace("-", "");
        byte[] prefix = ("--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"file\"; filename=\"" + wireFilename + "\"\r\n"
                + "Content-Type: " + contentType + "\r\n\r\n").getBytes(StandardCharsets.UTF_8);
        byte[] suffix = ("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8);
        HttpRequest.BodyPublisher multipart = HttpRequest.BodyPublishers.concat(
                HttpRequest.BodyPublishers.ofByteArray(prefix),
                HttpRequest.BodyPublishers.ofInputStream(() -> {
                    try {
                        return file.getInputStream();
                    } catch (IOException exception) {
                        throw new UncheckedIOException(exception);
                    }
                }),
                HttpRequest.BodyPublishers.ofByteArray(suffix)
        );

        HttpRequest uploadRequest = request(path)
                .timeout(Duration.ofMinutes(10))
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(multipart)
                .build();
        JsonNode upload = send(uploadRequest, operation);
        if (upload.path("size_bytes").asLong(-1) != file.getSize()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "运行时接收的文件大小不一致");
        }
        return upload;
    }

    private RuntimeTask createTask(String sourcePath, DispatchMetadata metadata) {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("video_path", sourcePath);
        payload.put("video_filename", metadata.videoFileName());
        payload.put("video_start_offset", metadata.videoStartOffset());
        if (metadata.videoDuration() == null) payload.putNull("video_duration");
        else payload.put("video_duration", metadata.videoDuration());
        payload.put("scene_mode", sceneMode(metadata.scene()));

        HttpRequest createRequest = request("/api/tasks")
                .timeout(Duration.ofSeconds(20))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(toJson(payload)))
                .build();
        return parseTask(send(createRequest, "切片任务创建失败"));
    }

    @Override
    public RuntimeTask getTask(String runtimeTaskId) {
        requireConfigured();
        HttpRequest request = request("/api/tasks/" + runtimeTaskId)
                .timeout(Duration.ofSeconds(10))
                .GET()
                .build();
        return parseTask(send(request, "切片任务查询失败"));
    }

    @Override
    public RuntimeTask retryTask(String runtimeTaskId) {
        requireConfigured();
        HttpRequest request = request("/api/tasks/" + runtimeTaskId + "/retry")
                .timeout(Duration.ofSeconds(10))
                .POST(HttpRequest.BodyPublishers.noBody())
                .build();
        return parseTask(send(request, "切片任务重试失败"));
    }

    @Override
    public RuntimeTask renameTask(String runtimeTaskId, String fileName) {
        requireConfigured();
        ObjectNode payload = objectMapper.createObjectNode().put("video_filename", fileName);
        HttpRequest request = request("/api/tasks/" + runtimeTaskId + "/rename")
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json")
                .method("PATCH", HttpRequest.BodyPublishers.ofString(toJson(payload), StandardCharsets.UTF_8))
                .build();
        return parseTask(send(request, "切片任务重命名失败"));
    }

    @Override
    public List<String> generateViralTitles(String runtimeClipId) {
        requireConfigured();
        HttpRequest request = request("/api/clips/" + runtimeClipId + "/viral-titles")
                .timeout(Duration.ofSeconds(45))
                .POST(HttpRequest.BodyPublishers.noBody())
                .build();
        return stringList(send(request, "爆款标题生成失败").path("viral_titles"));
    }

    @Override
    public Map<String, Object> generateEditingGuide(String runtimeClipId) {
        requireConfigured();
        HttpRequest request = request("/api/clips/" + runtimeClipId + "/editing-guide")
                .timeout(Duration.ofSeconds(45))
                .POST(HttpRequest.BodyPublishers.noBody())
                .build();
        return objectMap(send(request, "剪辑指南生成失败").path("editing_guide"));
    }

    @Override
    public void deleteTask(String runtimeTaskId) {
        requireConfigured();
        HttpRequest request = request("/api/tasks/" + runtimeTaskId)
                .timeout(Duration.ofSeconds(20))
                .DELETE()
                .build();
        send(request, "切片任务删除失败");
    }

    private HttpRequest.Builder request(String path) {
        return HttpRequest.newBuilder(URI.create(baseUrl + path))
                .header("Accept", "application/json")
                .header("X-Runtime-Token", controlToken);
    }

    private JsonNode send(HttpRequest request, String operation) {
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                String detail = safeDetail(response.body());
                HttpStatus status = response.statusCode() == 401 || response.statusCode() == 403
                        ? HttpStatus.BAD_GATEWAY
                        : HttpStatus.SERVICE_UNAVAILABLE;
                throw new ResponseStatusException(status, operation + "：" + detail);
            }
            return response.body().isBlank() ? objectMapper.createObjectNode() : objectMapper.readTree(response.body());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, operation + "：调用被中断");
        } catch (IOException | IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, operation + "：运行时不可用");
        }
    }

    private RuntimeTask parseTask(JsonNode node) {
        String id = node.path("id").asText("");
        if (id.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "运行时任务响应缺少 ID");
        List<RuntimeClip> clips = new ArrayList<>();
        for (JsonNode clip : node.path("clips")) {
            clips.add(new RuntimeClip(
                    clip.path("id").asText(),
                    clip.path("clip_index").asInt(clips.size() + 1),
                    clip.path("title").asText("未命名片段"),
                    clip.path("summary").asText(""),
                    clip.path("clip_type").asText("未分类"),
                    clip.path("start_time").asDouble(),
                    clip.path("end_time").asDouble(),
                    clip.path("virality_score").asInt(),
                    clip.path("suggested_caption").asText(""),
                    stringList(clip.path("viral_titles")),
                    objectMap(clip.path("editing_guide"))
            ));
        }
        return new RuntimeTask(
                id,
                node.path("status").asText("unknown"),
                node.path("progress").asInt(),
                node.path("progress_message").asText(""),
                nullableText(node.path("error_message")),
                List.copyOf(clips)
        );
    }

    private List<String> stringList(JsonNode node) {
        if (!node.isArray()) return List.of();
        List<String> result = new ArrayList<>();
        node.forEach(value -> result.add(value.asText()));
        return List.copyOf(result);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> objectMap(JsonNode node) {
        if (!node.isObject()) return Map.of();
        return objectMapper.convertValue(node, Map.class);
    }

    private String nullableText(JsonNode node) {
        return node.isMissingNode() || node.isNull() ? null : node.asText();
    }

    private String safeDetail(String responseBody) {
        try {
            String detail = objectMapper.readTree(responseBody).path("detail").asText("运行时拒绝了请求");
            return detail.length() > 300 ? detail.substring(0, 300) : detail;
        } catch (Exception ignored) {
            return "运行时拒绝了请求";
        }
    }

    private String sceneMode(String scene) {
        return switch (scene) {
            case "访谈播客" -> "interview";
            case "知识分享", "课程精华" -> "lecture";
            default -> "livestream";
        };
    }

    private String toJson(JsonNode node) {
        try {
            return objectMapper.writeValueAsString(node);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("无法序列化运行时请求", exception);
        }
    }

    private void requireConfigured() {
        if (controlToken.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Live Clip 运行时控制令牌未配置");
        }
    }
}
