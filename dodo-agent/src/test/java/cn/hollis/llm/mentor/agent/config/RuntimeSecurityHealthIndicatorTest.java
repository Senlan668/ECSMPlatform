package cn.hollis.llm.mentor.agent.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.actuate.health.Status;

import static org.assertj.core.api.Assertions.assertThat;

class RuntimeSecurityHealthIndicatorTest {
    @Test
    void reportsDownWhenRuntimeAuthenticationIsNotConfigured() {
        assertThat(new RuntimeSecurityHealthIndicator("").health().getStatus()).isEqualTo(Status.DOWN);
    }

    @Test
    void reportsUpWhenRuntimeAuthenticationIsConfigured() {
        assertThat(new RuntimeSecurityHealthIndicator("runtime-secret").health().getStatus()).isEqualTo(Status.UP);
    }
}
