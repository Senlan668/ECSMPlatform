package com.shangmei.platform.aibusiness.campaign;

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
import java.util.Base64;
import java.util.List;
import java.util.UUID;

@Component
public class HttpContentCampaignRuntimeGateway implements ContentCampaignRuntimeGateway {
    private final HttpClient httpClient;
    private final String baseUrl;
    private final String controlToken;

    public HttpContentCampaignRuntimeGateway(
            @Value("${platform.runtimes.content-campaign}") String baseUrl,
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
            String subjectUsername,
            String subjectName,
            String traceId,
            String method,
            String path,
            String query,
            String contentType,
            String accept,
            String range,
            byte[] body
    ) {
        HttpRequest.BodyPublisher publisher = body == null || body.length == 0
                ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofByteArray(body);
        HttpRequest.Builder request = baseRequest(
                tenantId, subjectId, subjectUsername, subjectName, traceId, target(path, query), accept
        ).method(method, publisher);
        if (contentType != null && !contentType.isBlank()) request.header("Content-Type", contentType);
        if (range != null && !range.isBlank()) request.header("Range", range);
        return send(request.build());
    }

    @Override
    public RuntimeResponse forwardMultipart(
            String tenantId,
            String subjectId,
            String subjectUsername,
            String subjectName,
            String traceId,
            String method,
            String path,
            String query,
            String accept,
            List<MultipartPart> parts
    ) {
        String boundary = "ShangmeiCampaignBoundary" + UUID.randomUUID().toString().replace("-", "");
        List<HttpRequest.BodyPublisher> publishers = new ArrayList<>();
        for (MultipartPart part : parts) {
            StringBuilder headers = new StringBuilder()
                    .append("--").append(boundary).append("\r\n")
                    .append("Content-Disposition: form-data; name=\"")
                    .append(escapeHeaderParameter(part.name(), "multipart field name"))
                    .append("\"");
            if (part.filename() != null) {
                headers.append("; filename=\"")
                        .append(escapeHeaderParameter(part.filename(), "multipart filename"))
                        .append("\"; filename*=UTF-8''")
                        .append(URLEncoder.encode(part.filename(), StandardCharsets.UTF_8).replace("+", "%20"));
            }
            headers.append("\r\nContent-Type: ")
                    .append(safeContentType(part.contentType(), part.filename() == null))
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
        HttpRequest request = baseRequest(
                tenantId, subjectId, subjectUsername, subjectName, traceId, target(path, query), accept
        ).header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .method(method, HttpRequest.BodyPublishers.concat(
                        publishers.toArray(HttpRequest.BodyPublisher[]::new)
                ))
                .build();
        return send(request);
    }

    private URI target(String path, String query) {
        if (controlToken.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "内容运营运行时控制令牌未配置");
        }
        String suffix = query == null || query.isBlank() ? "" : "?" + query;
        String runtimePath = path.startsWith("/static/") ? path : "/api/v1" + path;
        try {
            return URI.create(baseUrl + runtimePath + suffix);
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "内容运营运行时请求地址无效");
        }
    }

    private HttpRequest.Builder baseRequest(
            String tenantId,
            String subjectId,
            String subjectUsername,
            String subjectName,
            String traceId,
            URI target,
            String accept
    ) {
        String encodedName = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(subjectName.getBytes(StandardCharsets.UTF_8));
        return HttpRequest.newBuilder(target)
                .version(HttpClient.Version.HTTP_1_1)
                .timeout(Duration.ofMinutes(10))
                .header("X-Runtime-Token", controlToken)
                .header("X-Tenant-Id", tenantId)
                .header("X-Subject-Id", subjectId)
                .header("X-Subject-Username", subjectUsername)
                .header("X-Subject-Name", encodedName)
                .header("X-Subject-Name-Encoding", "base64url")
                .header("X-Request-ID", traceId)
                .header("Accept", accept == null || accept.isBlank() ? "application/json" : accept);
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
                    response.headers().firstValue("Content-Disposition").orElse(null),
                    response.headers().firstValueAsLong("Content-Length").isPresent()
                            ? response.headers().firstValueAsLong("Content-Length").getAsLong()
                            : null,
                    response.headers().map()
            );
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "内容运营运行时调用被中断");
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "内容运营运行时不可用");
        }
    }

    private String escapeHeaderParameter(String value, String label) {
        if (value == null || value.isBlank() || value.length() > 512 || value.contains("\r") || value.contains("\n")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, label + " is invalid");
        }
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private String safeContentType(String value, boolean formField) {
        if (value == null || value.isBlank()) {
            return formField ? "text/plain; charset=UTF-8" : "application/octet-stream";
        }
        if (value.length() > 256 || value.contains("\r") || value.contains("\n")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "multipart content type is invalid");
        }
        try {
            return org.springframework.http.MediaType.parseMediaType(value).toString();
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "multipart content type is invalid");
        }
    }
}
