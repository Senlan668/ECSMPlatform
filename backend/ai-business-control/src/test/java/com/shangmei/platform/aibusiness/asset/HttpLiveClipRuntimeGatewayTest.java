package com.shangmei.platform.aibusiness.asset;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class HttpLiveClipRuntimeGatewayTest {
    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) server.stop(0);
    }

    @Test
    void uploadsAudioThenCreatesAndParsesRuntimeTask() throws Exception {
        AtomicReference<String> uploadToken = new AtomicReference<>();
        AtomicReference<byte[]> uploadBody = new AtomicReference<>();
        AtomicReference<String> taskToken = new AtomicReference<>();
        AtomicReference<String> taskBody = new AtomicReference<>();

        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/upload/audio", exchange -> {
            uploadToken.set(exchange.getRequestHeaders().getFirst("X-Runtime-Token"));
            uploadBody.set(exchange.getRequestBody().readAllBytes());
            writeJson(exchange, 200, "{\"audio_path\":\"storage/uploads/audio.mp3\",\"size_bytes\":4}");
        });
        server.createContext("/api/tasks", exchange -> {
            taskToken.set(exchange.getRequestHeaders().getFirst("X-Runtime-Token"));
            taskBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            writeJson(exchange, 200, """
                    {"id":"task-1","status":"pending","progress":0,"progress_message":"queued","clips":[
                      {"id":"clip-1","clip_index":1,"title":"demo","summary":"summary","clip_type":"sales",
                       "start_time":1.5,"end_time":9.5,"virality_score":8,"suggested_caption":"caption"}
                    ]}
                    """);
        });
        server.start();

        var gateway = new HttpLiveClipRuntimeGateway(
                new ObjectMapper(),
                "http://127.0.0.1:" + server.getAddress().getPort(),
                "runtime-control-token"
        );
        var audio = new MockMultipartFile("audio", "sample.mp3", "audio/mpeg", "DATA".getBytes(StandardCharsets.US_ASCII));

        var task = gateway.dispatch(
                audio,
                new LiveClipRuntimeGateway.DispatchMetadata("source.mp4", "访谈播客", 1.25, 90.0)
        );

        assertThat(uploadToken.get()).isEqualTo("runtime-control-token");
        assertThat(new String(uploadBody.get(), StandardCharsets.ISO_8859_1)).contains("DATA").contains("audio.mp3");
        assertThat(taskToken.get()).isEqualTo("runtime-control-token");
        assertThat(taskBody.get()).contains("storage/uploads/audio.mp3")
                .contains("\"scene_mode\":\"interview\"")
                .contains("\"video_start_offset\":1.25");
        assertThat(task.id()).isEqualTo("task-1");
        assertThat(task.clips()).hasSize(1);
        assertThat(task.clips().getFirst().title()).isEqualTo("demo");
    }

    private static void writeJson(HttpExchange exchange, int status, String body) throws IOException {
        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, payload.length);
        exchange.getResponseBody().write(payload);
        exchange.close();
    }
}
