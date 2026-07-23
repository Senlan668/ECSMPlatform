package com.shangmei.platform.aibusiness.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shangmei.platform.aibusiness.runtime.RuntimeModels.RuntimeHealth;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

@Service
public class RuntimeRegistryService {
    private record RuntimeDescriptor(
            String id,
            String name,
            String kind,
            String baseUrl,
            String healthPath,
            List<String> capabilities
    ) {
    }

    private final Map<String, RuntimeDescriptor> runtimes;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public RuntimeRegistryService(
            ObjectMapper objectMapper,
            @Value("${platform.runtimes.live-clip}") String liveClipUrl,
            @Value("${platform.runtimes.sales-knowledge}") String salesKnowledgeUrl,
            @Value("${platform.runtimes.voice}") String voiceUrl,
            @Value("${platform.runtimes.content-campaign}") String contentCampaignUrl,
            @Value("${platform.runtimes.shared-ai-services}") String sharedAiServicesUrl
    ) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(1))
                .build();
        Map<String, RuntimeDescriptor> configured = new LinkedHashMap<>();
        add(configured, new RuntimeDescriptor(
                "live-clip", "直播切片运行时", "Python / FFmpeg", trimSlash(liveClipUrl), "/api/health",
                List.of("音视频上传", "ASR", "片段规划", "标题与剪辑指南", "切片任务")
        ));
        add(configured, new RuntimeDescriptor(
                "sales-knowledge", "销售知识运行时", "Python / FastAPI", trimSlash(salesKnowledgeUrl), "/health",
                List.of("微信 ETL", "数据清洗与标注", "素材与学员", "知识检索", "RAG", "销售考核", "训练数据导出")
        ));
        add(configured, new RuntimeDescriptor(
                "voice", "实时语音运行时", "Python / RTC", trimSlash(voiceUrl), "/health",
                List.of("动态 RTC Token", "语音会话启停", "ASR 回调", "RAG", "流式 LLM", "TTS")
        ));
        add(configured, new RuntimeDescriptor(
                "content-campaign", "内容营销运行时", "Python / LangGraph", trimSlash(contentCampaignUrl), "/health",
                List.of("内容工作流", "品牌与模板", "日历", "海报", "视频", "平台适配", "作品库")
        ));
        add(configured, new RuntimeDescriptor(
                "shared-ai-services", "共享 AI 服务集群", "Python / MCP", trimSlash(sharedAiServicesUrl), "/api/health",
                List.of("LLM 网关", "RAG 服务", "共享记忆", "Prompt Hub", "认证", "配额", "Trace")
        ));
        this.runtimes = Map.copyOf(configured);
    }

    public List<RuntimeHealth> checkAll() {
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<RuntimeHealth>> futures = runtimes.values().stream()
                    .map(runtime -> executor.submit(() -> check(runtime)))
                    .toList();
            List<RuntimeHealth> result = new ArrayList<>();
            for (Future<RuntimeHealth> future : futures) {
                try {
                    result.add(future.get());
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("运行时探活被中断", exception);
                } catch (ExecutionException exception) {
                    throw new IllegalStateException("运行时探活失败", exception.getCause());
                }
            }
            return List.copyOf(result);
        }
    }

    private RuntimeHealth check(RuntimeDescriptor runtime) {
        Instant startedAt = Instant.now();
        long startNanos = System.nanoTime();
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(runtime.baseUrl() + runtime.healthPath()))
                    .GET()
                    .timeout(Duration.ofSeconds(2))
                    .header("Accept", "application/json")
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            long latency = elapsedMillis(startNanos);
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return health(runtime, "degraded", latency, "HTTP " + response.statusCode(), startedAt);
            }
            JsonNode body = objectMapper.readTree(response.body());
            String upstreamStatus = body.path("status").asText("unknown");
            String status = List.of("ok", "healthy", "running").contains(upstreamStatus) ? "online" : "degraded";
            return health(runtime, status, latency, "upstream=" + upstreamStatus, startedAt);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return health(runtime, "offline", elapsedMillis(startNanos), "探活被中断", startedAt);
        } catch (Exception exception) {
            return health(runtime, "offline", elapsedMillis(startNanos), safeException(exception), startedAt);
        }
    }

    private RuntimeHealth health(
            RuntimeDescriptor runtime,
            String status,
            long latency,
            String detail,
            Instant checkedAt
    ) {
        return new RuntimeHealth(
                runtime.id(), runtime.name(), runtime.kind(), runtime.baseUrl(), status, latency, detail,
                runtime.capabilities(), checkedAt
        );
    }

    private long elapsedMillis(long startNanos) {
        return Duration.ofNanos(System.nanoTime() - startNanos).toMillis();
    }

    private String safeException(Exception exception) {
        String name = exception.getClass().getSimpleName();
        return name.isBlank() ? "连接失败" : name;
    }

    private void add(Map<String, RuntimeDescriptor> target, RuntimeDescriptor descriptor) {
        target.put(descriptor.id(), descriptor);
    }

    private String trimSlash(String value) {
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }
}
