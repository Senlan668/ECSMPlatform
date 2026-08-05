package com.shangmei.platform.aibusiness.runtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class RuntimeRegistryServiceTest {
    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) server.stop(0);
    }

    @Test
    void reportsEveryConfiguredAiRuntimeIncludingBlueKun() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/health", this::healthy);
        server.createContext("/api/health", this::healthy);
        server.start();
        String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();

        RuntimeRegistryService registry = new RuntimeRegistryService(
                new ObjectMapper(), baseUrl, baseUrl, baseUrl, baseUrl, baseUrl, baseUrl
        );

        var health = registry.checkAll();
        assertThat(health).hasSize(6);
        assertThat(health).extracting(RuntimeModels.RuntimeHealth::id)
                .containsExactlyInAnyOrder(
                        "live-clip", "sales-knowledge", "voice", "content-campaign",
                        "shared-ai-services", "dodo-agent"
                );
        assertThat(health).allMatch(item -> "online".equals(item.status()));
    }

    private void healthy(HttpExchange exchange) throws IOException {
        byte[] body = "{\"status\":\"ok\"}".getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }
}
