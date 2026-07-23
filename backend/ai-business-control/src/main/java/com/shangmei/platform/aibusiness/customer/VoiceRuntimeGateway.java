package com.shangmei.platform.aibusiness.customer;

public interface VoiceRuntimeGateway {
    record RtcAccess(
            String appId,
            String roomId,
            String userId,
            String token,
            String agentUserId,
            boolean interruptSupported
    ) {
    }

    RtcAccess issueAccess(String roomId, String userId);

    void startAgent(String roomId, String userId, String runtimeSessionId);

    void stopAgent(String roomId, String userId, String runtimeSessionId);
}
