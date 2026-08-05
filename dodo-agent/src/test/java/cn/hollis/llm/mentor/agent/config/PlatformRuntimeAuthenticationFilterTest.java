package cn.hollis.llm.mentor.agent.config;

import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

class PlatformRuntimeAuthenticationFilterTest {
    @Test
    void failsClosedWhenControlTokenIsMissing() throws Exception {
        PlatformRuntimeAuthenticationFilter filter = new PlatformRuntimeAuthenticationFilter("");
        MockHttpServletRequest request = request("/agent/chat/stream");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
        assertThat(response.getContentAsString()).contains("not configured");
    }

    @Test
    void requiresTenantAndSubjectWithTheControlToken() throws Exception {
        PlatformRuntimeAuthenticationFilter filter = new PlatformRuntimeAuthenticationFilter("runtime-secret");
        MockHttpServletRequest request = request("/agent/chat/stream");
        request.addHeader("X-Runtime-Token", "runtime-secret");
        request.addHeader("X-Tenant-Id", "tenant-a");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);
        assertThat(response.getStatus()).isEqualTo(HttpServletResponse.SC_UNAUTHORIZED);
        assertThat(chain.getRequest()).isNull();

        request.addHeader("X-Subject-Id", "subject-a");
        response = new MockHttpServletResponse();
        chain = new MockFilterChain();
        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(HttpServletResponse.SC_OK);
        assertThat(chain.getRequest()).isNotNull();
    }

    private MockHttpServletRequest request(String path) {
        return new MockHttpServletRequest("GET", path);
    }
}
