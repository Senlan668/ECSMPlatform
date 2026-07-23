package com.shangmei.platform.core.identity;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

public final class IdentityModels {
    private IdentityModels() {
    }

    public record Tenant(String id, String name, String plan) {
    }

    public record User(String id, String name, String username) {
    }

    public record Member(String userId, String username, String name, String role) {
    }

    public record LoginRequest(
            @NotBlank @Size(min = 3, max = 64) String username,
            @NotBlank @Size(min = 3, max = 128) String password,
            String tenantId
    ) {
    }

    public record RegisterRequest(
            @NotBlank @Size(min = 3, max = 64) String username,
            @NotBlank @Size(min = 3, max = 128) String password,
            @NotBlank @Size(max = 80) String tenantName
    ) {
    }

    public record SessionResponse(
            String accessToken,
            String tokenType,
            Instant expiresAt,
            User user,
            List<Tenant> tenants,
            String activeTenantId
    ) {
    }

    public record PrincipalResponse(
            boolean active,
            Instant expiresAt,
            User user,
            List<Tenant> tenants,
            String activeTenantId
    ) {
    }

    public record AuthPrincipal(
            String token,
            Instant expiresAt,
            User user,
            List<String> tenantIds,
            String activeTenantId
    ) {
        public boolean canAccess(String tenantId) {
            return tenantIds.contains(tenantId);
        }
    }
}
