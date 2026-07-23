package com.shangmei.platform.aibusiness.web;

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
                "service", "ai-business-control",
                "storage", "memory",
                "timestamp", Instant.now().toString()
        );
    }
}
