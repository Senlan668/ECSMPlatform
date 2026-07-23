package com.shangmei.platform.aibusiness.customer;

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

class HttpVoiceRuntimeGatewayTest {
    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) server.stop(0);
    }

    @Test
    void issuesRtcAccessAndStartsAgentThroughProtectedRuntime() throws Exception {
        AtomicReference<String> sceneToken = new AtomicReference<>();
        AtomicReference<String> sceneBody = new AtomicReference<>();
        AtomicReference<String> actionQuery = new AtomicReference<>();
        AtomicReference<String> actionToken = new AtomicReference<>();
        AtomicReference<String> actionBody = new AtomicReference<>();

        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/getScenes", exchange -> {
            sceneToken.set(exchange.getRequestHeaders().getFirst("X-Runtime-Token"));
            sceneBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            writeJson(exchange, 200, """
                    {"Result":{"scenes":[{"scene":{"botName":"AiAgent","isInterruptMode":true},
                    "rtc":{"AppId":"rtc-app","RoomId":"room-1","UserId":"user-1","Token":"rtc-token"}}]}}
                    """);
        });
        server.createContext("/proxy", exchange -> {
            actionQuery.set(exchange.getRequestURI().getQuery());
            actionToken.set(exchange.getRequestHeaders().getFirst("X-Runtime-Token"));
            actionBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            writeJson(exchange, 200, "{\"ResponseMetadata\":{}}");
        });
        server.start();

        var gateway = new HttpVoiceRuntimeGateway(
                new ObjectMapper(),
                "http://127.0.0.1:" + server.getAddress().getPort(),
                "runtime-control-token"
        );

        var access = gateway.issueAccess("room-1", "user-1");
        gateway.startAgent("room-1", "user-1", "task-1");

        assertThat(sceneToken.get()).isEqualTo("runtime-control-token");
        assertThat(sceneBody.get()).contains("\"room_id\":\"room-1\"").contains("\"user_id\":\"user-1\"");
        assertThat(access.appId()).isEqualTo("rtc-app");
        assertThat(access.token()).isEqualTo("rtc-token");
        assertThat(access.interruptSupported()).isTrue();
        assertThat(actionQuery.get()).contains("Action=StartVoiceChat").contains("Version=2024-12-01");
        assertThat(actionToken.get()).isEqualTo("runtime-control-token");
        assertThat(actionBody.get()).contains("\"RoomId\":\"room-1\"")
                .contains("\"UserId\":\"user-1\"")
                .contains("\"TaskId\":\"task-1\"");
    }

    private static void writeJson(HttpExchange exchange, int status, String body) throws IOException {
        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, payload.length);
        exchange.getResponseBody().write(payload);
        exchange.close();
    }
}
