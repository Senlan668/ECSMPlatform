package com.shangmei.platform.aibusiness.knowledge;

import com.shangmei.platform.aibusiness.identity.IdentityModels.TenantPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Part;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import org.springframework.web.multipart.MultipartHttpServletRequest;

import java.io.IOException;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import static com.shangmei.platform.aibusiness.identity.TenantAuthenticationFilter.PRINCIPAL_ATTRIBUTE;

@RestController
@RequestMapping("/api/v1/sales-knowledge")
public class SalesKnowledgeProxyController {
    private static final String PUBLIC_PREFIX = "/api/v1/sales-knowledge";
    private static final Set<String> ALLOWED_MODULES = Set.of(
            "admin", "chats", "custom", "export", "extractor", "filter", "knowledge",
            "labeling", "materials", "quiz", "runtime", "search", "students"
    );
    private static final Set<String> ALLOWED_METHODS = Set.of("GET", "POST", "PUT", "DELETE", "PATCH");
    private static final Set<String> FORWARDED_HEADERS = Set.of(
            "x-tos-key", "x-total-examples", "x-total-rows", "x-total-tags",
            "x-format", "x-knowledge-items"
    );

    private final SalesKnowledgeRuntimeGateway runtime;

    public SalesKnowledgeProxyController(SalesKnowledgeRuntimeGateway runtime) {
        this.runtime = runtime;
    }

    @RequestMapping("/**")
    public ResponseEntity<StreamingResponseBody> forward(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            HttpServletRequest request,
            @RequestBody(required = false) byte[] body
    ) {
        String path = runtimePath(request.getRequestURI());
        String method = request.getMethod().toUpperCase(Locale.ROOT);
        if (!ALLOWED_METHODS.contains(method)) {
            throw new ResponseStatusException(HttpStatusCode.valueOf(405), "请求方法不受支持");
        }
        String query = request.getQueryString();
        if (query != null && (query.length() > 4096 || query.contains("\r") || query.contains("\n"))) {
            throw new ResponseStatusException(HttpStatusCode.valueOf(400), "查询参数无效");
        }

        SalesKnowledgeRuntimeGateway.RuntimeResponse response;
        if (request.getContentType() != null && request.getContentType().toLowerCase(Locale.ROOT).startsWith("multipart/")) {
            response = runtime.forwardMultipart(
                    principal.tenantId(), method, path, query, request.getHeader(HttpHeaders.ACCEPT), multipartParts(request)
            );
        } else {
            response = runtime.forward(
                    principal.tenantId(), method, path, query, request.getContentType(),
                    request.getHeader(HttpHeaders.ACCEPT), body
            );
        }
        HttpHeaders headers = responseHeaders(response);
        StreamingResponseBody stream = output -> {
            try (var input = response.body()) {
                input.transferTo(output);
            }
        };
        return new ResponseEntity<>(stream, headers, HttpStatusCode.valueOf(response.statusCode()));
    }

    private String runtimePath(String requestUri) {
        int marker = requestUri.indexOf(PUBLIC_PREFIX);
        if (marker < 0) throw new ResponseStatusException(HttpStatusCode.valueOf(400), "运行时路径无效");
        String path = requestUri.substring(marker + PUBLIC_PREFIX.length());
        if (!path.startsWith("/") || path.length() > 2048 || path.contains("..") || path.contains("\\")) {
            throw new ResponseStatusException(HttpStatusCode.valueOf(400), "运行时路径无效");
        }
        String module = path.substring(1).split("/", 2)[0];
        if (!ALLOWED_MODULES.contains(module)) {
            throw new ResponseStatusException(HttpStatusCode.valueOf(404), "销售知识能力不存在");
        }
        return path;
    }

    private HttpHeaders responseHeaders(SalesKnowledgeRuntimeGateway.RuntimeResponse response) {
        HttpHeaders headers = new HttpHeaders();
        try {
            headers.setContentType(MediaType.parseMediaType(response.contentType()));
        } catch (IllegalArgumentException exception) {
            headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
        }
        if (response.contentLength() != null && response.contentLength() >= 0) {
            headers.setContentLength(response.contentLength());
        }
        String disposition = safeHeader(response.contentDisposition());
        if (disposition != null) headers.set(HttpHeaders.CONTENT_DISPOSITION, disposition);
        response.headers().forEach((name, values) -> {
            if (!FORWARDED_HEADERS.contains(name.toLowerCase(Locale.ROOT)) || values.isEmpty()) return;
            String value = safeHeader(values.getFirst());
            if (value != null) headers.set(name, value);
        });
        return headers;
    }

    private String safeHeader(String value) {
        if (value == null || value.isBlank() || value.contains("\r") || value.contains("\n")) return null;
        return value.length() > 1000 ? value.substring(0, 1000) : value;
    }

    private List<SalesKnowledgeRuntimeGateway.MultipartPart> multipartParts(HttpServletRequest request) {
        try {
            List<SalesKnowledgeRuntimeGateway.MultipartPart> parts = new ArrayList<>();
            for (Part part : request.getParts()) {
                parts.add(new SalesKnowledgeRuntimeGateway.MultipartPart(
                        part.getName(), part.getSubmittedFileName(), part.getContentType(), part.getSize(), part::getInputStream
                ));
            }
            if (parts.isEmpty() && request instanceof MultipartHttpServletRequest multipart) {
                multipart.getMultiFileMap().forEach((name, files) -> files.forEach(file -> parts.add(
                        new SalesKnowledgeRuntimeGateway.MultipartPart(
                                name, file.getOriginalFilename(), file.getContentType(), file.getSize(), file::getInputStream
                        )
                )));
                multipart.getParameterMap().forEach((name, values) -> {
                    for (String value : values) {
                        byte[] content = value.getBytes(StandardCharsets.UTF_8);
                        parts.add(new SalesKnowledgeRuntimeGateway.MultipartPart(
                                name, null, "text/plain; charset=UTF-8", content.length, () -> new ByteArrayInputStream(content)
                        ));
                    }
                });
            }
            return parts;
        } catch (IOException | ServletException exception) {
            throw new ResponseStatusException(HttpStatusCode.valueOf(400), "multipart 请求解析失败");
        }
    }
}
