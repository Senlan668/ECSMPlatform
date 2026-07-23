package com.shangmei.platform.aibusiness.analytics;

import com.shangmei.platform.aibusiness.asset.AssetService;
import com.shangmei.platform.aibusiness.content.ContentService;
import com.shangmei.platform.aibusiness.customer.CustomerService;
import com.shangmei.platform.aibusiness.governance.GovernanceService;
import com.shangmei.platform.aibusiness.identity.IdentityModels.TenantPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import static com.shangmei.platform.aibusiness.identity.TenantAuthenticationFilter.PRINCIPAL_ATTRIBUTE;

@RestController
@RequestMapping("/api/v1/analytics")
public class AnalyticsController {
    private final AssetService assets;
    private final ContentService content;
    private final CustomerService customer;
    private final GovernanceService governance;

    public AnalyticsController(
            AssetService assets,
            ContentService content,
            CustomerService customer,
            GovernanceService governance
    ) {
        this.assets = assets;
        this.content = content;
        this.customer = customer;
        this.governance = governance;
    }

    @GetMapping("/summary")
    public Map<String, Object> summary(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal) {
        String tenantId = principal.tenantId();
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.putAll(assets.stats(tenantId));
        summary.putAll(content.stats(tenantId));
        summary.putAll(customer.stats(tenantId));
        summary.putAll(governance.stats(tenantId));
        summary.put("aiTraces", 0L);
        summary.put("tokenUsage", 0L);
        summary.put("costMicros", 0L);
        summary.put("source", "control-plane-memory");
        summary.put("calculatedAt", Instant.now());
        return Map.copyOf(summary);
    }
}
