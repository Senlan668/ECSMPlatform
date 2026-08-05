package com.shangmei.platform.aibusiness.agent;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shangmei.platform.aibusiness.identity.IdentityModels.TenantPrincipal;
import com.shangmei.platform.aibusiness.identity.IdentityModels.User;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class AgentControllerTest {
    @Test
    void namespacesConversationAndRoutesDeepResearch() throws Exception {
        AtomicReference<String> path = new AtomicReference<>();
        AtomicReference<String> forwardedMethod = new AtomicReference<>();
        AtomicReference<String> query = new AtomicReference<>();
        AtomicReference<byte[]> forwardedBody = new AtomicReference<>();
        AgentRuntimeGateway gateway = new AgentRuntimeGateway() {
            @Override
            public RuntimeResponse forward(
                    String tenantId, String subjectId, String method, String runtimePath, String runtimeQuery,
                    String contentType, String accept, byte[] body
            ) {
                path.set(runtimePath);
                forwardedMethod.set(method);
                query.set(runtimeQuery);
                forwardedBody.set(body);
                byte[] payload = "data: {\"type\":\"text\",\"content\":\"ok\"}\n\n".getBytes(StandardCharsets.UTF_8);
                return new RuntimeResponse(200, new ByteArrayInputStream(payload), "text/event-stream", null, Map.of());
            }

            @Override
            public RuntimeResponse forwardMultipart(
                    String tenantId, String subjectId, String runtimePath, String accept, List<MultipartPart> parts
            ) {
                throw new UnsupportedOperationException();
            }
        };
        AgentController controller = new AgentController(gateway, new ObjectMapper());
        TenantPrincipal principal = new TenantPrincipal(
                new User("user-a", "User A", "user-a"), "tenant-a", "Bearer token", "trace-a"
        );

        controller.stream(
                principal,
                "2f9b57a0-41ee-4b55-a456-c442d4b62d6e",
                new AgentController.SendMessageRequest("research", "deep", null)
        );

        assertThat(path.get()).isEqualTo("/agent/deep/stream");
        assertThat(forwardedMethod.get()).isEqualTo("POST");
        assertThat(query.get()).isNull();
        var payload = new ObjectMapper().readTree(forwardedBody.get());
        assertThat(payload.path("query").asText()).isEqualTo("research");
        String encodedConversationId = payload.path("conversationId").asText();
        String[] parts = encodedConversationId.split("\\.", 2);
        assertThat(parts).hasSize(2);
        assertThat(new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8))
                .isEqualTo("tenant-a\nuser-a");
        assertThat(parts[1]).isEqualTo("2f9b57a0-41ee-4b55-a456-c442d4b62d6e");
    }

}
