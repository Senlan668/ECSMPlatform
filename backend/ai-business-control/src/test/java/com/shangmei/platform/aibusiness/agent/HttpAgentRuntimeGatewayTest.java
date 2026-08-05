package com.shangmei.platform.aibusiness.agent;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class HttpAgentRuntimeGatewayTest {
    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) server.stop(0);
    }

    @Test
    void forwardsTrustedIdentityAndReturnsBeforeSseCompletes() throws Exception {
        AtomicReference<String> token = new AtomicReference<>();
        AtomicReference<String> tenant = new AtomicReference<>();
        AtomicReference<String> subject = new AtomicReference<>();
        AtomicReference<String> query = new AtomicReference<>();
        CountDownLatch release = new CountDownLatch(1);
        startServer(exchange -> {
            token.set(exchange.getRequestHeaders().getFirst("X-Runtime-Token"));
            tenant.set(exchange.getRequestHeaders().getFirst("X-Tenant-Id"));
            subject.set(exchange.getRequestHeaders().getFirst("X-Subject-Id"));
            query.set(exchange.getRequestURI().getRawQuery());
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream;charset=UTF-8");
            exchange.getResponseHeaders().set("X-Accel-Buffering", "no");
            exchange.sendResponseHeaders(200, 0);
            exchange.getResponseBody().write("data: {\"type\":\"thinking\"}\n\n".getBytes(StandardCharsets.UTF_8));
            exchange.getResponseBody().flush();
            try {
                release.await(2, TimeUnit.SECONDS);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
            exchange.getResponseBody().write("data: {\"type\":\"text\"}\n\n".getBytes(StandardCharsets.UTF_8));
            exchange.close();
        });

        long startedAt = System.nanoTime();
        var response = gateway().forward(
                "tenant-a", "user-a", "GET", "/agent/chat/stream",
                "query=hello&conversationId=session-a", null, "text/event-stream", null
        );
        Duration headerLatency = Duration.ofNanos(System.nanoTime() - startedAt);

        try (var body = response.body()) {
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(response.contentType()).startsWith("text/event-stream");
            assertThat(headerLatency).isLessThan(Duration.ofSeconds(1));
            assertThat(token.get()).isEqualTo("runtime-token");
            assertThat(tenant.get()).isEqualTo("tenant-a");
            assertThat(subject.get()).isEqualTo("user-a");
            assertThat(query.get()).isEqualTo("query=hello&conversationId=session-a");
            release.countDown();
            assertThat(new String(body.readAllBytes(), StandardCharsets.UTF_8)).contains("thinking", "text");
        } finally {
            release.countDown();
        }
    }

    private HttpAgentRuntimeGateway gateway() {
        return new HttpAgentRuntimeGateway("http://127.0.0.1:" + server.getAddress().getPort(), "runtime-token");
    }

    private void startServer(ExchangeHandler handler) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/agent/chat/stream", exchange -> handler.handle(exchange));
        server.start();
    }

    @FunctionalInterface
    private interface ExchangeHandler {
        void handle(HttpExchange exchange) throws IOException;
    }
}
