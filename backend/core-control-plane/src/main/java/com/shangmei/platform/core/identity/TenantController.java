package com.shangmei.platform.core.identity;

import com.shangmei.platform.core.identity.IdentityModels.AuthPrincipal;
import com.shangmei.platform.core.identity.IdentityModels.Member;
import com.shangmei.platform.core.identity.IdentityModels.Tenant;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

import static com.shangmei.platform.core.identity.SessionAuthenticationFilter.PRINCIPAL_ATTRIBUTE;

@RestController
@RequestMapping("/api/v1/tenants")
public class TenantController {
    private final IdentityService identityService;

    public TenantController(IdentityService identityService) {
        this.identityService = identityService;
    }

    @GetMapping
    public List<Tenant> list(@RequestAttribute(PRINCIPAL_ATTRIBUTE) AuthPrincipal principal) {
        return identityService.tenantDetails(principal);
    }

    @GetMapping("/{tenantId}/members")
    public List<Member> members(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) AuthPrincipal principal,
            @PathVariable String tenantId
    ) {
        return identityService.members(principal, tenantId);
    }
}
