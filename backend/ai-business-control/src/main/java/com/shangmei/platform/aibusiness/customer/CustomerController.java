package com.shangmei.platform.aibusiness.customer;

import com.shangmei.platform.aibusiness.customer.CustomerModels.AppendMessage;
import com.shangmei.platform.aibusiness.customer.CustomerModels.Assessment;
import com.shangmei.platform.aibusiness.customer.CustomerModels.Conversation;
import com.shangmei.platform.aibusiness.customer.CustomerModels.ConversationAction;
import com.shangmei.platform.aibusiness.customer.CustomerModels.CreateAssessment;
import com.shangmei.platform.aibusiness.customer.CustomerModels.CreateKnowledgeRelease;
import com.shangmei.platform.aibusiness.customer.CustomerModels.KnowledgeRelease;
import com.shangmei.platform.aibusiness.customer.CustomerModels.ReviewAssessment;
import com.shangmei.platform.aibusiness.customer.CustomerModels.SubmitAssessment;
import com.shangmei.platform.aibusiness.customer.CustomerModels.VoiceSession;
import com.shangmei.platform.aibusiness.customer.CustomerModels.VoiceSessionAccess;
import com.shangmei.platform.aibusiness.customer.CustomerModels.AppendVoiceTranscript;
import com.shangmei.platform.aibusiness.identity.IdentityModels.TenantPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

import static com.shangmei.platform.aibusiness.identity.TenantAuthenticationFilter.PRINCIPAL_ATTRIBUTE;

@RestController
@RequestMapping("/api/v1/customer-service")
public class CustomerController {
    private final CustomerService customerService;
    private final CustomerVoiceRuntimeService voiceRuntimeService;

    public CustomerController(CustomerService customerService, CustomerVoiceRuntimeService voiceRuntimeService) {
        this.customerService = customerService;
        this.voiceRuntimeService = voiceRuntimeService;
    }

    @GetMapping("/knowledge-releases")
    public List<KnowledgeRelease> listReleases(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal) {
        return customerService.listReleases(principal.tenantId());
    }

    @PostMapping("/knowledge-releases")
    @ResponseStatus(HttpStatus.CREATED)
    public KnowledgeRelease createRelease(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @Valid @RequestBody CreateKnowledgeRelease input
    ) {
        return customerService.createRelease(principal.tenantId(), input);
    }

    @PostMapping("/knowledge-releases/{releaseId}/publish")
    public KnowledgeRelease publishRelease(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String releaseId
    ) {
        return customerService.publishRelease(principal.tenantId(), releaseId);
    }

    @DeleteMapping("/knowledge-releases/{releaseId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteRelease(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String releaseId
    ) {
        customerService.deleteRelease(principal.tenantId(), releaseId);
    }

    @GetMapping("/conversations")
    public List<Conversation> listConversations(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal) {
        return customerService.listConversations(principal.tenantId());
    }

    @PostMapping("/conversations")
    @ResponseStatus(HttpStatus.CREATED)
    public Conversation createConversation(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal) {
        return customerService.createConversation(principal.tenantId());
    }

    @PostMapping("/conversations/{conversationId}/messages")
    public Conversation appendMessage(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String conversationId,
            @Valid @RequestBody AppendMessage input
    ) {
        return customerService.appendMessage(
                principal.tenantId(), conversationId, input.role(), input.content()
        );
    }

    @PostMapping("/conversations/{conversationId}/actions")
    public Conversation actOnConversation(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String conversationId,
            @Valid @RequestBody ConversationAction input
    ) {
        return customerService.actOnConversation(principal.tenantId(), conversationId, input.action());
    }

    @GetMapping("/voice-sessions")
    public List<VoiceSession> listVoiceSessions(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal) {
        return customerService.listVoiceSessions(principal.tenantId());
    }

    @PostMapping("/voice-sessions")
    @ResponseStatus(HttpStatus.CREATED)
    public VoiceSession createVoiceSession(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal) {
        return customerService.createVoiceSession(principal.tenantId());
    }

    @PostMapping("/voice-sessions/{sessionId}/consent")
    public VoiceSession confirmVoiceConsent(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String sessionId
    ) {
        return customerService.confirmVoiceConsent(principal.tenantId(), sessionId);
    }

    @PostMapping("/voice-sessions/{sessionId}/access")
    public VoiceSessionAccess issueVoiceAccess(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String sessionId
    ) {
        return voiceRuntimeService.issueAccess(principal.tenantId(), sessionId);
    }

    @PostMapping("/voice-sessions/{sessionId}/start")
    public VoiceSession startVoiceSession(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String sessionId
    ) {
        return voiceRuntimeService.start(principal.tenantId(), sessionId);
    }

    @PostMapping("/voice-sessions/{sessionId}/interrupts")
    public VoiceSession recordVoiceInterrupt(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String sessionId
    ) {
        return customerService.recordVoiceInterrupt(principal.tenantId(), sessionId);
    }

    @PostMapping("/voice-sessions/{sessionId}/transcripts")
    public VoiceSession appendVoiceTranscript(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String sessionId,
            @Valid @RequestBody AppendVoiceTranscript input
    ) {
        return customerService.appendVoiceTranscript(
                principal.tenantId(), sessionId, input.role(), input.content(), input.interrupted()
        );
    }

    @PostMapping("/voice-sessions/{sessionId}/close")
    public VoiceSession closeVoiceSession(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String sessionId
    ) {
        return voiceRuntimeService.close(principal.tenantId(), sessionId);
    }

    @DeleteMapping("/voice-sessions/{sessionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteVoiceSession(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String sessionId
    ) {
        voiceRuntimeService.delete(principal.tenantId(), sessionId);
    }

    @GetMapping("/assessments")
    public List<Assessment> listAssessments(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal) {
        return customerService.listAssessments(principal.tenantId());
    }

    @PostMapping("/assessments")
    @ResponseStatus(HttpStatus.CREATED)
    public Assessment createAssessment(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @Valid @RequestBody CreateAssessment input
    ) {
        return customerService.createAssessment(principal.tenantId(), input);
    }

    @PostMapping("/assessments/{assessmentId}/publish")
    public Assessment publishAssessment(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String assessmentId
    ) {
        return customerService.publishAssessment(principal.tenantId(), assessmentId);
    }

    @PostMapping("/assessments/{assessmentId}/submit")
    public Assessment submitAssessment(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String assessmentId,
            @Valid @RequestBody SubmitAssessment input
    ) {
        return customerService.submitAssessment(principal.tenantId(), assessmentId, input.answer());
    }

    @PostMapping("/assessments/{assessmentId}/review")
    public Assessment reviewAssessment(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String assessmentId,
            @Valid @RequestBody ReviewAssessment input
    ) {
        return customerService.reviewAssessment(principal.tenantId(), assessmentId, input.humanScore());
    }

    @DeleteMapping("/assessments/{assessmentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAssessment(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String assessmentId
    ) {
        customerService.deleteAssessment(principal.tenantId(), assessmentId);
    }
}
