package com.shangmei.platform.aibusiness.governance;

import com.shangmei.platform.aibusiness.governance.GovernanceModels.ApiKeyRecord;
import com.shangmei.platform.aibusiness.governance.GovernanceModels.BudgetPolicy;
import com.shangmei.platform.aibusiness.governance.GovernanceModels.CreatedApiKey;
import com.shangmei.platform.aibusiness.governance.GovernanceModels.ModelRecord;
import com.shangmei.platform.aibusiness.governance.GovernanceModels.SaveModel;
import com.shangmei.platform.aibusiness.governance.GovernanceModels.SavePrompt;
import com.shangmei.platform.aibusiness.governance.GovernanceModels.SaveTool;
import com.shangmei.platform.aibusiness.governance.GovernanceModels.PromptRecord;
import com.shangmei.platform.aibusiness.governance.GovernanceModels.ToolRecord;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class GovernanceService {
    private record StoredApiKey(ApiKeyRecord metadata, String secretHash) {
    }

    private static final class TenantGovernance {
        private final Map<String, ModelRecord> models = new LinkedHashMap<>();
        private final Map<String, StoredApiKey> apiKeys = new LinkedHashMap<>();
        private final Map<String, PromptRecord> prompts = new LinkedHashMap<>();
        private final Map<String, ToolRecord> tools = new LinkedHashMap<>();
        private BudgetPolicy budget = new BudgetPolicy(100_000, "observe");
    }

    private final Map<String, TenantGovernance> data = new ConcurrentHashMap<>();
    private final SecureRandom secureRandom = new SecureRandom();

    public List<ModelRecord> listModels(String tenantId) {
        TenantGovernance state = state(tenantId);
        synchronized (state) {
            return reversed(state.models.values());
        }
    }

    public ModelRecord createModel(String tenantId, SaveModel input) {
        TenantGovernance state = state(tenantId);
        Instant now = Instant.now();
        ModelRecord model = new ModelRecord(
                UUID.randomUUID().toString(), input.name().trim(), input.provider().trim(), input.modelId().trim(),
                "stopped", now, now
        );
        synchronized (state) {
            state.models.put(model.id(), model);
        }
        return model;
    }

    public ModelRecord updateModel(String tenantId, String modelId, SaveModel input) {
        TenantGovernance state = state(tenantId);
        synchronized (state) {
            ModelRecord current = require(state.models, modelId, "模型不存在");
            ModelRecord updated = new ModelRecord(
                    current.id(), input.name().trim(), input.provider().trim(), input.modelId().trim(),
                    current.status(), current.createdAt(), Instant.now()
            );
            state.models.put(modelId, updated);
            return updated;
        }
    }

    public ModelRecord toggleModel(String tenantId, String modelId) {
        TenantGovernance state = state(tenantId);
        synchronized (state) {
            ModelRecord current = require(state.models, modelId, "模型不存在");
            ModelRecord updated = new ModelRecord(
                    current.id(), current.name(), current.provider(), current.modelId(), toggle(current.status()),
                    current.createdAt(), Instant.now()
            );
            state.models.put(modelId, updated);
            return updated;
        }
    }

    public void deleteModel(String tenantId, String modelId) {
        remove(state(tenantId), modelId, "模型不存在", "model");
    }

    public List<ApiKeyRecord> listApiKeys(String tenantId) {
        TenantGovernance state = state(tenantId);
        synchronized (state) {
            return reversed(state.apiKeys.values().stream().map(StoredApiKey::metadata).toList());
        }
    }

    public CreatedApiKey createApiKey(String tenantId, String name) {
        TenantGovernance state = state(tenantId);
        byte[] random = new byte[24];
        secureRandom.nextBytes(random);
        String secret = "smz_" + Base64.getUrlEncoder().withoutPadding().encodeToString(random);
        Instant now = Instant.now();
        ApiKeyRecord metadata = new ApiKeyRecord(
                UUID.randomUUID().toString(), name.trim(), secret.substring(0, Math.min(10, secret.length())),
                secret.substring(secret.length() - 4), "running", now, now, null
        );
        synchronized (state) {
            state.apiKeys.put(metadata.id(), new StoredApiKey(metadata, sha256(secret)));
        }
        return new CreatedApiKey(metadata, secret);
    }

    public ApiKeyRecord renameApiKey(String tenantId, String keyId, String name) {
        TenantGovernance state = state(tenantId);
        synchronized (state) {
            StoredApiKey stored = require(state.apiKeys, keyId, "API Key 不存在");
            ApiKeyRecord current = stored.metadata();
            ApiKeyRecord updated = new ApiKeyRecord(
                    current.id(), name.trim(), current.prefix(), current.lastFour(), current.status(),
                    current.createdAt(), Instant.now(), current.lastUsedAt()
            );
            state.apiKeys.put(keyId, new StoredApiKey(updated, stored.secretHash()));
            return updated;
        }
    }

    public ApiKeyRecord toggleApiKey(String tenantId, String keyId) {
        TenantGovernance state = state(tenantId);
        synchronized (state) {
            StoredApiKey stored = require(state.apiKeys, keyId, "API Key 不存在");
            ApiKeyRecord current = stored.metadata();
            ApiKeyRecord updated = new ApiKeyRecord(
                    current.id(), current.name(), current.prefix(), current.lastFour(), toggle(current.status()),
                    current.createdAt(), Instant.now(), current.lastUsedAt()
            );
            state.apiKeys.put(keyId, new StoredApiKey(updated, stored.secretHash()));
            return updated;
        }
    }

    public void deleteApiKey(String tenantId, String keyId) {
        remove(state(tenantId), keyId, "API Key 不存在", "key");
    }

    public List<PromptRecord> listPrompts(String tenantId) {
        TenantGovernance state = state(tenantId);
        synchronized (state) {
            return reversed(state.prompts.values());
        }
    }

    public PromptRecord createPrompt(String tenantId, SavePrompt input) {
        TenantGovernance state = state(tenantId);
        Instant now = Instant.now();
        PromptRecord prompt = new PromptRecord(
                UUID.randomUUID().toString(), input.name().trim(), input.purpose().trim(), input.template().trim(),
                1, "stopped", now, now
        );
        synchronized (state) {
            state.prompts.put(prompt.id(), prompt);
        }
        return prompt;
    }

    public PromptRecord updatePrompt(String tenantId, String promptId, SavePrompt input) {
        TenantGovernance state = state(tenantId);
        synchronized (state) {
            PromptRecord current = require(state.prompts, promptId, "Prompt 不存在");
            PromptRecord updated = new PromptRecord(
                    current.id(), input.name().trim(), input.purpose().trim(), input.template().trim(),
                    current.version() + 1, current.status(), current.createdAt(), Instant.now()
            );
            state.prompts.put(promptId, updated);
            return updated;
        }
    }

    public PromptRecord togglePrompt(String tenantId, String promptId) {
        TenantGovernance state = state(tenantId);
        synchronized (state) {
            PromptRecord current = require(state.prompts, promptId, "Prompt 不存在");
            PromptRecord updated = new PromptRecord(
                    current.id(), current.name(), current.purpose(), current.template(), current.version(),
                    toggle(current.status()), current.createdAt(), Instant.now()
            );
            state.prompts.put(promptId, updated);
            return updated;
        }
    }

    public void deletePrompt(String tenantId, String promptId) {
        remove(state(tenantId), promptId, "Prompt 不存在", "prompt");
    }

    public List<ToolRecord> listTools(String tenantId) {
        TenantGovernance state = state(tenantId);
        synchronized (state) {
            return reversed(state.tools.values());
        }
    }

    public ToolRecord createTool(String tenantId, SaveTool input) {
        TenantGovernance state = state(tenantId);
        Instant now = Instant.now();
        ToolRecord tool = new ToolRecord(
                UUID.randomUUID().toString(), input.name().trim(), input.transport(), input.endpoint().trim(),
                "stopped", now, now
        );
        synchronized (state) {
            state.tools.put(tool.id(), tool);
        }
        return tool;
    }

    public ToolRecord updateTool(String tenantId, String toolId, SaveTool input) {
        TenantGovernance state = state(tenantId);
        synchronized (state) {
            ToolRecord current = require(state.tools, toolId, "工具服务不存在");
            ToolRecord updated = new ToolRecord(
                    current.id(), input.name().trim(), input.transport(), input.endpoint().trim(),
                    current.status(), current.createdAt(), Instant.now()
            );
            state.tools.put(toolId, updated);
            return updated;
        }
    }

    public ToolRecord toggleTool(String tenantId, String toolId) {
        TenantGovernance state = state(tenantId);
        synchronized (state) {
            ToolRecord current = require(state.tools, toolId, "工具服务不存在");
            ToolRecord updated = new ToolRecord(
                    current.id(), current.name(), current.transport(), current.endpoint(), toggle(current.status()),
                    current.createdAt(), Instant.now()
            );
            state.tools.put(toolId, updated);
            return updated;
        }
    }

    public void deleteTool(String tenantId, String toolId) {
        remove(state(tenantId), toolId, "工具服务不存在", "tool");
    }

    public BudgetPolicy getBudget(String tenantId) {
        TenantGovernance state = state(tenantId);
        synchronized (state) {
            return state.budget;
        }
    }

    public BudgetPolicy saveBudget(String tenantId, BudgetPolicy budget) {
        TenantGovernance state = state(tenantId);
        synchronized (state) {
            state.budget = budget;
            return state.budget;
        }
    }

    public Map<String, Long> stats(String tenantId) {
        TenantGovernance state = state(tenantId);
        synchronized (state) {
            return Map.of(
                    "runningModels", state.models.values().stream().filter(item -> "running".equals(item.status())).count(),
                    "activeKeys", state.apiKeys.values().stream().map(StoredApiKey::metadata).filter(item -> "running".equals(item.status())).count(),
                    "prompts", (long) state.prompts.size(),
                    "tools", (long) state.tools.size()
            );
        }
    }

    private void remove(TenantGovernance state, String id, String detail, String kind) {
        synchronized (state) {
            Object removed = switch (kind) {
                case "model" -> state.models.remove(id);
                case "key" -> state.apiKeys.remove(id);
                case "prompt" -> state.prompts.remove(id);
                case "tool" -> state.tools.remove(id);
                default -> null;
            };
            if (removed == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, detail);
            }
        }
    }

    private String toggle(String status) {
        return "running".equals(status) ? "stopped" : "running";
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private TenantGovernance state(String tenantId) {
        return data.computeIfAbsent(tenantId, ignored -> new TenantGovernance());
    }

    private <T> T require(Map<String, T> source, String id, String detail) {
        T value = source.get(id);
        if (value == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, detail);
        }
        return value;
    }

    private <T> List<T> reversed(Iterable<T> values) {
        List<T> result = new ArrayList<>();
        values.forEach(result::add);
        Collections.reverse(result);
        return List.copyOf(result);
    }
}
