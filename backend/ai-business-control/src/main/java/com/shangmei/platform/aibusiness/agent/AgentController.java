package com.shangmei.platform.aibusiness.agent;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shangmei.platform.aibusiness.identity.IdentityModels.TenantPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

import static com.shangmei.platform.aibusiness.identity.TenantAuthenticationFilter.PRINCIPAL_ATTRIBUTE;

@RestController
@RequestMapping("/api/v1/agent")
public class AgentController {
    private static final Pattern CONVERSATION_ID = Pattern.compile("[A-Za-z0-9_-]{1,80}");
    private static final Pattern FILE_ID = Pattern.compile("[A-Za-z0-9_-]{1,160}");
    private static final Set<String> MODES = Set.of("chat", "file", "pptx", "deep");

    private final AgentRuntimeGateway runtime;
    private final ObjectMapper objectMapper;

    public AgentController(AgentRuntimeGateway runtime, ObjectMapper objectMapper) {
        this.runtime = runtime;
        this.objectMapper = objectMapper;
    }

    public record SendMessageRequest(
            @NotBlank @Size(max = 12000) String message,
            @NotBlank @Size(max = 16) String mode,
            @Size(max = 160) String fileId
    ) {
    }

    @GetMapping("/health")
    public ResponseEntity<StreamingResponseBody> health(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal
    ) {
        return response(runtime.forward(
                principal.tenantId(), principal.user().id(), "GET", "/api/health",
                null, null, MediaType.APPLICATION_JSON_VALUE, null
        ));
    }

    @PostMapping(value = "/conversations/{conversationId}/messages/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<StreamingResponseBody> stream(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String conversationId,
            @Valid @RequestBody SendMessageRequest request
    ) {
        String mode = request.mode().toLowerCase(Locale.ROOT);
        if (!MODES.contains(mode)) {
            throw new ResponseStatusException(HttpStatusCode.valueOf(400), "Agent 模式无效");
        }
        if ("file".equals(mode) && (request.fileId() == null || !FILE_ID.matcher(request.fileId()).matches())) {
            throw new ResponseStatusException(HttpStatusCode.valueOf(400), "文件问答需要有效的文件 ID");
        }

        String path = switch (mode) {
            case "file" -> "/agent/file/stream";
            case "pptx" -> "/agent/pptx/stream";
            case "deep" -> "/agent/deep/stream";
            default -> "/agent/chat/stream";
        };
        byte[] body = runtimeRequestBody(
                request.message(), runtimeConversationId(principal, conversationId), request.fileId()
        );

        return response(runtime.forward(
                principal.tenantId(), principal.user().id(), "POST", path, null,
                MediaType.APPLICATION_JSON_VALUE, MediaType.TEXT_EVENT_STREAM_VALUE, body
        ));
    }

    @PostMapping("/conversations/{conversationId}/stop")
    public ResponseEntity<StreamingResponseBody> stop(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String conversationId
    ) {
        String query = "conversationId=" + encode(runtimeConversationId(principal, conversationId));
        return response(runtime.forward(
                principal.tenantId(), principal.user().id(), "GET", "/agent/stop", query,
                null, MediaType.APPLICATION_JSON_VALUE, null
        ));
    }

    @DeleteMapping("/conversations/{conversationId}")
    public ResponseEntity<StreamingResponseBody> deleteConversation(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String conversationId
    ) {
        String path = "/session/" + encode(runtimeConversationId(principal, conversationId));
        return response(runtime.forward(
                principal.tenantId(), principal.user().id(), "DELETE", path, null,
                null, MediaType.APPLICATION_JSON_VALUE, null
        ));
    }

    @PostMapping(value = "/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<StreamingResponseBody> uploadFile(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @RequestParam("file") MultipartFile file
    ) {
        if (file.isEmpty() || file.getSize() > 50L * 1024 * 1024) {
            throw new ResponseStatusException(HttpStatusCode.valueOf(400), "文件为空或超过 50 MB 限制");
        }
        var part = new AgentRuntimeGateway.MultipartPart(
                "file", file.getOriginalFilename(), file.getContentType(), file.getSize(), file::getInputStream
        );
        return response(runtime.forwardMultipart(
                principal.tenantId(), principal.user().id(), "/file/upload",
                MediaType.APPLICATION_JSON_VALUE, List.of(part)
        ));
    }

    private String runtimeConversationId(TenantPrincipal principal, String conversationId) {
        if (!CONVERSATION_ID.matcher(conversationId).matches()) {
            throw new ResponseStatusException(HttpStatusCode.valueOf(400), "会话 ID 无效");
        }
        String namespace = principal.tenantId() + "\n" + principal.user().id();
        String encodedNamespace = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(namespace.getBytes(StandardCharsets.UTF_8));
        return encodedNamespace + "." + conversationId;
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private byte[] runtimeRequestBody(String query, String conversationId, String fileId) {
        try {
            return objectMapper.writeValueAsBytes(new RuntimeStreamRequest(query, conversationId, fileId));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("无法序列化 Agent 运行时请求", exception);
        }
    }

    private record RuntimeStreamRequest(String query, String conversationId, String fileId) {
    }

    private ResponseEntity<StreamingResponseBody> response(AgentRuntimeGateway.RuntimeResponse runtimeResponse) {
        HttpHeaders headers = new HttpHeaders();
        try {
            headers.setContentType(MediaType.parseMediaType(runtimeResponse.contentType()));
        } catch (IllegalArgumentException exception) {
            headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
        }
        if (runtimeResponse.contentLength() != null && runtimeResponse.contentLength() >= 0) {
            headers.setContentLength(runtimeResponse.contentLength());
        }
        List<String> buffering = runtimeResponse.headers().entrySet().stream()
                .filter(entry -> "x-accel-buffering".equalsIgnoreCase(entry.getKey()))
                .flatMap(entry -> entry.getValue().stream())
                .toList();
        if (!buffering.isEmpty()) headers.set("X-Accel-Buffering", buffering.getFirst());

        StreamingResponseBody stream = output -> {
            try (var input = runtimeResponse.body()) {
                input.transferTo(output);
            }
        };
        return new ResponseEntity<>(stream, headers, HttpStatusCode.valueOf(runtimeResponse.statusCode()));
    }
}
