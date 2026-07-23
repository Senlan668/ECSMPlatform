package com.shangmei.platform.aibusiness.sharedai;

import com.fasterxml.jackson.databind.JsonNode;
import com.shangmei.platform.aibusiness.identity.IdentityModels.TenantPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.Set;

import static com.shangmei.platform.aibusiness.identity.TenantAuthenticationFilter.PRINCIPAL_ATTRIBUTE;

@RestController
@RequestMapping("/api/v1/governance/shared-services")
public class SharedAiServicesController {
    private static final Set<String> SERVICES = Set.of(
            "llm-gateway", "rag-service", "memory-service", "prompt-hub"
    );
    private static final String NAME_PATTERN = "[A-Za-z0-9][A-Za-z0-9._-]{0,99}";
    private static final Set<String> AGENTS = Set.of("customer-service", "writing-assistant");
    private static final Set<String> WRITING_STYLES = Set.of("正式", "轻松", "学术", "幽默");

    private final SharedAiServicesGateway gateway;

    public SharedAiServicesController(SharedAiServicesGateway gateway) {
        this.gateway = gateway;
    }

    @GetMapping("/health")
    public JsonNode health(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal) {
        return gateway.health(principal.tenantId(), principal.user().id(), principal.traceId());
    }

    @GetMapping("/{service}/tools")
    public JsonNode tools(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String service
    ) {
        requireService(service);
        return gateway.listTools(principal.tenantId(), principal.user().id(), principal.traceId(), service);
    }

    @PostMapping("/tools/call")
    public JsonNode callTool(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @Valid @RequestBody ToolCallRequest request
    ) {
        requireService(request.service());
        requireArguments(request.arguments());
        return gateway.callTool(
                principal.tenantId(), principal.user().id(), principal.traceId(),
                request.service(), request.tool(), request.arguments()
        );
    }

    @GetMapping("/{service}/prompts")
    public JsonNode prompts(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String service
    ) {
        requireService(service);
        return gateway.listPrompts(principal.tenantId(), principal.user().id(), principal.traceId(), service);
    }

    @PostMapping("/prompts/render")
    public JsonNode renderPrompt(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @Valid @RequestBody PromptRenderRequest request
    ) {
        requireService(request.service());
        requireArguments(request.arguments());
        return gateway.renderPrompt(
                principal.tenantId(), principal.user().id(), principal.traceId(),
                request.service(), request.prompt(), request.arguments()
        );
    }

    @GetMapping("/quota")
    public JsonNode quota(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal) {
        return gateway.quota(principal.tenantId(), principal.user().id(), principal.traceId());
    }

    @PostMapping("/agents/{agent}/chat")
    public JsonNode agentChat(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String agent,
            @Valid @RequestBody AgentChatRequest request
    ) {
        requireAgent(agent);
        if (!WRITING_STYLES.contains(request.style())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "不支持的写作文风");
        }
        return gateway.agentChat(
                principal.tenantId(), principal.user().id(), principal.traceId(), agent,
                request.message().trim(), request.sessionId(), request.style()
        );
    }

    @PostMapping("/agents/{agent}/clear")
    public JsonNode clearAgentSession(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String agent,
            @Valid @RequestBody AgentSessionRequest request
    ) {
        requireAgent(agent);
        return gateway.clearAgentSession(
                principal.tenantId(), principal.user().id(), principal.traceId(), agent, request.sessionId()
        );
    }

    @PostMapping("/agents/{agent}/profile")
    public JsonNode agentProfile(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String agent
    ) {
        requireAgent(agent);
        return gateway.agentProfile(principal.tenantId(), principal.user().id(), principal.traceId(), agent);
    }

    private void requireService(String service) {
        if (!SERVICES.contains(service)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "共享 AI 服务不存在");
        }
    }

    private void requireAgent(String agent) {
        if (!AGENTS.contains(agent)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Agent 工作流不存在");
        }
    }

    private void requireArguments(JsonNode arguments) {
        if (arguments == null || arguments.isNull()) return;
        if (!arguments.isObject() || arguments.size() > 100 || arguments.toString().length() > 262_144) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "共享 AI 服务参数无效");
        }
    }

    public record ToolCallRequest(
            @NotBlank @Pattern(regexp = NAME_PATTERN) String service,
            @NotBlank @Pattern(regexp = NAME_PATTERN) String tool,
            JsonNode arguments
    ) {
    }

    public record PromptRenderRequest(
            @NotBlank @Pattern(regexp = NAME_PATTERN) String service,
            @NotBlank @Pattern(regexp = NAME_PATTERN) String prompt,
            JsonNode arguments
    ) {
    }

    public record AgentChatRequest(
            @NotBlank @Size(max = 20_000) String message,
            @Pattern(regexp = "[A-Za-z0-9][A-Za-z0-9._:-]{0,127}") String sessionId,
            @NotBlank @Size(max = 10) String style
    ) {
        public AgentChatRequest {
            if (style == null || style.isBlank()) style = "正式";
        }
    }

    public record AgentSessionRequest(
            @NotBlank @Pattern(regexp = "[A-Za-z0-9][A-Za-z0-9._:-]{0,127}") String sessionId
    ) {
    }
}
