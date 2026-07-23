package com.shangmei.platform.aibusiness.content;

import com.shangmei.platform.aibusiness.content.ContentModels.CalendarEvent;
import com.shangmei.platform.aibusiness.content.ContentModels.ContentBrief;
import com.shangmei.platform.aibusiness.content.ContentModels.CreateBrief;
import com.shangmei.platform.aibusiness.content.ContentModels.CreateCalendarEvent;
import com.shangmei.platform.aibusiness.content.ContentModels.CreateMediaIntent;
import com.shangmei.platform.aibusiness.content.ContentModels.MediaIntent;
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
public class ContentService {
    private static final class TenantContent {
        private final Map<String, ContentBrief> briefs = new LinkedHashMap<>();
        private final Map<String, CalendarEvent> events = new LinkedHashMap<>();
        private final Map<String, MediaIntent> mediaIntents = new LinkedHashMap<>();
    }

    private final Map<String, TenantContent> data = new ConcurrentHashMap<>();

    public List<ContentBrief> listBriefs(String tenantId) {
        TenantContent state = state(tenantId);
        synchronized (state) {
            return reversed(state.briefs.values());
        }
    }

    public ContentBrief createBrief(String tenantId, CreateBrief input) {
        TenantContent state = state(tenantId);
        Instant now = Instant.now();
        ContentBrief brief = new ContentBrief(
                UUID.randomUUID().toString(),
                input.title().trim(),
                input.product().trim(),
                input.goal().trim(),
                input.channel().trim(),
                input.tone().trim(),
                "draft",
                List.of(),
                "",
                "",
                "control-plane",
                now,
                now
        );
        synchronized (state) {
            state.briefs.put(brief.id(), brief);
        }
        return brief;
    }

    public ContentBrief generateTopics(String tenantId, String briefId) {
        TenantContent state = state(tenantId);
        synchronized (state) {
            ContentBrief current = require(state.briefs, briefId, "运营简报不存在");
            if (!List.of("draft", "rejected").contains(current.status())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "当前简报不能重新生成选题");
            }
            List<String> topics = List.of(
                    current.product() + "：购买前最值得确认的 3 个事实",
                    "从真实使用场景看 " + current.product() + " 是否适合你",
                    current.product() + " 常见误区与理性选择清单"
            );
            ContentBrief updated = copyBrief(current, "topic_review", topics, "", "", "fallback");
            state.briefs.put(briefId, updated);
            return updated;
        }
    }

    public ContentBrief selectTopic(String tenantId, String briefId, String topic) {
        TenantContent state = state(tenantId);
        synchronized (state) {
            ContentBrief current = require(state.briefs, briefId, "运营简报不存在");
            if (!"topic_review".equals(current.status()) || !current.topics().contains(topic)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "选题不属于当前候选版本");
            }
            ContentBrief updated = copyBrief(
                    current, current.status(), current.topics(), topic, current.draft(), current.executionMode()
            );
            state.briefs.put(briefId, updated);
            return updated;
        }
    }

    public ContentBrief generateDraft(String tenantId, String briefId) {
        TenantContent state = state(tenantId);
        synchronized (state) {
            ContentBrief current = require(state.briefs, briefId, "运营简报不存在");
            if (!"topic_review".equals(current.status()) || current.selectedTopic().isBlank()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "请先选择候选选题");
            }
            String draft = "# " + current.selectedTopic()
                    + "\n\n目标：" + current.goal()
                    + "\n\n围绕 " + current.product()
                    + " 的真实商品事实、适用场景和限制条件组织内容。当前为运行时未配置时的可审计降级文本。"
                    + "\n\n渠道：" + current.channel()
                    + "\n语气：" + current.tone();
            ContentBrief updated = copyBrief(
                    current, "content_review", current.topics(), current.selectedTopic(), draft, "fallback"
            );
            state.briefs.put(briefId, updated);
            return updated;
        }
    }

    public ContentBrief review(String tenantId, String briefId, String decision) {
        TenantContent state = state(tenantId);
        synchronized (state) {
            ContentBrief current = require(state.briefs, briefId, "运营简报不存在");
            if (!"content_review".equals(current.status())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "只有待审核版本可以审批");
            }
            ContentBrief updated = copyBrief(
                    current, decision, current.topics(), current.selectedTopic(), current.draft(), current.executionMode()
            );
            state.briefs.put(briefId, updated);
            return updated;
        }
    }

    public void deleteBrief(String tenantId, String briefId) {
        TenantContent state = state(tenantId);
        synchronized (state) {
            if (state.briefs.remove(briefId) == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "运营简报不存在");
            }
            state.events.values().removeIf(event -> event.briefId().equals(briefId));
            state.mediaIntents.values().removeIf(intent -> intent.briefId().equals(briefId));
        }
    }

    public List<CalendarEvent> listEvents(String tenantId) {
        TenantContent state = state(tenantId);
        synchronized (state) {
            return reversed(state.events.values());
        }
    }

    public CalendarEvent createEvent(String tenantId, CreateCalendarEvent input) {
        if (input.date() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "发布日期不能为空");
        }
        TenantContent state = state(tenantId);
        synchronized (state) {
            ContentBrief brief = require(state.briefs, input.briefId(), "运营简报不存在");
            requireApproved(brief);
            CalendarEvent event = new CalendarEvent(
                    UUID.randomUUID().toString(), brief.id(), brief.title(), brief.channel(), input.date(),
                    "planned", Instant.now()
            );
            state.events.put(event.id(), event);
            return event;
        }
    }

    public void deleteEvent(String tenantId, String eventId) {
        TenantContent state = state(tenantId);
        synchronized (state) {
            if (state.events.remove(eventId) == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "日历事件不存在");
            }
        }
    }

    public CalendarEvent markEventReady(String tenantId, String eventId) {
        TenantContent state = state(tenantId);
        synchronized (state) {
            CalendarEvent current = require(state.events, eventId, "日历事件不存在");
            CalendarEvent updated = new CalendarEvent(
                    current.id(), current.briefId(), current.title(), current.channel(), current.date(),
                    "ready", current.createdAt()
            );
            state.events.put(eventId, updated);
            return updated;
        }
    }

    public List<MediaIntent> listMediaIntents(String tenantId) {
        TenantContent state = state(tenantId);
        synchronized (state) {
            return reversed(state.mediaIntents.values());
        }
    }

    public MediaIntent createMediaIntent(String tenantId, CreateMediaIntent input) {
        TenantContent state = state(tenantId);
        synchronized (state) {
            ContentBrief brief = require(state.briefs, input.briefId(), "运营简报不存在");
            requireApproved(brief);
            MediaIntent intent = new MediaIntent(
                    UUID.randomUUID().toString(), brief.id(), brief.title(), input.kind(), "blocked",
                    "provider_not_configured", Instant.now()
            );
            state.mediaIntents.put(intent.id(), intent);
            return intent;
        }
    }

    public void deleteMediaIntent(String tenantId, String intentId) {
        TenantContent state = state(tenantId);
        synchronized (state) {
            if (state.mediaIntents.remove(intentId) == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "媒体意图不存在");
            }
        }
    }

    public Map<String, Long> stats(String tenantId) {
        TenantContent state = state(tenantId);
        synchronized (state) {
            return Map.of(
                    "briefs", (long) state.briefs.size(),
                    "approvedBriefs", state.briefs.values().stream().filter(brief -> "approved".equals(brief.status())).count(),
                    "events", (long) state.events.size(),
                    "mediaIntents", (long) state.mediaIntents.size()
            );
        }
    }

    private ContentBrief copyBrief(
            ContentBrief source,
            String status,
            List<String> topics,
            String selectedTopic,
            String draft,
            String executionMode
    ) {
        return new ContentBrief(
                source.id(), source.title(), source.product(), source.goal(), source.channel(), source.tone(),
                status, List.copyOf(topics), selectedTopic, draft, executionMode, source.createdAt(), Instant.now()
        );
    }

    private void requireApproved(ContentBrief brief) {
        if (!"approved".equals(brief.status())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "只有已审核简报可以进入后续流程");
        }
    }

    private TenantContent state(String tenantId) {
        return data.computeIfAbsent(tenantId, ignored -> new TenantContent());
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
