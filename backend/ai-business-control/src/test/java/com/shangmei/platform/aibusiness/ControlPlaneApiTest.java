package com.shangmei.platform.aibusiness;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shangmei.platform.aibusiness.identity.IdentityModels.IntrospectionResponse;
import com.shangmei.platform.aibusiness.identity.IdentityModels.Tenant;
import com.shangmei.platform.aibusiness.identity.IdentityModels.User;
import com.shangmei.platform.aibusiness.identity.IdentityVerifier;
import com.shangmei.platform.aibusiness.asset.LiveClipRuntimeGateway;
import com.shangmei.platform.aibusiness.asset.LiveClipRuntimeGateway.DispatchMetadata;
import com.shangmei.platform.aibusiness.asset.LiveClipRuntimeGateway.RuntimeClip;
import com.shangmei.platform.aibusiness.asset.LiveClipRuntimeGateway.RuntimeTask;
import com.shangmei.platform.aibusiness.customer.VoiceRuntimeGateway;
import com.shangmei.platform.aibusiness.customer.VoiceRuntimeGateway.RtcAccess;
import com.shangmei.platform.aibusiness.knowledge.SalesKnowledgeRuntimeGateway;
import com.shangmei.platform.aibusiness.campaign.ContentCampaignRuntimeGateway;
import com.shangmei.platform.aibusiness.sharedai.SharedAiServicesGateway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.time.Instant;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "platform.limits.content-campaign-request-bytes=1024")
@AutoConfigureMockMvc
@Import(ControlPlaneApiTest.IdentityTestConfiguration.class)
class ControlPlaneApiTest {
    private static final String AUTHORIZATION = "Bearer integration-test-token";
    private static final String TENANT_A = "tenant-a";
    private static final String TENANT_B = "tenant-b";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void tenantContextIsRequiredAndValidated() throws Exception {
        mockMvc.perform(get("/api/v1/assets/clip-tasks").header("Authorization", AUTHORIZATION))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("缺少租户上下文"));

        mockMvc.perform(get("/api/v1/assets/clip-tasks")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", "tenant-not-authorized"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("TENANT_NOT_FOUND"));
    }

    @Test
    void assetRecordsAreIsolatedByTrustedTenant() throws Exception {
        mockMvc.perform(post("/api/v1/assets/clip-tasks")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fileName":"demo.mp4","fileSize":1024,"scene":"电商直播"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("queued"));

        mockMvc.perform(get("/api/v1/assets/clip-tasks")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_B))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void localMediaEventsAndSegmentsAreRecordedByTenant() throws Exception {
        String createBody = mockMvc.perform(post("/api/v1/assets/clip-tasks")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fileName":"live.mp4","fileSize":4096,"scene":"电商直播"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.audioStatus").value("pending"))
                .andExpect(jsonPath("$.segments.length()").value(0))
                .andReturn().getResponse().getContentAsString();
        String taskId = objectMapper.readTree(createBody).path("id").asText();

        mockMvc.perform(post("/api/v1/assets/clip-tasks/{id}/audio-extraction", taskId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"ready","audioFileName":"live.mp3","audioFileSize":512,"videoStartOffset":0,"videoDuration":120}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.audioStatus").value("ready"))
                .andExpect(jsonPath("$.audioFileName").value("live.mp3"));

        mockMvc.perform(post("/api/v1/assets/clip-tasks/{id}/segments", taskId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"商品卖点","startTime":10.5,"endTime":35.25}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.segments[0].clipIndex").value(1))
                .andExpect(jsonPath("$.segments[0].title").value("商品卖点"));

        mockMvc.perform(post("/api/v1/assets/clip-tasks/{id}/exports", taskId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"succeeded\":1,\"failed\":0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lastExport.succeeded").value(1));

        mockMvc.perform(get("/api/v1/assets/clip-tasks")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_B))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == '%s')]", taskId).isEmpty());
    }

    @Test
    void clipSegmentRejectsInvalidOrOutOfBoundsTimeRange() throws Exception {
        String createBody = mockMvc.perform(post("/api/v1/assets/clip-tasks")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fileName\":\"range.mp4\",\"fileSize\":2048,\"scene\":\"课程精华\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String taskId = objectMapper.readTree(createBody).path("id").asText();

        mockMvc.perform(post("/api/v1/assets/clip-tasks/{id}/audio-extraction", taskId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"ready\",\"audioFileName\":\"range.mp3\",\"audioFileSize\":256,\"videoDuration\":60}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/assets/clip-tasks/{id}/segments", taskId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"越界片段\",\"startTime\":50,\"endTime\":70}"))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/v1/assets/clip-tasks/{id}/segments", taskId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"倒序片段\",\"startTime\":30,\"endTime\":20}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void audioDispatchAndRuntimeResultsStayBehindTenantControlPlane() throws Exception {
        String createBody = mockMvc.perform(post("/api/v1/assets/clip-tasks")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fileName\":\"runtime.mp4\",\"fileSize\":4096,\"scene\":\"电商直播\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String taskId = objectMapper.readTree(createBody).path("id").asText();

        mockMvc.perform(post("/api/v1/assets/clip-tasks/{id}/audio-extraction", taskId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"ready\",\"audioFileName\":\"runtime.mp3\",\"audioFileSize\":512,\"videoDuration\":90}"))
                .andExpect(status().isOk());

        MockMultipartFile audio = new MockMultipartFile(
                "audio", "runtime.mp3", "audio/mpeg", new byte[512]
        );
        mockMvc.perform(multipart("/api/v1/assets/clip-tasks/{id}/dispatch", taskId)
                        .file(audio)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("transcribing"))
                .andExpect(jsonPath("$.runtimeTaskId").isNotEmpty());

        String syncBody = mockMvc.perform(post("/api/v1/assets/clip-tasks/{id}/sync", taskId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("review"))
                .andExpect(jsonPath("$.runtimeProgress").value(100))
                .andExpect(jsonPath("$.segments[0].source").value("ai"))
                .andExpect(jsonPath("$.segments[0].viralityScore").value(9))
                .andReturn().getResponse().getContentAsString();
        String segmentId = objectMapper.readTree(syncBody).path("segments").path(0).path("id").asText();

        mockMvc.perform(post("/api/v1/assets/clip-tasks/{taskId}/segments/{segmentId}/viral-titles", taskId, segmentId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.segments[0].viralTitles[1]").value("标题二"));

        mockMvc.perform(post("/api/v1/assets/clip-tasks/{taskId}/segments/{segmentId}/editing-guide", taskId, segmentId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.segments[0].editingGuide.rhythm").value("紧凑"));

        mockMvc.perform(post("/api/v1/assets/clip-tasks/{id}/sync", taskId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_B))
                .andExpect(status().isNotFound());
    }

    @Test
    void contentWorkflowRejectsSkippedTransitions() throws Exception {
        String createBody = mockMvc.perform(post("/api/v1/content/briefs")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"新品内容","product":"测试商品","goal":"建立认知","channel":"小红书","tone":"可信"}
                                """))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String briefId = objectMapper.readTree(createBody).path("id").asText();

        mockMvc.perform(post("/api/v1/content/briefs/{id}/draft", briefId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A))
                .andExpect(status().isConflict());

        String topicsBody = mockMvc.perform(post("/api/v1/content/briefs/{id}/topics", briefId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("topic_review"))
                .andReturn().getResponse().getContentAsString();
        String topic = objectMapper.readTree(topicsBody).path("topics").get(0).asText();

        mockMvc.perform(post("/api/v1/content/briefs/{id}/topic", briefId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of("topic", topic))))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/content/briefs/{id}/draft", briefId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("content_review"));
        mockMvc.perform(post("/api/v1/content/briefs/{id}/review", briefId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"approved\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("approved"));
    }

    @Test
    void apiKeySecretIsReturnedOnlyAtCreation() throws Exception {
        String createBody = mockMvc.perform(post("/api/v1/governance/api-keys")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"integration key\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.apiKey.status").value("running"))
                .andReturn().getResponse().getContentAsString();
        JsonNode created = objectMapper.readTree(createBody);
        String secret = created.path("secret").asText();
        assertThat(secret).startsWith("smz_").hasSizeGreaterThan(30);

        String listBody = mockMvc.perform(get("/api/v1/governance/api-keys")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(listBody).doesNotContain(secret).doesNotContain("secretHash");
    }

    @Test
    void customerAssessmentRequiresPublishedKnowledgeAndHumanReview() throws Exception {
        String releaseBody = mockMvc.perform(post("/api/v1/customer-service/knowledge-releases")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"售前知识\",\"source\":\"人工文档\",\"purpose\":\"销售训练\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String releaseId = objectMapper.readTree(releaseBody).path("id").asText();

        mockMvc.perform(post("/api/v1/customer-service/knowledge-releases/{id}/publish", releaseId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A))
                .andExpect(status().isOk());

        String assessmentBody = mockMvc.perform(post("/api/v1/customer-service/assessments")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of(
                                "title", "产品事实考核",
                                "releaseId", releaseId,
                                "question", "适用条件是什么？",
                                "referenceAnswer", "依据商品事实说明适用条件"
                        ))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String assessmentId = objectMapper.readTree(assessmentBody).path("id").asText();

        mockMvc.perform(post("/api/v1/customer-service/assessments/{id}/publish", assessmentId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/customer-service/assessments/{id}/submit", assessmentId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answer\":\"结合适用场景与限制回答\"}"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/customer-service/assessments/{id}/review", assessmentId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"humanScore\":88}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("reviewed"))
                .andExpect(jsonPath("$.humanScore").value(88));
    }

    @Test
    void rtcCredentialsAndVoiceLifecycleAreTenantScoped() throws Exception {
        String createBody = mockMvc.perform(post("/api/v1/customer-service/voice-sessions")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("created"))
                .andReturn().getResponse().getContentAsString();
        String sessionId = objectMapper.readTree(createBody).path("id").asText();

        mockMvc.perform(post("/api/v1/customer-service/voice-sessions/{id}/access", sessionId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_B))
                .andExpect(status().isNotFound());

        mockMvc.perform(post("/api/v1/customer-service/voice-sessions/{id}/access", sessionId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A))
                .andExpect(status().isConflict());

        mockMvc.perform(post("/api/v1/customer-service/voice-sessions/{id}/consent", sessionId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_B))
                .andExpect(status().isNotFound());

        mockMvc.perform(post("/api/v1/customer-service/voice-sessions/{id}/consent", sessionId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.consentConfirmedAt").isNotEmpty());

        mockMvc.perform(post("/api/v1/customer-service/voice-sessions/{id}/access", sessionId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.session.status").value("ready"))
                .andExpect(jsonPath("$.rtc.token").value("rtc-test-token"))
                .andExpect(jsonPath("$.agentUserId").value("AiAgent"));

        mockMvc.perform(post("/api/v1/customer-service/voice-sessions/{id}/start", sessionId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("active"))
                .andExpect(jsonPath("$.runtimeSessionId").isNotEmpty());

        mockMvc.perform(post("/api/v1/customer-service/voice-sessions/{id}/access", sessionId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.session.status").value("active"));

        mockMvc.perform(post("/api/v1/customer-service/voice-sessions/{id}/transcripts", sessionId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"customer\",\"content\":\"请介绍商品\",\"interrupted\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.transcripts[0].content").value("请介绍商品"));

        mockMvc.perform(post("/api/v1/customer-service/voice-sessions/{id}/interrupts", sessionId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.interruptCount").value(1));

        mockMvc.perform(post("/api/v1/customer-service/voice-sessions/{id}/close", sessionId)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("closed"));

        String listBody = mockMvc.perform(get("/api/v1/customer-service/voice-sessions")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(listBody).doesNotContain("rtc-test-token");
    }

    @Test
    void salesKnowledgeRuntimeIsWhitelistedAndReceivesTrustedTenant() throws Exception {
        var result = mockMvc.perform(get("/api/v1/sales-knowledge/students/list")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_B))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(result))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tenantId").value(TENANT_B))
                .andExpect(jsonPath("$.path").value("/students/list"));

        mockMvc.perform(get("/api/v1/sales-knowledge/auth/login")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A))
                .andExpect(status().isNotFound());

        var capabilities = mockMvc.perform(get("/api/v1/sales-knowledge/runtime/capabilities")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(capabilities))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tenantId").value(TENANT_A))
                .andExpect(jsonPath("$.path").value("/runtime/capabilities"));
    }

    @Test
    void salesKnowledgeMultipartIsReconstructedAsAStream() throws Exception {
        MockMultipartFile database = new MockMultipartFile(
                "files", "MicroMsg.db", MediaType.APPLICATION_OCTET_STREAM_VALUE, "SQLite format 3\0payload".getBytes(StandardCharsets.UTF_8)
        );

        var result = mockMvc.perform(multipart("/api/v1/sales-knowledge/admin/etl/upload")
                        .file(database)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_B))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(result))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tenantId").value(TENANT_B))
                .andExpect(jsonPath("$.path").value("/admin/etl/upload"))
                .andExpect(jsonPath("$.partCount").value(1))
                .andExpect(jsonPath("$.firstFilename").value("MicroMsg.db"))
                .andExpect(jsonPath("$.streamedBytes").value(database.getSize()));
    }

    @Test
    void contentCampaignProxyForwardsTrustedTenantAndSubject() throws Exception {
        var result = mockMvc.perform(post("/api/v1/content-campaign/workflow/start")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"topic_direction\":\"电商增长\"}"))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(result))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tenantId").value(TENANT_A))
                .andExpect(jsonPath("$.subjectId").value("test-user"))
                .andExpect(jsonPath("$.subjectUsername").value("tester"))
                .andExpect(jsonPath("$.subjectName").value("测试用户"))
                .andExpect(jsonPath("$.path").value("/workflow/start"));
    }

    @Test
    void contentCampaignProxyRejectsUnlistedRuntimeModules() throws Exception {
        mockMvc.perform(get("/api/v1/content-campaign/auth/login")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A))
                .andExpect(status().isNotFound());
    }

    @Test
    void contentCampaignProxyForwardsRangeAndMediaHeaders() throws Exception {
        var result = mockMvc.perform(get("/api/v1/content-campaign/static/images/poster.png")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .header("Range", "bytes=0-3"))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(result))
                .andExpect(status().isPartialContent())
                .andExpect(header().string("Content-Range", "bytes 0-3/8"))
                .andExpect(header().string("Accept-Ranges", "bytes"))
                .andExpect(content().contentType(MediaType.IMAGE_PNG))
                .andExpect(content().bytes("PNG!".getBytes(StandardCharsets.US_ASCII)));
    }

    @Test
    void contentCampaignProxyStreamsServerSentEvents() throws Exception {
        var result = mockMvc.perform(get("/api/v1/content-campaign/poster/batch/task-1/stream")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(result))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM))
                .andExpect(header().string("X-Accel-Buffering", "no"))
                .andExpect(content().string("data: {\"status\":\"completed\"}\n\n"));
    }

    @Test
    void contentCampaignProxyReconstructsMultipartRequests() throws Exception {
        MockMultipartFile logo = new MockMultipartFile(
                "logo", "brand.png", MediaType.IMAGE_PNG_VALUE, "PNG!".getBytes(StandardCharsets.US_ASCII)
        );
        var result = mockMvc.perform(multipart("/api/v1/content-campaign/profile/avatar")
                        .file(logo)
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_B))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(result))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tenantId").value(TENANT_B))
                .andExpect(jsonPath("$.partCount").value(1))
                .andExpect(jsonPath("$.firstFilename").value("brand.png"))
                .andExpect(jsonPath("$.streamedBytes").value(4));
    }

    @Test
    void contentCampaignProxyRejectsOversizedAndInvalidRangeRequests() throws Exception {
        mockMvc.perform(post("/api/v1/content-campaign/workflow/start")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("x".repeat(1025)))
                .andExpect(status().isPayloadTooLarge());

        mockMvc.perform(get("/api/v1/content-campaign/static/images/poster.png")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .header("Range", "items=0-3"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void sharedAiServicesReceiveTrustedTenantAndSubject() throws Exception {
        mockMvc.perform(get("/api/v1/governance/shared-services/prompt-hub/tools")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_B))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tenantId").value(TENANT_B))
                .andExpect(jsonPath("$.subjectId").value("test-user"))
                .andExpect(jsonPath("$.service").value("prompt-hub"));

        mockMvc.perform(post("/api/v1/governance/shared-services/tools/call")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "service":"memory-service",
                                  "tool":"recall_memory",
                                  "arguments":{"project_id":"tenant-b","session_id":"session-1"}
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tenantId").value(TENANT_A))
                .andExpect(jsonPath("$.subjectId").value("test-user"))
                .andExpect(jsonPath("$.tool").value("recall_memory"));
    }

    @Test
    void sharedAiServicesRejectUnknownServicesAndInvalidArguments() throws Exception {
        mockMvc.perform(get("/api/v1/governance/shared-services/unknown/tools")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A))
                .andExpect(status().isNotFound());

        mockMvc.perform(post("/api/v1/governance/shared-services/tools/call")
                        .header("Authorization", AUTHORIZATION)
                        .header("X-Tenant-Id", TENANT_A)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"service":"memory-service","tool":"recall_memory","arguments":[]}
                                """))
                .andExpect(status().isBadRequest());
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class IdentityTestConfiguration {
        @Bean
        @Primary
        IdentityVerifier testIdentityVerifier() {
            return authorization -> new IntrospectionResponse(
                    true,
                    Instant.now().plusSeconds(3600),
                    new User("test-user", "测试用户", "tester"),
                    List.of(
                            new Tenant(TENANT_A, "租户 A", "test"),
                            new Tenant(TENANT_B, "租户 B", "test")
                    ),
                    TENANT_A
            );
        }

        @Bean
        @Primary
        LiveClipRuntimeGateway testLiveClipRuntimeGateway() {
            return new LiveClipRuntimeGateway() {
                private final Map<String, RuntimeTask> tasks = new ConcurrentHashMap<>();

                @Override
                public RuntimeTask dispatch(MultipartFile audio, DispatchMetadata metadata) {
                    String id = UUID.randomUUID().toString();
                    RuntimeTask task = new RuntimeTask(id, "pending", 0, "等待处理", null, List.of());
                    tasks.put(id, task);
                    return task;
                }

                @Override
                public RuntimeTask dispatchVideo(MultipartFile video, DispatchMetadata metadata) {
                    return dispatch(video, metadata);
                }

                @Override
                public RuntimeTask getTask(String runtimeTaskId) {
                    RuntimeClip clip = new RuntimeClip(
                            "clip-1", 1, "商品卖点", "核心卖点摘要", "高光", 10, 35,
                            9, "建议字幕", List.of("标题一"), Map.of("rhythm", "紧凑")
                    );
                    RuntimeTask task = new RuntimeTask(
                            runtimeTaskId, "done", 100, "分析完成", null, List.of(clip)
                    );
                    tasks.put(runtimeTaskId, task);
                    return task;
                }

                @Override
                public RuntimeTask retryTask(String runtimeTaskId) {
                    RuntimeTask task = new RuntimeTask(runtimeTaskId, "pending", 0, "等待重试", null, List.of());
                    tasks.put(runtimeTaskId, task);
                    return task;
                }

                @Override
                public RuntimeTask renameTask(String runtimeTaskId, String fileName) {
                    RuntimeTask current = tasks.getOrDefault(
                            runtimeTaskId,
                            new RuntimeTask(runtimeTaskId, "pending", 0, "等待处理", null, List.of())
                    );
                    tasks.put(runtimeTaskId, current);
                    return current;
                }

                @Override
                public List<String> generateViralTitles(String runtimeClipId) {
                    return List.of("标题一", "标题二");
                }

                @Override
                public Map<String, Object> generateEditingGuide(String runtimeClipId) {
                    return Map.of("rhythm", "紧凑", "subtitle", "突出价格锚点");
                }

                @Override
                public void deleteTask(String runtimeTaskId) {
                    tasks.remove(runtimeTaskId);
                }
            };
        }

        @Bean
        @Primary
        VoiceRuntimeGateway testVoiceRuntimeGateway() {
            return new VoiceRuntimeGateway() {
                @Override
                public RtcAccess issueAccess(String roomId, String userId) {
                    return new RtcAccess("rtc-app", roomId, userId, "rtc-test-token", "AiAgent", true);
                }

                @Override
                public void startAgent(String roomId, String userId, String runtimeSessionId) {
                    // Provider behavior is covered by the gateway contract in this integration test.
                }

                @Override
                public void stopAgent(String roomId, String userId, String runtimeSessionId) {
                    // Provider behavior is covered by the gateway contract in this integration test.
                }
            };
        }

        @Bean
        @Primary
        SalesKnowledgeRuntimeGateway testSalesKnowledgeRuntimeGateway(ObjectMapper objectMapper) {
            return new SalesKnowledgeRuntimeGateway() {
                @Override
                public RuntimeResponse forward(String tenantId, String method, String path, String query, String contentType, String accept, byte[] body) {
                    return response(Map.of(
                            "tenantId", tenantId,
                            "method", method,
                            "path", path
                    ));
                }

                @Override
                public RuntimeResponse forwardMultipart(String tenantId, String method, String path, String query, String accept, List<MultipartPart> parts) {
                    long streamedBytes = 0;
                    try {
                        for (MultipartPart part : parts) {
                            try (var input = part.source().open()) {
                                streamedBytes += input.readAllBytes().length;
                            }
                        }
                    } catch (Exception exception) {
                        throw new IllegalStateException(exception);
                    }
                    return response(Map.of(
                            "tenantId", tenantId,
                            "method", method,
                            "path", path,
                            "partCount", parts.size(),
                            "firstFilename", parts.getFirst().filename(),
                            "streamedBytes", streamedBytes
                    ));
                }

                private RuntimeResponse response(Map<String, Object> body) {
                    byte[] payload;
                    try {
                        payload = objectMapper.writeValueAsBytes(body);
                    } catch (Exception exception) {
                        throw new IllegalStateException(exception);
                    }
                    return new RuntimeResponse(
                            200,
                            new ByteArrayInputStream(payload),
                            MediaType.APPLICATION_JSON_VALUE,
                            null,
                            (long) payload.length,
                            Map.of()
                    );
                }
            };
        }

        @Bean
        @Primary
        ContentCampaignRuntimeGateway testContentCampaignRuntimeGateway(ObjectMapper objectMapper) {
            return new ContentCampaignRuntimeGateway() {
                @Override
                public RuntimeResponse forward(
                        String tenantId, String subjectId, String subjectUsername, String subjectName, String traceId,
                        String method, String path, String query, String contentType, String accept, String range, byte[] body
                ) {
                    if (path.startsWith("/static/")) {
                        byte[] payload = "PNG!".getBytes(StandardCharsets.US_ASCII);
                        return new RuntimeResponse(
                                206,
                                new ByteArrayInputStream(payload),
                                MediaType.IMAGE_PNG_VALUE,
                                null,
                                (long) payload.length,
                                Map.of(
                                        "Content-Range", List.of("bytes 0-3/8"),
                                        "Accept-Ranges", List.of("bytes")
                                )
                        );
                    }
                    if (path.endsWith("/stream")) {
                        byte[] payload = "data: {\"status\":\"completed\"}\n\n".getBytes(StandardCharsets.UTF_8);
                        return new RuntimeResponse(
                                200,
                                new ByteArrayInputStream(payload),
                                MediaType.TEXT_EVENT_STREAM_VALUE,
                                null,
                                null,
                                Map.of("X-Accel-Buffering", List.of("no"))
                        );
                    }
                    return response(Map.of(
                            "tenantId", tenantId,
                            "subjectId", subjectId,
                            "subjectUsername", subjectUsername,
                            "subjectName", subjectName,
                            "method", method,
                            "path", path,
                            "range", range == null ? "" : range
                    ));
                }

                @Override
                public RuntimeResponse forwardMultipart(
                        String tenantId, String subjectId, String subjectUsername, String subjectName, String traceId,
                        String method, String path, String query, String accept, List<MultipartPart> parts
                ) {
                    long streamedBytes;
                    try (var input = parts.getFirst().source().open()) {
                        streamedBytes = input.readAllBytes().length;
                    } catch (Exception exception) {
                        throw new IllegalStateException(exception);
                    }
                    return response(Map.of(
                            "tenantId", tenantId,
                            "subjectId", subjectId,
                            "subjectName", subjectName,
                            "method", method,
                            "path", path,
                            "partCount", parts.size(),
                            "firstFilename", parts.getFirst().filename(),
                            "streamedBytes", streamedBytes
                    ));
                }

                private RuntimeResponse response(Map<String, Object> body) {
                    byte[] payload;
                    try {
                        payload = objectMapper.writeValueAsBytes(body);
                    } catch (Exception exception) {
                        throw new IllegalStateException(exception);
                    }
                    return new RuntimeResponse(
                            200,
                            new ByteArrayInputStream(payload),
                            MediaType.APPLICATION_JSON_VALUE,
                            null,
                            (long) payload.length,
                            Map.of()
                    );
                }
            };
        }

        @Bean
        @Primary
        SharedAiServicesGateway testSharedAiServicesGateway(ObjectMapper objectMapper) {
            return new SharedAiServicesGateway() {
                private JsonNode response(
                        String tenantId,
                        String subjectId,
                        String operation,
                        String service,
                        String name,
                        JsonNode arguments
                ) {
                    var result = objectMapper.createObjectNode()
                            .put("tenantId", tenantId)
                            .put("subjectId", subjectId)
                            .put("operation", operation);
                    if (service != null) result.put("service", service);
                    if (name != null) result.put(operation.equals("call") ? "tool" : "prompt", name);
                    if (arguments != null) result.set("arguments", arguments);
                    return result;
                }

                @Override
                public JsonNode health(String tenantId, String subjectId, String traceId) {
                    return response(tenantId, subjectId, "health", null, null, null);
                }

                @Override
                public JsonNode listTools(String tenantId, String subjectId, String traceId, String service) {
                    return response(tenantId, subjectId, "tools", service, null, null);
                }

                @Override
                public JsonNode callTool(String tenantId, String subjectId, String traceId, String service, String tool, JsonNode arguments) {
                    return response(tenantId, subjectId, "call", service, tool, arguments);
                }

                @Override
                public JsonNode listPrompts(String tenantId, String subjectId, String traceId, String service) {
                    return response(tenantId, subjectId, "prompts", service, null, null);
                }

                @Override
                public JsonNode renderPrompt(String tenantId, String subjectId, String traceId, String service, String prompt, JsonNode arguments) {
                    return response(tenantId, subjectId, "render", service, prompt, arguments);
                }

                @Override
                public JsonNode quota(String tenantId, String subjectId, String traceId) {
                    return response(tenantId, subjectId, "quota", null, null, null);
                }

                @Override
                public JsonNode agentChat(
                        String tenantId, String subjectId, String traceId, String agent,
                        String message, String sessionId, String style
                ) {
                    var arguments = objectMapper.createObjectNode()
                            .put("message", message)
                            .put("sessionId", sessionId == null ? "" : sessionId)
                            .put("style", style);
                    return response(tenantId, subjectId, "agent-chat", agent, null, arguments);
                }

                @Override
                public JsonNode clearAgentSession(
                        String tenantId, String subjectId, String traceId, String agent, String sessionId
                ) {
                    return response(
                            tenantId, subjectId, "agent-clear", agent, null,
                            objectMapper.createObjectNode().put("sessionId", sessionId)
                    );
                }

                @Override
                public JsonNode agentProfile(String tenantId, String subjectId, String traceId, String agent) {
                    return response(tenantId, subjectId, "agent-profile", agent, null, null);
                }
            };
        }
    }
}
