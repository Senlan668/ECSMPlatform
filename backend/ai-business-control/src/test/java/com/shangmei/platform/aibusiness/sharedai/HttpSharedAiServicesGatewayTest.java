package com.shangmei.platform.aibusiness.sharedai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class HttpSharedAiServicesGatewayTest {
    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) server.stop(0);
    }

    @Test
    void forwardsTrustedContextAndAgentSessionPayload() throws Exception {
        AtomicReference<String> tenant = new AtomicReference<>();
        AtomicReference<String> subject = new AtomicReference<>();
        AtomicReference<String> trace = new AtomicReference<>();
        AtomicReference<String> token = new AtomicReference<>();
        AtomicReference<String> body = new AtomicReference<>();

        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/agents/customer-service/chat", exchange -> {
            tenant.set(exchange.getRequestHeaders().getFirst("X-Tenant-Id"));
            subject.set(exchange.getRequestHeaders().getFirst("X-Subject-Id"));
            trace.set(exchange.getRequestHeaders().getFirst("X-Request-ID"));
            token.set(exchange.getRequestHeaders().getFirst("X-Runtime-Token"));
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            writeJson(exchange, 200, "{\"session_id\":\"session-1\",\"answer\":\"ok\"}");
        });
        server.start();

        var gateway = new HttpSharedAiServicesGateway(
                new ObjectMapper(),
                "http://127.0.0.1:" + server.getAddress().getPort(),
                "runtime-control-token"
        );
        var response = gateway.agentChat(
                "tenant-a", "subject-7", "trace-9", "customer-service",
                "Where is my order?", "session-1", "concise"
        );

        assertThat(tenant.get()).isEqualTo("tenant-a");
        assertThat(subject.get()).isEqualTo("subject-7");
        assertThat(trace.get()).isEqualTo("trace-9");
        assertThat(token.get()).isEqualTo("runtime-control-token");
        assertThat(body.get()).contains("Where is my order?")
                .contains("\"session_id\":\"session-1\"")
                .contains("\"style\":\"concise\"");
        assertThat(response.path("answer").asText()).isEqualTo("ok");
    }

    private static void writeJson(HttpExchange exchange, int status, String body) throws IOException {
        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, payload.length);
        exchange.getResponseBody().write(payload);
        exchange.close();
    }
}
