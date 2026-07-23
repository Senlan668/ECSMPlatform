package com.shangmei.platform.aibusiness.customer;

import com.shangmei.platform.aibusiness.customer.CustomerModels.Assessment;
import com.shangmei.platform.aibusiness.customer.CustomerModels.Conversation;
import com.shangmei.platform.aibusiness.customer.CustomerModels.ConversationMessage;
import com.shangmei.platform.aibusiness.customer.CustomerModels.CreateAssessment;
import com.shangmei.platform.aibusiness.customer.CustomerModels.CreateKnowledgeRelease;
import com.shangmei.platform.aibusiness.customer.CustomerModels.KnowledgeRelease;
import com.shangmei.platform.aibusiness.customer.CustomerModels.VoiceSession;
import com.shangmei.platform.aibusiness.customer.CustomerModels.VoiceTranscript;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class CustomerService {
    private static final class TenantCustomerState {
        private final Map<String, KnowledgeRelease> releases = new LinkedHashMap<>();
        private final Map<String, Conversation> conversations = new LinkedHashMap<>();
        private final Map<String, VoiceSession> voiceSessions = new LinkedHashMap<>();
        private final Map<String, Assessment> assessments = new LinkedHashMap<>();
        private int visitorSequence;
    }

    private final Map<String, TenantCustomerState> data = new ConcurrentHashMap<>();

    public List<KnowledgeRelease> listReleases(String tenantId) {
        TenantCustomerState state = state(tenantId);
        synchronized (state) {
            return reversed(state.releases.values());
        }
    }

    public KnowledgeRelease createRelease(String tenantId, CreateKnowledgeRelease input) {
        TenantCustomerState state = state(tenantId);
        KnowledgeRelease release = new KnowledgeRelease(
                UUID.randomUUID().toString(), input.name().trim(), input.source().trim(), input.purpose().trim(),
                "draft", "not_connected", Instant.now(), null
        );
        synchronized (state) {
            state.releases.put(release.id(), release);
        }
        return release;
    }

    public KnowledgeRelease publishRelease(String tenantId, String releaseId) {
        TenantCustomerState state = state(tenantId);
        synchronized (state) {
            KnowledgeRelease current = require(state.releases, releaseId, "知识发布不存在");
            if (!"draft".equals(current.status())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "知识版本已经发布");
            }
            KnowledgeRelease updated = new KnowledgeRelease(
                    current.id(), current.name(), current.source(), current.purpose(), "published",
                    current.indexStatus(), current.createdAt(), Instant.now()
            );
            state.releases.put(releaseId, updated);
            return updated;
        }
    }

    public void deleteRelease(String tenantId, String releaseId) {
        TenantCustomerState state = state(tenantId);
        synchronized (state) {
            boolean referenced = state.assessments.values().stream()
                    .anyMatch(assessment -> releaseId.equals(assessment.releaseId()));
            if (referenced) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "知识版本已被考核引用，不能删除");
            }
            if (state.releases.remove(releaseId) == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "知识发布不存在");
            }
        }
    }

    public List<Conversation> listConversations(String tenantId) {
        TenantCustomerState state = state(tenantId);
        synchronized (state) {
            return reversed(state.conversations.values());
        }
    }

    public Conversation createConversation(String tenantId) {
        TenantCustomerState state = state(tenantId);
        synchronized (state) {
            Instant now = Instant.now();
            ConversationMessage initial = new ConversationMessage(
                    UUID.randomUUID().toString(), "system", "会话已建立，等待客户消息。", now
            );
            Conversation conversation = new Conversation(
                    UUID.randomUUID().toString(), "访客 " + (++state.visitorSequence), "bot",
                    List.of(initial), now, now
            );
            state.conversations.put(conversation.id(), conversation);
            return conversation;
        }
    }

    public Conversation appendMessage(String tenantId, String conversationId, String role, String content) {
        TenantCustomerState state = state(tenantId);
        synchronized (state) {
            Conversation current = require(state.conversations, conversationId, "客服会话不存在");
            if ("closed".equals(current.status())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "会话已经结束");
            }
            Instant now = Instant.now();
            List<ConversationMessage> messages = new ArrayList<>(current.messages());
            messages.add(new ConversationMessage(UUID.randomUUID().toString(), role, content.trim(), now));
            if ("customer".equals(role)) {
                messages.add(new ConversationMessage(
                        UUID.randomUUID().toString(),
                        "system",
                        "自动回答未执行：VectorIndex 与模型服务尚未连接，已进入人工接管。",
                        now
                ));
            }
            Conversation updated = new Conversation(
                    current.id(), current.customer(), "human", List.copyOf(messages), current.createdAt(), now
            );
            state.conversations.put(conversationId, updated);
            return updated;
        }
    }

    public Conversation actOnConversation(String tenantId, String conversationId, String action) {
        TenantCustomerState state = state(tenantId);
        synchronized (state) {
            Conversation current = require(state.conversations, conversationId, "客服会话不存在");
            String status = "close".equals(action) ? "closed" : "human";
            if ("closed".equals(current.status()) && !"closed".equals(status)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "已结束会话不能重新接管");
            }
            Conversation updated = new Conversation(
                    current.id(), current.customer(), status, current.messages(), current.createdAt(), Instant.now()
            );
            state.conversations.put(conversationId, updated);
            return updated;
        }
    }

    public List<VoiceSession> listVoiceSessions(String tenantId) {
        TenantCustomerState state = state(tenantId);
        synchronized (state) {
            return reversed(state.voiceSessions.values());
        }
    }

    public VoiceSession createVoiceSession(String tenantId) {
        TenantCustomerState state = state(tenantId);
        String shortId = UUID.randomUUID().toString().substring(0, 8);
        VoiceSession session = new VoiceSession(
                UUID.randomUUID().toString(), "voice-" + shortId, "user-" + shortId,
                "created", "not_started", null, 0, null, List.of(), null, Instant.now(), null
        );
        synchronized (state) {
            state.voiceSessions.put(session.id(), session);
        }
        return session;
    }

    public VoiceSession getVoiceSession(String tenantId, String sessionId) {
        TenantCustomerState state = state(tenantId);
        synchronized (state) {
            return require(state.voiceSessions, sessionId, "语音会话不存在");
        }
    }

    public VoiceSession confirmVoiceConsent(String tenantId, String sessionId) {
        TenantCustomerState state = state(tenantId);
        synchronized (state) {
            VoiceSession current = require(state.voiceSessions, sessionId, "语音会话不存在");
            if ("closed".equals(current.status())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "已关闭会话不能确认通话授权");
            }
            VoiceSession updated = new VoiceSession(
                    current.id(), current.roomId(), current.userId(), current.status(), current.providerStatus(),
                    current.runtimeSessionId(), current.interruptCount(), current.error(), current.transcripts(),
                    current.consentConfirmedAt() == null ? Instant.now() : current.consentConfirmedAt(),
                    current.createdAt(), current.closedAt()
            );
            state.voiceSessions.put(sessionId, updated);
            return updated;
        }
    }

    public VoiceSession markVoiceAccessReady(String tenantId, String sessionId, String roomId, String userId) {
        TenantCustomerState state = state(tenantId);
        synchronized (state) {
            VoiceSession current = require(state.voiceSessions, sessionId, "语音会话不存在");
            if ("closed".equals(current.status())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "已关闭会话不能签发 RTC 凭证");
            }
            boolean active = "active".equals(current.status());
            VoiceSession updated = new VoiceSession(
                    current.id(), roomId, userId, active ? current.status() : "ready",
                    active ? current.providerStatus() : "credentials_issued", current.runtimeSessionId(),
                    current.interruptCount(), null, current.transcripts(), current.consentConfirmedAt(),
                    current.createdAt(), current.closedAt()
            );
            state.voiceSessions.put(sessionId, updated);
            return updated;
        }
    }

    public VoiceSession markVoiceStarted(String tenantId, String sessionId, String runtimeSessionId) {
        TenantCustomerState state = state(tenantId);
        synchronized (state) {
            VoiceSession current = require(state.voiceSessions, sessionId, "语音会话不存在");
            if (!"ready".equals(current.status()) && !"failed".equals(current.status())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "语音会话尚未准备好");
            }
            VoiceSession updated = new VoiceSession(
                    current.id(), current.roomId(), current.userId(), "active", "agent_running", runtimeSessionId,
                    current.interruptCount(), null, current.transcripts(), current.consentConfirmedAt(),
                    current.createdAt(), null
            );
            state.voiceSessions.put(sessionId, updated);
            return updated;
        }
    }

    public VoiceSession markVoiceFailure(String tenantId, String sessionId, String error) {
        TenantCustomerState state = state(tenantId);
        synchronized (state) {
            VoiceSession current = require(state.voiceSessions, sessionId, "语音会话不存在");
            VoiceSession updated = new VoiceSession(
                    current.id(), current.roomId(), current.userId(), "failed", "provider_failed",
                    current.runtimeSessionId(), current.interruptCount(), normalizedVoiceError(error),
                    current.transcripts(), current.consentConfirmedAt(), current.createdAt(), current.closedAt()
            );
            state.voiceSessions.put(sessionId, updated);
            return updated;
        }
    }

    public VoiceSession recordVoiceInterrupt(String tenantId, String sessionId) {
        TenantCustomerState state = state(tenantId);
        synchronized (state) {
            VoiceSession current = require(state.voiceSessions, sessionId, "语音会话不存在");
            if (!"active".equals(current.status())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "只有进行中的会话可以打断智能体");
            }
            VoiceSession updated = new VoiceSession(
                    current.id(), current.roomId(), current.userId(), current.status(), current.providerStatus(),
                    current.runtimeSessionId(), current.interruptCount() + 1, current.error(), current.transcripts(),
                    current.consentConfirmedAt(), current.createdAt(), current.closedAt()
            );
            state.voiceSessions.put(sessionId, updated);
            return updated;
        }
    }

    public VoiceSession appendVoiceTranscript(
            String tenantId,
            String sessionId,
            String role,
            String content,
            boolean interrupted
    ) {
        TenantCustomerState state = state(tenantId);
        synchronized (state) {
            VoiceSession current = require(state.voiceSessions, sessionId, "语音会话不存在");
            List<VoiceTranscript> transcripts = new ArrayList<>(current.transcripts());
            transcripts.add(new VoiceTranscript(
                    UUID.randomUUID().toString(), role, content.trim(), interrupted, Instant.now()
            ));
            VoiceSession updated = new VoiceSession(
                    current.id(), current.roomId(), current.userId(), current.status(), current.providerStatus(),
                    current.runtimeSessionId(), current.interruptCount(), current.error(), List.copyOf(transcripts),
                    current.consentConfirmedAt(), current.createdAt(), current.closedAt()
            );
            state.voiceSessions.put(sessionId, updated);
            return updated;
        }
    }

    public VoiceSession closeVoiceSession(String tenantId, String sessionId) {
        TenantCustomerState state = state(tenantId);
        synchronized (state) {
            VoiceSession current = require(state.voiceSessions, sessionId, "语音会话不存在");
            VoiceSession updated = new VoiceSession(
                    current.id(), current.roomId(), current.userId(), "closed", "stopped", current.runtimeSessionId(),
                    current.interruptCount(), current.error(), current.transcripts(), current.consentConfirmedAt(),
                    current.createdAt(), Instant.now()
            );
            state.voiceSessions.put(sessionId, updated);
            return updated;
        }
    }

    public void deleteVoiceSession(String tenantId, String sessionId) {
        TenantCustomerState state = state(tenantId);
        synchronized (state) {
            if (state.voiceSessions.remove(sessionId) == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "语音会话不存在");
            }
        }
    }

    public List<Assessment> listAssessments(String tenantId) {
        TenantCustomerState state = state(tenantId);
        synchronized (state) {
            return reversed(state.assessments.values());
        }
    }

    public Assessment createAssessment(String tenantId, CreateAssessment input) {
        TenantCustomerState state = state(tenantId);
        synchronized (state) {
            String releaseId = input.releaseId() == null ? "" : input.releaseId().trim();
            if (!releaseId.isEmpty()) {
                KnowledgeRelease release = require(state.releases, releaseId, "知识发布不存在");
                if (!"published".equals(release.status())) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "考核只能引用已发布知识版本");
                }
            }
            Instant now = Instant.now();
            Assessment assessment = new Assessment(
                    UUID.randomUUID().toString(), input.title().trim(), releaseId, input.question().trim(),
                    input.referenceAnswer().trim(), "", "draft", null, null, now, now
            );
            state.assessments.put(assessment.id(), assessment);
            return assessment;
        }
    }

    public Assessment publishAssessment(String tenantId, String assessmentId) {
        return transitionAssessment(tenantId, assessmentId, "draft", "published", null, null);
    }

    public Assessment submitAssessment(String tenantId, String assessmentId, String answer) {
        return transitionAssessment(tenantId, assessmentId, "published", "submitted", answer.trim(), null);
    }

    public Assessment reviewAssessment(String tenantId, String assessmentId, int humanScore) {
        return transitionAssessment(tenantId, assessmentId, "submitted", "reviewed", null, humanScore);
    }

    public void deleteAssessment(String tenantId, String assessmentId) {
        TenantCustomerState state = state(tenantId);
        synchronized (state) {
            if (state.assessments.remove(assessmentId) == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "考核不存在");
            }
        }
    }

    public Map<String, Long> stats(String tenantId) {
        TenantCustomerState state = state(tenantId);
        synchronized (state) {
            return Map.of(
                    "conversations", (long) state.conversations.size(),
                    "humanConversations", state.conversations.values().stream().filter(item -> "human".equals(item.status())).count(),
                    "publishedReleases", state.releases.values().stream().filter(item -> "published".equals(item.status())).count(),
                    "assessments", (long) state.assessments.size(),
                    "reviewedAssessments", state.assessments.values().stream().filter(item -> "reviewed".equals(item.status())).count()
            );
        }
    }

    private Assessment transitionAssessment(
            String tenantId,
            String assessmentId,
            String requiredStatus,
            String nextStatus,
            String answer,
            Integer humanScore
    ) {
        TenantCustomerState state = state(tenantId);
        synchronized (state) {
            Assessment current = require(state.assessments, assessmentId, "考核不存在");
            if (!requiredStatus.equals(current.status())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "考核状态不允许当前操作");
            }
            Assessment updated = new Assessment(
                    current.id(), current.title(), current.releaseId(), current.question(), current.referenceAnswer(),
                    answer == null ? current.answer() : answer, nextStatus, current.aiScore(),
                    humanScore == null ? current.humanScore() : humanScore, current.createdAt(), Instant.now()
            );
            state.assessments.put(assessmentId, updated);
            return updated;
        }
    }

    private String normalizedVoiceError(String error) {
        if (error == null || error.isBlank()) return "Voice 运行时调用失败";
        String normalized = error.replaceAll("[\\r\\n]+", " ").trim();
        return normalized.length() > 500 ? normalized.substring(0, 500) : normalized;
    }

    private TenantCustomerState state(String tenantId) {
        return data.computeIfAbsent(tenantId, ignored -> new TenantCustomerState());
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
