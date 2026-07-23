package com.shangmei.platform.aibusiness.identity;

import java.time.Instant;
import java.util.List;

public final class IdentityModels {
    private IdentityModels() {
    }

    public record Tenant(String id, String name, String plan) {
    }

    public record User(String id, String name, String username) {
    }

    public record IntrospectionResponse(
            boolean active,
            Instant expiresAt,
            User user,
            List<Tenant> tenants,
            String activeTenantId
    ) {
    }

    public record TenantPrincipal(User user, String tenantId, String authorization, String traceId) {
    }
}
