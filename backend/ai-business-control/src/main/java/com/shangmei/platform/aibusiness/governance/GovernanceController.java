package com.shangmei.platform.aibusiness.governance;

import com.shangmei.platform.aibusiness.governance.GovernanceModels.ApiKeyRecord;
import com.shangmei.platform.aibusiness.governance.GovernanceModels.BudgetPolicy;
import com.shangmei.platform.aibusiness.governance.GovernanceModels.CreateApiKey;
import com.shangmei.platform.aibusiness.governance.GovernanceModels.CreatedApiKey;
import com.shangmei.platform.aibusiness.governance.GovernanceModels.ModelRecord;
import com.shangmei.platform.aibusiness.governance.GovernanceModels.PromptRecord;
import com.shangmei.platform.aibusiness.governance.GovernanceModels.RenameApiKey;
import com.shangmei.platform.aibusiness.governance.GovernanceModels.SaveModel;
import com.shangmei.platform.aibusiness.governance.GovernanceModels.SavePrompt;
import com.shangmei.platform.aibusiness.governance.GovernanceModels.SaveTool;
import com.shangmei.platform.aibusiness.governance.GovernanceModels.ToolRecord;
import com.shangmei.platform.aibusiness.identity.IdentityModels.TenantPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

import static com.shangmei.platform.aibusiness.identity.TenantAuthenticationFilter.PRINCIPAL_ATTRIBUTE;

@RestController
@RequestMapping("/api/v1/governance")
public class GovernanceController {
    private final GovernanceService service;

    public GovernanceController(GovernanceService service) {
        this.service = service;
    }

    @GetMapping("/models")
    public List<ModelRecord> listModels(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal) {
        return service.listModels(principal.tenantId());
    }

    @PostMapping("/models")
    @ResponseStatus(HttpStatus.CREATED)
    public ModelRecord createModel(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal, @Valid @RequestBody SaveModel input) {
        return service.createModel(principal.tenantId(), input);
    }

    @PutMapping("/models/{id}")
    public ModelRecord updateModel(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal, @PathVariable String id, @Valid @RequestBody SaveModel input) {
        return service.updateModel(principal.tenantId(), id, input);
    }

    @PostMapping("/models/{id}/toggle")
    public ModelRecord toggleModel(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal, @PathVariable String id) {
        return service.toggleModel(principal.tenantId(), id);
    }

    @DeleteMapping("/models/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteModel(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal, @PathVariable String id) {
        service.deleteModel(principal.tenantId(), id);
    }

    @GetMapping("/api-keys")
    public List<ApiKeyRecord> listApiKeys(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal) {
        return service.listApiKeys(principal.tenantId());
    }

    @PostMapping("/api-keys")
    @ResponseStatus(HttpStatus.CREATED)
    public CreatedApiKey createApiKey(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal, @Valid @RequestBody CreateApiKey input) {
        return service.createApiKey(principal.tenantId(), input.name());
    }

    @PutMapping("/api-keys/{id}")
    public ApiKeyRecord renameApiKey(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal, @PathVariable String id, @Valid @RequestBody RenameApiKey input) {
        return service.renameApiKey(principal.tenantId(), id, input.name());
    }

    @PostMapping("/api-keys/{id}/toggle")
    public ApiKeyRecord toggleApiKey(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal, @PathVariable String id) {
        return service.toggleApiKey(principal.tenantId(), id);
    }

    @DeleteMapping("/api-keys/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteApiKey(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal, @PathVariable String id) {
        service.deleteApiKey(principal.tenantId(), id);
    }

    @GetMapping("/prompts")
    public List<PromptRecord> listPrompts(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal) {
        return service.listPrompts(principal.tenantId());
    }

    @PostMapping("/prompts")
    @ResponseStatus(HttpStatus.CREATED)
    public PromptRecord createPrompt(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal, @Valid @RequestBody SavePrompt input) {
        return service.createPrompt(principal.tenantId(), input);
    }

    @PutMapping("/prompts/{id}")
    public PromptRecord updatePrompt(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal, @PathVariable String id, @Valid @RequestBody SavePrompt input) {
        return service.updatePrompt(principal.tenantId(), id, input);
    }

    @PostMapping("/prompts/{id}/toggle")
    public PromptRecord togglePrompt(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal, @PathVariable String id) {
        return service.togglePrompt(principal.tenantId(), id);
    }

    @DeleteMapping("/prompts/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePrompt(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal, @PathVariable String id) {
        service.deletePrompt(principal.tenantId(), id);
    }

    @GetMapping("/tools")
    public List<ToolRecord> listTools(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal) {
        return service.listTools(principal.tenantId());
    }

    @PostMapping("/tools")
    @ResponseStatus(HttpStatus.CREATED)
    public ToolRecord createTool(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal, @Valid @RequestBody SaveTool input) {
        return service.createTool(principal.tenantId(), input);
    }

    @PutMapping("/tools/{id}")
    public ToolRecord updateTool(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal, @PathVariable String id, @Valid @RequestBody SaveTool input) {
        return service.updateTool(principal.tenantId(), id, input);
    }

    @PostMapping("/tools/{id}/toggle")
    public ToolRecord toggleTool(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal, @PathVariable String id) {
        return service.toggleTool(principal.tenantId(), id);
    }

    @DeleteMapping("/tools/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTool(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal, @PathVariable String id) {
        service.deleteTool(principal.tenantId(), id);
    }

    @GetMapping("/budget")
    public BudgetPolicy getBudget(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal) {
        return service.getBudget(principal.tenantId());
    }

    @PutMapping("/budget")
    public BudgetPolicy saveBudget(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal, @Valid @RequestBody BudgetPolicy budget) {
        return service.saveBudget(principal.tenantId(), budget);
    }
}
