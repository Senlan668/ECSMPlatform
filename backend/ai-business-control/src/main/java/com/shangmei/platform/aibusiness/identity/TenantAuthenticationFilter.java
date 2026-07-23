package com.shangmei.platform.aibusiness.identity;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shangmei.platform.aibusiness.identity.IdentityModels.IntrospectionResponse;
import com.shangmei.platform.aibusiness.identity.IdentityModels.TenantPrincipal;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;

@Component
public class TenantAuthenticationFilter extends OncePerRequestFilter {
    public static final String PRINCIPAL_ATTRIBUTE = "platform.tenant.principal";

    private final IdentityVerifier identityVerifier;
    private final ObjectMapper objectMapper;

    public TenantAuthenticationFilter(IdentityVerifier identityVerifier, ObjectMapper objectMapper) {
        this.identityVerifier = identityVerifier;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return "OPTIONS".equalsIgnoreCase(request.getMethod())
                || "/api/health".equals(path)
                || "/actuator/health".equals(path);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        try {
            String authorization = requireHeader(request, "Authorization", "缺少访问令牌");
            String tenantId = requireHeader(request, "X-Tenant-Id", "缺少租户上下文");
            IntrospectionResponse identity = identityVerifier.verify(authorization);
            boolean allowed = identity.tenants() != null
                    && identity.tenants().stream().anyMatch(tenant -> tenant.id().equals(tenantId));
            if (!allowed) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "租户不存在或无权访问");
            }
            String traceId = request.getHeader("X-Trace-Id");
            if (traceId == null || traceId.isBlank()) {
                traceId = UUID.randomUUID().toString();
            }
            response.setHeader("X-Trace-Id", traceId);
            request.setAttribute(
                    PRINCIPAL_ATTRIBUTE,
                    new TenantPrincipal(identity.user(), tenantId, authorization, traceId)
            );
            filterChain.doFilter(request, response);
        } catch (ResponseStatusException exception) {
            writeError(response, exception);
        }
    }

    private String requireHeader(HttpServletRequest request, String name, String detail) {
        String value = request.getHeader(name);
        if (value == null || value.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, detail);
        }
        return value;
    }

    private void writeError(HttpServletResponse response, ResponseStatusException exception) throws IOException {
        response.setStatus(exception.getStatusCode().value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        objectMapper.writeValue(response.getWriter(), Map.of(
                "code", exception.getStatusCode().value() == 404 ? "TENANT_NOT_FOUND" : "AUTHENTICATION_REQUIRED",
                "detail", exception.getReason() == null ? "认证失败" : exception.getReason()
        ));
    }
}
