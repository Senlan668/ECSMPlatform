package com.shangmei.platform.aibusiness.runtime;

import java.time.Instant;
import java.util.List;

public final class RuntimeModels {
    private RuntimeModels() {
    }

    public record RuntimeHealth(
            String id,
            String name,
            String kind,
            String baseUrl,
            String status,
            long latencyMs,
            String detail,
            List<String> capabilities,
            Instant checkedAt
    ) {
    }
}
