package com.shangmei.platform.core.identity;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.Map;

@Component
public class SessionAuthenticationFilter extends OncePerRequestFilter {
    public static final String PRINCIPAL_ATTRIBUTE = "platform.auth.principal";

    private final IdentityService identityService;
    private final ObjectMapper objectMapper;

    public SessionAuthenticationFilter(IdentityService identityService, ObjectMapper objectMapper) {
        this.identityService = identityService;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return "OPTIONS".equalsIgnoreCase(request.getMethod())
                || "/api/health".equals(path)
                || "/actuator/health".equals(path)
                || "/api/v1/auth/login".equals(path)
                || "/api/v1/auth/register".equals(path);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        try {
            request.setAttribute(
                    PRINCIPAL_ATTRIBUTE,
                    identityService.authenticate(request.getHeader("Authorization"))
            );
            filterChain.doFilter(request, response);
        } catch (ResponseStatusException exception) {
            response.setStatus(exception.getStatusCode().value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");
            objectMapper.writeValue(response.getWriter(), Map.of(
                    "code", "AUTHENTICATION_REQUIRED",
                    "detail", exception.getReason() == null ? "认证失败" : exception.getReason()
            ));
        }
    }
}
