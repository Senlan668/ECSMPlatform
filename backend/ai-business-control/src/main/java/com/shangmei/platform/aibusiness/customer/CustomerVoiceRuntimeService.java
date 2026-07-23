package com.shangmei.platform.aibusiness.customer;

import com.shangmei.platform.aibusiness.customer.CustomerModels.RtcCredential;
import com.shangmei.platform.aibusiness.customer.CustomerModels.VoiceSession;
import com.shangmei.platform.aibusiness.customer.CustomerModels.VoiceSessionAccess;
import com.shangmei.platform.aibusiness.customer.VoiceRuntimeGateway.RtcAccess;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

@Service
public class CustomerVoiceRuntimeService {
    private final CustomerService customers;
    private final VoiceRuntimeGateway runtime;

    public CustomerVoiceRuntimeService(CustomerService customers, VoiceRuntimeGateway runtime) {
        this.customers = customers;
        this.runtime = runtime;
    }

    public VoiceSessionAccess issueAccess(String tenantId, String sessionId) {
        VoiceSession session = customers.getVoiceSession(tenantId, sessionId);
        if (session.consentConfirmedAt() == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "请先确认通话参与者授权");
        }
        try {
            RtcAccess access = runtime.issueAccess(session.roomId(), session.userId());
            if (!session.roomId().equals(access.roomId()) || !session.userId().equals(access.userId())) {
                throw new IllegalStateException("Voice 运行时返回了不一致的会话身份");
            }
            VoiceSession updated = customers.markVoiceAccessReady(
                    tenantId, sessionId, access.roomId(), access.userId()
            );
            return new VoiceSessionAccess(
                    updated,
                    new RtcCredential(
                            access.appId(), access.roomId(), access.userId(), access.token(),
                            Instant.now().plus(55, ChronoUnit.MINUTES)
                    ),
                    access.agentUserId(),
                    access.interruptSupported()
            );
        } catch (ResponseStatusException exception) {
            customers.markVoiceFailure(tenantId, sessionId, exception.getReason());
            throw exception;
        } catch (RuntimeException exception) {
            customers.markVoiceFailure(tenantId, sessionId, "Voice 运行时返回无效数据");
            throw exception;
        }
    }

    public VoiceSession start(String tenantId, String sessionId) {
        VoiceSession session = customers.getVoiceSession(tenantId, sessionId);
        String runtimeSessionId = "voice-task-" + UUID.randomUUID().toString().replace("-", "");
        try {
            runtime.startAgent(session.roomId(), session.userId(), runtimeSessionId);
            return customers.markVoiceStarted(tenantId, sessionId, runtimeSessionId);
        } catch (ResponseStatusException exception) {
            customers.markVoiceFailure(tenantId, sessionId, exception.getReason());
            throw exception;
        }
    }

    public VoiceSession close(String tenantId, String sessionId) {
        VoiceSession session = customers.getVoiceSession(tenantId, sessionId);
        if ("closed".equals(session.status())) return session;
        if (session.runtimeSessionId() != null && "active".equals(session.status())) {
            try {
                runtime.stopAgent(
                        session.roomId(), session.userId(), session.runtimeSessionId()
                );
            } catch (ResponseStatusException exception) {
                customers.markVoiceFailure(tenantId, sessionId, exception.getReason());
                throw exception;
            }
        }
        return customers.closeVoiceSession(tenantId, sessionId);
    }

    public void delete(String tenantId, String sessionId) {
        VoiceSession session = customers.getVoiceSession(tenantId, sessionId);
        if ("active".equals(session.status())) close(tenantId, sessionId);
        customers.deleteVoiceSession(tenantId, sessionId);
    }
}
