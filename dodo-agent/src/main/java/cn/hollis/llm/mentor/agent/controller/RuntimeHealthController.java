package cn.hollis.llm.mentor.agent.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
public class RuntimeHealthController {
    private final boolean modelConfigured;
    private final boolean searchConfigured;
    private final boolean runtimeAuthenticationConfigured;

    public RuntimeHealthController(
            @Value("${spring.ai.openai.api-key:}") String modelApiKey,
            @Value("${tavily.api-key:}") String tavilyApiKey,
            @Value("${platform.runtime.control-token:}") String controlToken
    ) {
        this.modelConfigured = !modelApiKey.isBlank() && !"local-development-placeholder".equals(modelApiKey);
        this.searchConfigured = !tavilyApiKey.isBlank();
        this.runtimeAuthenticationConfigured = !controlToken.isBlank();
    }

    @GetMapping("/api/health")
    public Map<String, Object> health() {
        return Map.of(
                "status", runtimeAuthenticationConfigured ? "ok" : "degraded",
                "service", "dodo-agent-runtime",
                "capabilities", List.of("chat", "file", "pptx", "deep-research"),
                "modelConfigured", modelConfigured,
                "searchConfigured", searchConfigured,
                "runtimeAuthenticationConfigured", runtimeAuthenticationConfigured,
                "timestamp", Instant.now().toString()
        );
    }
}
