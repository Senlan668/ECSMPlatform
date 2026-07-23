package com.shangmei.platform.aibusiness.content;

import com.shangmei.platform.aibusiness.content.ContentModels.CalendarEvent;
import com.shangmei.platform.aibusiness.content.ContentModels.ContentBrief;
import com.shangmei.platform.aibusiness.content.ContentModels.CreateBrief;
import com.shangmei.platform.aibusiness.content.ContentModels.CreateCalendarEvent;
import com.shangmei.platform.aibusiness.content.ContentModels.CreateMediaIntent;
import com.shangmei.platform.aibusiness.content.ContentModels.MediaIntent;
import com.shangmei.platform.aibusiness.content.ContentModels.ReviewDecision;
import com.shangmei.platform.aibusiness.content.ContentModels.SelectTopic;
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
@RequestMapping("/api/v1/content")
public class ContentController {
    private final ContentService contentService;

    public ContentController(ContentService contentService) {
        this.contentService = contentService;
    }

    @GetMapping("/briefs")
    public List<ContentBrief> listBriefs(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal) {
        return contentService.listBriefs(principal.tenantId());
    }

    @PostMapping("/briefs")
    @ResponseStatus(HttpStatus.CREATED)
    public ContentBrief createBrief(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @Valid @RequestBody CreateBrief input
    ) {
        return contentService.createBrief(principal.tenantId(), input);
    }

    @PostMapping("/briefs/{briefId}/topics")
    public ContentBrief generateTopics(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String briefId
    ) {
        return contentService.generateTopics(principal.tenantId(), briefId);
    }

    @PostMapping("/briefs/{briefId}/topic")
    public ContentBrief selectTopic(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String briefId,
            @Valid @RequestBody SelectTopic input
    ) {
        return contentService.selectTopic(principal.tenantId(), briefId, input.topic());
    }

    @PostMapping("/briefs/{briefId}/draft")
    public ContentBrief generateDraft(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String briefId
    ) {
        return contentService.generateDraft(principal.tenantId(), briefId);
    }

    @PostMapping("/briefs/{briefId}/review")
    public ContentBrief review(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String briefId,
            @Valid @RequestBody ReviewDecision input
    ) {
        return contentService.review(principal.tenantId(), briefId, input.decision());
    }

    @DeleteMapping("/briefs/{briefId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteBrief(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String briefId
    ) {
        contentService.deleteBrief(principal.tenantId(), briefId);
    }

    @GetMapping("/calendar-events")
    public List<CalendarEvent> listEvents(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal) {
        return contentService.listEvents(principal.tenantId());
    }

    @PostMapping("/calendar-events")
    @ResponseStatus(HttpStatus.CREATED)
    public CalendarEvent createEvent(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @Valid @RequestBody CreateCalendarEvent input
    ) {
        return contentService.createEvent(principal.tenantId(), input);
    }

    @DeleteMapping("/calendar-events/{eventId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteEvent(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String eventId
    ) {
        contentService.deleteEvent(principal.tenantId(), eventId);
    }

    @PostMapping("/calendar-events/{eventId}/ready")
    public CalendarEvent markEventReady(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String eventId
    ) {
        return contentService.markEventReady(principal.tenantId(), eventId);
    }

    @GetMapping("/media-intents")
    public List<MediaIntent> listMediaIntents(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal) {
        return contentService.listMediaIntents(principal.tenantId());
    }

    @PostMapping("/media-intents")
    @ResponseStatus(HttpStatus.CREATED)
    public MediaIntent createMediaIntent(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @Valid @RequestBody CreateMediaIntent input
    ) {
        return contentService.createMediaIntent(principal.tenantId(), input);
    }

    @DeleteMapping("/media-intents/{intentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteMediaIntent(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String intentId
    ) {
        contentService.deleteMediaIntent(principal.tenantId(), intentId);
    }
}
