package com.shangmei.platform.aibusiness.agent;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Component
public class HttpAgentRuntimeGateway implements AgentRuntimeGateway {
    private final HttpClient httpClient;
    private final String baseUrl;
    private final String controlToken;

    public HttpAgentRuntimeGateway(
            @Value("${platform.runtimes.dodo-agent}") String baseUrl,
            @Value("${platform.runtimes.control-token:}") String controlToken
    ) {
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(3))
                .build();
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.controlToken = controlToken;
    }

    @Override
    public RuntimeResponse forward(
            String tenantId,
            String subjectId,
            String method,
            String path,
            String query,
            String contentType,
            String accept,
            byte[] body
    ) {
        HttpRequest.BodyPublisher publisher = body == null || body.length == 0
                ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofByteArray(body);
        HttpRequest.Builder request = baseRequest(tenantId, subjectId, target(path, query), accept)
                .method(method, publisher);
        if (contentType != null && !contentType.isBlank()) request.header("Content-Type", contentType);
        return send(request.build());
    }

    @Override
    public RuntimeResponse forwardMultipart(
            String tenantId,
            String subjectId,
            String path,
            String accept,
            List<MultipartPart> parts
    ) {
        String boundary = "AgentBoundary" + UUID.randomUUID().toString().replace("-", "");
        List<HttpRequest.BodyPublisher> publishers = new ArrayList<>();
        for (MultipartPart part : parts) {
            StringBuilder headers = new StringBuilder()
                    .append("--").append(boundary).append("\r\n")
                    .append("Content-Disposition: form-data; name=\"")
                    .append(escapeParameter(part.name()))
                    .append("\"");
            if (part.filename() != null) {
                headers.append("; filename=\"").append(escapeParameter(part.filename())).append("\"")
                        .append("; filename*=UTF-8''")
                        .append(URLEncoder.encode(part.filename(), StandardCharsets.UTF_8).replace("+", "%20"));
            }
            headers.append("\r\nContent-Type: ")
                    .append(safeContentType(part.contentType()))
                    .append("\r\n\r\n");
            publishers.add(HttpRequest.BodyPublishers.ofByteArray(headers.toString().getBytes(StandardCharsets.UTF_8)));
            publishers.add(HttpRequest.BodyPublishers.ofInputStream(() -> {
                try {
                    return part.source().open();
                } catch (IOException exception) {
                    throw new UncheckedIOException(exception);
                }
            }));
            publishers.add(HttpRequest.BodyPublishers.ofByteArray("\r\n".getBytes(StandardCharsets.US_ASCII)));
        }
        publishers.add(HttpRequest.BodyPublishers.ofByteArray(
                ("--" + boundary + "--\r\n").getBytes(StandardCharsets.US_ASCII)
        ));
        HttpRequest request = baseRequest(tenantId, subjectId, target(path, null), accept)
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.concat(publishers.toArray(HttpRequest.BodyPublisher[]::new)))
                .build();
        return send(request);
    }

    private HttpRequest.Builder baseRequest(String tenantId, String subjectId, URI target, String accept) {
        if (controlToken.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Agent 运行时控制令牌未配置");
        }
        return HttpRequest.newBuilder(target)
                .version(HttpClient.Version.HTTP_1_1)
                .timeout(Duration.ofMinutes(10))
                .header("X-Runtime-Token", controlToken)
                .header("X-Tenant-Id", tenantId)
                .header("X-Subject-Id", subjectId)
                .header("Accept", accept == null || accept.isBlank() ? "application/json" : accept);
    }

    private URI target(String path, String query) {
        String suffix = query == null || query.isBlank() ? "" : "?" + query;
        try {
            return URI.create(baseUrl + path + suffix);
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Agent 运行时请求地址无效");
        }
    }

    private RuntimeResponse send(HttpRequest request) {
        try {
            HttpResponse<java.io.InputStream> response = httpClient.send(
                    request,
                    HttpResponse.BodyHandlers.ofInputStream()
            );
            return new RuntimeResponse(
                    response.statusCode(),
                    response.body(),
                    response.headers().firstValue("Content-Type").orElse("application/json"),
                    response.headers().firstValueAsLong("Content-Length").isPresent()
                            ? response.headers().firstValueAsLong("Content-Length").getAsLong()
                            : null,
                    response.headers().map()
            );
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Agent 运行时调用被中断");
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Agent 运行时不可用");
        }
    }

    private String escapeParameter(String value) {
        if (value == null || value.isBlank() || value.length() > 512 || value.contains("\r") || value.contains("\n")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "multipart 参数无效");
        }
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private String safeContentType(String value) {
        if (value == null || value.isBlank()) return "application/octet-stream";
        if (value.length() > 256 || value.contains("\r") || value.contains("\n")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "multipart Content-Type 无效");
        }
        return value;
    }
}
