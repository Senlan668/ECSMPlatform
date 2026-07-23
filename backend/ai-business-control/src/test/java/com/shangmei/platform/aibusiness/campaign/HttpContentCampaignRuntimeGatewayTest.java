package com.shangmei.platform.aibusiness.campaign;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class HttpContentCampaignRuntimeGatewayTest {
    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) server.stop(0);
    }

    @Test
    void forwardsRangeAndTrustedIdentityToMediaRuntime() throws Exception {
        AtomicReference<String> range = new AtomicReference<>();
        AtomicReference<String> tenant = new AtomicReference<>();
        AtomicReference<String> subjectName = new AtomicReference<>();
        startServer("/static/images/poster.png", exchange -> {
            range.set(exchange.getRequestHeaders().getFirst("Range"));
            tenant.set(exchange.getRequestHeaders().getFirst("X-Tenant-Id"));
            subjectName.set(exchange.getRequestHeaders().getFirst("X-Subject-Name"));
            exchange.getResponseHeaders().set("Content-Type", "image/png");
            exchange.getResponseHeaders().set("Content-Range", "bytes 0-3/8");
            exchange.getResponseHeaders().set("Accept-Ranges", "bytes");
            writeResponse(exchange, 206, "PNG!".getBytes(StandardCharsets.US_ASCII));
        });

        var response = gateway().forward(
                "tenant-a", "subject-1", "operator", "内容运营", "trace-1",
                "GET", "/static/images/poster.png", null, null, "image/*", "bytes=0-3", null
        );

        assertThat(response.statusCode()).isEqualTo(206);
        assertThat(response.body().readAllBytes()).isEqualTo("PNG!".getBytes(StandardCharsets.US_ASCII));
        assertThat(response.headers().get("content-range")).containsExactly("bytes 0-3/8");
        assertThat(range.get()).isEqualTo("bytes=0-3");
        assertThat(tenant.get()).isEqualTo("tenant-a");
        assertThat(new String(Base64.getUrlDecoder().decode(subjectName.get()), StandardCharsets.UTF_8))
                .isEqualTo("内容运营");
    }

    @Test
    void returnsSseResponseBeforeTheRuntimeCompletesTheStream() throws Exception {
        CountDownLatch releaseSecondEvent = new CountDownLatch(1);
        startServer("/api/v1/poster/batch/task-1/stream", exchange -> {
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
            exchange.getResponseHeaders().set("X-Accel-Buffering", "no");
            exchange.sendResponseHeaders(200, 0);
            exchange.getResponseBody().write("data: {\"status\":\"running\"}\n\n".getBytes(StandardCharsets.UTF_8));
            exchange.getResponseBody().flush();
            try {
                releaseSecondEvent.await(2, TimeUnit.SECONDS);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
            exchange.getResponseBody().write("data: {\"status\":\"completed\"}\n\n".getBytes(StandardCharsets.UTF_8));
            exchange.close();
        });

        long startedAt = System.nanoTime();
        var response = gateway().forward(
                "tenant-a", "subject-1", "operator", "内容运营", "trace-2",
                "GET", "/poster/batch/task-1/stream", null, null, "text/event-stream", null, null
        );
        Duration headerLatency = Duration.ofNanos(System.nanoTime() - startedAt);
        releaseSecondEvent.countDown();

        assertThat(headerLatency).isLessThan(Duration.ofMillis(1500));
        assertThat(response.contentType()).startsWith("text/event-stream");
        assertThat(new String(response.body().readAllBytes(), StandardCharsets.UTF_8))
                .contains("\"running\"")
                .contains("\"completed\"");
    }

    @Test
    void reconstructsMultipartFieldsAndFileContent() throws Exception {
        AtomicReference<String> contentType = new AtomicReference<>();
        AtomicReference<byte[]> requestBody = new AtomicReference<>();
        startServer("/api/v1/profile/avatar", exchange -> {
            contentType.set(exchange.getRequestHeaders().getFirst("Content-Type"));
            requestBody.set(exchange.getRequestBody().readAllBytes());
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            writeResponse(exchange, 200, "{\"success\":true}".getBytes(StandardCharsets.UTF_8));
        });
        List<ContentCampaignRuntimeGateway.MultipartPart> parts = List.of(
                new ContentCampaignRuntimeGateway.MultipartPart(
                        "label", null, "text/plain; charset=UTF-8", 6,
                        () -> new ByteArrayInputStream("品牌图".getBytes(StandardCharsets.UTF_8))
                ),
                new ContentCampaignRuntimeGateway.MultipartPart(
                        "logo", "品牌.png", "image/png", 4,
                        () -> new ByteArrayInputStream("PNG!".getBytes(StandardCharsets.US_ASCII))
                )
        );

        var response = gateway().forwardMultipart(
                "tenant-b", "subject-2", "operator", "运营员", "trace-3",
                "POST", "/profile/avatar", null, "application/json", parts
        );
        String body = new String(requestBody.get(), StandardCharsets.UTF_8);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(contentType.get()).startsWith("multipart/form-data; boundary=ShangmeiCampaignBoundary");
        assertThat(body).contains("name=\"label\"")
                .contains("品牌图")
                .contains("name=\"logo\"")
                .contains("filename*=UTF-8''%E5%93%81%E7%89%8C.png")
                .contains("PNG!");
    }

    private HttpContentCampaignRuntimeGateway gateway() {
        return new HttpContentCampaignRuntimeGateway(
                "http://127.0.0.1:" + server.getAddress().getPort(),
                "runtime-control-token"
        );
    }

    private void startServer(String path, ThrowingHandler handler) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(path, exchange -> {
            try {
                handler.handle(exchange);
            } catch (Exception exception) {
                byte[] payload = exception.toString().getBytes(StandardCharsets.UTF_8);
                writeResponse(exchange, 500, payload);
            }
        });
        server.start();
    }

    private static void writeResponse(HttpExchange exchange, int status, byte[] payload) throws IOException {
        exchange.sendResponseHeaders(status, payload.length);
        exchange.getResponseBody().write(payload);
        exchange.close();
    }

    @FunctionalInterface
    private interface ThrowingHandler {
        void handle(HttpExchange exchange) throws Exception;
    }
}
