package com.shangmei.platform.aibusiness.runtime;

import com.shangmei.platform.aibusiness.identity.IdentityModels.TenantPrincipal;
import com.shangmei.platform.aibusiness.runtime.RuntimeModels.RuntimeHealth;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

import static com.shangmei.platform.aibusiness.identity.TenantAuthenticationFilter.PRINCIPAL_ATTRIBUTE;

@RestController
@RequestMapping("/api/v1/runtimes")
public class RuntimeController {
    private final RuntimeRegistryService registry;

    public RuntimeController(RuntimeRegistryService registry) {
        this.registry = registry;
    }

    @GetMapping
    public List<RuntimeHealth> list(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal) {
        return registry.checkAll();
    }
}
