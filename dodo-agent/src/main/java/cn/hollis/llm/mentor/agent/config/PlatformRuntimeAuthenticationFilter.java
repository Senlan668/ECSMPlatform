package cn.hollis.llm.mentor.agent.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Component
public class PlatformRuntimeAuthenticationFilter extends OncePerRequestFilter {
    private final String controlToken;

    public PlatformRuntimeAuthenticationFilter(
            @Value("${platform.runtime.control-token:}") String controlToken
    ) {
        this.controlToken = controlToken;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return "OPTIONS".equalsIgnoreCase(request.getMethod())
                || !(path.startsWith("/agent/") || path.startsWith("/session/") || path.startsWith("/file/"));
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        if (controlToken.isBlank()) {
            writeError(response, HttpServletResponse.SC_SERVICE_UNAVAILABLE, "runtime control token is not configured");
            return;
        }

        String suppliedToken = request.getHeader("X-Runtime-Token");
        String tenantId = request.getHeader("X-Tenant-Id");
        String subjectId = request.getHeader("X-Subject-Id");
        if (!matches(controlToken, suppliedToken)
                || tenantId == null || tenantId.isBlank()
                || subjectId == null || subjectId.isBlank()) {
            writeError(response, HttpServletResponse.SC_UNAUTHORIZED, "runtime authentication failed");
            return;
        }
        filterChain.doFilter(request, response);
    }

    private void writeError(HttpServletResponse response, int status, String detail) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("{\"error\":\"" + detail + "\"}");
    }

    private boolean matches(String expected, String supplied) {
        if (supplied == null) return false;
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                supplied.getBytes(StandardCharsets.UTF_8)
        );
    }
}
