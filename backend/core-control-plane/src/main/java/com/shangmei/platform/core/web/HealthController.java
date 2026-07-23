package com.shangmei.platform.core.web;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

@RestController
public class HealthController {
    @GetMapping("/api/health")
    public Map<String, Object> health() {
        return Map.of(
                "status", "ok",
                "service", "core-control-plane",
                "storage", "memory",
                "timestamp", Instant.now().toString()
        );
    }
}
