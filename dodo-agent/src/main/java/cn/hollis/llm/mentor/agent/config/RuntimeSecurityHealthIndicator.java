package cn.hollis.llm.mentor.agent.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

/**
 * A runtime without its control-plane secret must not look ready to the
 * platform supervisor, even if Spring itself has started successfully.
 */
@Component
public class RuntimeSecurityHealthIndicator implements HealthIndicator {
    private final String controlToken;

    public RuntimeSecurityHealthIndicator(
            @Value("${platform.runtime.control-token:}") String controlToken
    ) {
        this.controlToken = controlToken;
    }

    @Override
    public Health health() {
        if (controlToken.isBlank()) {
            return Health.down()
                    .withDetail("runtimeAuthentication", "not_configured")
                    .build();
        }
        return Health.up()
                .withDetail("runtimeAuthentication", "configured")
                .build();
    }
}
