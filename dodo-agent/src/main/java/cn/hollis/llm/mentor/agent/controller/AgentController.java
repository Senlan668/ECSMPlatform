package cn.hollis.llm.mentor.agent.controller;

import cn.hollis.llm.mentor.agent.agent.deepresearch.PlanExecuteAgent;
import cn.hollis.llm.mentor.agent.agent.file.FileReactAgent;
import cn.hollis.llm.mentor.agent.agent.pptx.PPTBuilderAgent;
import cn.hollis.llm.mentor.agent.agent.websearch.WebSearchReactAgent;
import cn.hollis.llm.mentor.agent.common.AgentResponse;
import cn.hollis.llm.mentor.agent.service.AgentTaskManager;
import cn.hollis.llm.mentor.agent.service.AiSessionService;
import cn.hollis.llm.mentor.agent.tool.FileContentService;
import cn.hollis.llm.mentor.agent.utils.TenantResourceScope;
import io.modelcontextprotocol.client.McpClient;
import io.modelcontextprotocol.client.McpSyncClient;
import io.modelcontextprotocol.client.transport.HttpClientStreamableHttpTransport;
import io.swagger.v3.oas.annotations.Operation;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.mcp.SyncMcpToolCallbackProvider;
import org.springframework.ai.support.ToolCallbacks;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;

import java.net.http.HttpRequest;
import java.time.Duration;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 智能体控制器
 * 提供网页搜索、文件问答和PPT生成的流式接口
 */
@RestController
@RequestMapping("/agent")
@Slf4j
public class AgentController implements InitializingBean {

    public record StreamRequest(String query, String conversationId, String fileId) {
    }

    @Autowired
    private ChatModel chatModel;

    @Autowired
    private AiSessionService sessionService;

    @Autowired
    private AgentTaskManager taskManager;

    @Autowired
    private ObjectProvider<FileContentService> fileContentServiceProvider;

    @Value("${spring.ai.openai.api-key:}")
    private String modelApiKey;

    /**
     * Tavily 搜索引擎 API Key
     */
    @Value("${tavily.api-key}")
    private String tavilyApiKey;

    /**
     * Tavily MCP URL
     */
    @Value("${tavily.mcp-url}")
    private String tavilyMcpUrl;

    /**
     * 网页搜索工具回调
     */
    private ToolCallback[] webSearchToolCallbacks;

    @GetMapping(value = "/chat/stream", produces = "text/event-stream;charset=UTF-8")
    @Operation(summary = "智能问答", description = "接收用户查询并返回流式响应，使用联网搜索获取信息")
    public Flux<String> webSearchStream(@RequestParam(required = true) String query,
                                        @RequestParam(required = true) String conversationId,
                                        @RequestHeader("X-Tenant-Id") String tenantId,
                                        @RequestHeader("X-Subject-Id") String subjectId) {
        log.info("收到网页搜索请求: queryLength={}, conversationId={}", query == null ? 0 : query.length(), conversationId);
        TenantResourceScope.requireConversationAccess(tenantId, subjectId, conversationId);

        if (query == null || query.trim().isEmpty()) {
            log.warn("查询参数为空或无效");
            return Flux.error(new IllegalArgumentException("查询参数不能为空"));
        }
        if (!modelConfigured()) return modelConfigurationError();

        try {
            WebSearchReactAgent webSearchReactAgent = initWebSearchAgent();
            // 使用持久化记忆加载历史记录
            ChatMemory persistentMemory = webSearchReactAgent.createPersistentChatMemory(conversationId, 30);
            webSearchReactAgent.setChatMemory(persistentMemory);
            return webSearchReactAgent.stream(conversationId, query);
        } catch (Exception e) {
            log.error("处理网页搜索请求时发生错误: ", e);
            return Flux.error(e);
        }
    }

    @PostMapping(value = "/chat/stream", consumes = "application/json", produces = "text/event-stream;charset=UTF-8")
    public Flux<String> webSearchStreamPost(
            @RequestBody StreamRequest request,
            @RequestHeader("X-Tenant-Id") String tenantId,
            @RequestHeader("X-Subject-Id") String subjectId
    ) {
        return webSearchStream(request.query(), request.conversationId(), tenantId, subjectId);
    }

    @GetMapping(value = "/file/stream", produces = "text/event-stream;charset=UTF-8")
    @Operation(summary = "文件问答", description = "接收用户查询并返回流式响应，基于上传的文件内容进行问答")
    public Flux<String> fileStream(@RequestParam(required = true) String query,
                                   @RequestParam(required = true) String conversationId,
                                   @RequestParam(required = true) String fileId,
                                   @RequestHeader("X-Tenant-Id") String tenantId,
                                   @RequestHeader("X-Subject-Id") String subjectId) {
        log.info("收到文件问答请求: queryLength={}, conversationId={}, fileId={}", query == null ? 0 : query.length(), conversationId, fileId);
        TenantResourceScope.requireConversationAccess(tenantId, subjectId, conversationId);

        if (query == null || query.trim().isEmpty()) {
            log.warn("查询参数为空或无效");
            return Flux.error(new IllegalArgumentException("查询参数不能为空"));
        }

        if (fileId == null || fileId.trim().isEmpty()) {
            log.warn("文件ID参数为空");
            return Flux.error(new IllegalArgumentException("文件ID不能为空"));
        }
        TenantResourceScope.requireFileAccess(tenantId, fileId);
        if (!modelConfigured()) return modelConfigurationError();

        try {
            FileReactAgent fileReactAgent = initFileReactAgent();
            // 使用持久化记忆加载历史记录
            ChatMemory persistentMemory = fileReactAgent.createPersistentChatMemory(conversationId, 30);
            fileReactAgent.setChatMemory(persistentMemory);
            return fileReactAgent.stream(conversationId, query, fileId);
        } catch (Exception e) {
            log.error("处理文件问答请求时发生错误: ", e);
            return Flux.error(e);
        }
    }

    @PostMapping(value = "/file/stream", consumes = "application/json", produces = "text/event-stream;charset=UTF-8")
    public Flux<String> fileStreamPost(
            @RequestBody StreamRequest request,
            @RequestHeader("X-Tenant-Id") String tenantId,
            @RequestHeader("X-Subject-Id") String subjectId
    ) {
        return fileStream(request.query(), request.conversationId(), request.fileId(), tenantId, subjectId);
    }

    @GetMapping(value = "/pptx/stream", produces = "text/event-stream;charset=UTF-8")
    @Operation(summary = "PPT 生成", description = "接收用户需求并返回流式响应，基于模板驱动生成PPT")
    public Flux<String> pptxStream(@RequestParam(required = true) String query,
                                   @RequestParam(required = true) String conversationId,
                                   @RequestHeader("X-Tenant-Id") String tenantId,
                                   @RequestHeader("X-Subject-Id") String subjectId) {
        log.info("收到PPT Builder请求: queryLength={}, conversationId={}", query == null ? 0 : query.length(), conversationId);
        TenantResourceScope.requireConversationAccess(tenantId, subjectId, conversationId);

        if (query == null || query.trim().isEmpty()) {
            log.warn("查询参数为空或无效");
            return Flux.error(new IllegalArgumentException("查询参数不能为空"));
        }
        if (!modelConfigured()) return modelConfigurationError();

        try {
            PPTBuilderAgent pptBuilderAgent = initPPTBuilderAgent();
            // 使用持久化记忆加载历史记录
            ChatMemory persistentMemory = pptBuilderAgent.createPersistentChatMemory(conversationId, 30);
            pptBuilderAgent.setChatMemory(persistentMemory);
            return pptBuilderAgent.execute(conversationId, query);
        } catch (Exception e) {
            log.error("处理PPT Builder请求时发生错误: ", e);
            return Flux.error(e);
        }
    }

    @PostMapping(value = "/pptx/stream", consumes = "application/json", produces = "text/event-stream;charset=UTF-8")
    public Flux<String> pptxStreamPost(
            @RequestBody StreamRequest request,
            @RequestHeader("X-Tenant-Id") String tenantId,
            @RequestHeader("X-Subject-Id") String subjectId
    ) {
        return pptxStream(request.query(), request.conversationId(), tenantId, subjectId);
    }

    @GetMapping(value = "/deep/stream", produces = "text/event-stream;charset=UTF-8")
    @Operation(summary = "深度研究", description = "接收用户查询并返回流式响应，使用计划-执行模式进行深度研究")
    public Flux<String> deepStream(@RequestParam(required = true) String query,
                                    @RequestParam(required = true) String conversationId,
                                    @RequestHeader("X-Tenant-Id") String tenantId,
                                    @RequestHeader("X-Subject-Id") String subjectId) {
        log.info("收到深度研究请求: queryLength={}, conversationId={}", query == null ? 0 : query.length(), conversationId);
        TenantResourceScope.requireConversationAccess(tenantId, subjectId, conversationId);

        if (query == null || query.trim().isEmpty()) {
            log.warn("查询参数为空或无效");
            return Flux.error(new IllegalArgumentException("查询参数不能为空"));
        }
        if (!modelConfigured()) return modelConfigurationError();

        try {
            PlanExecuteAgent planExecuteAgent = initPlanExecuteAgent();
            // 使用持久化记忆加载历史记录
            ChatMemory persistentMemory = planExecuteAgent.createPersistentChatMemory(conversationId, 30);
            planExecuteAgent.setChatMemory(persistentMemory);
            return planExecuteAgent.stream(conversationId, query);
        } catch (Exception e) {
            log.error("处理深度研究请求时发生错误: ", e);
            return Flux.error(e);
        }
    }

    @PostMapping(value = "/deep/stream", consumes = "application/json", produces = "text/event-stream;charset=UTF-8")
    public Flux<String> deepStreamPost(
            @RequestBody StreamRequest request,
            @RequestHeader("X-Tenant-Id") String tenantId,
            @RequestHeader("X-Subject-Id") String subjectId
    ) {
        return deepStream(request.query(), request.conversationId(), tenantId, subjectId);
    }

    @GetMapping("/stop")
    @Operation(summary = "停止Agent执行", description = "停止指定会话的Agent执行，中断底层调用")
    public Map<String, Object> stopAgent(
            @RequestParam String conversationId,
            @RequestHeader("X-Tenant-Id") String tenantId,
            @RequestHeader("X-Subject-Id") String subjectId
    ) {
        log.info("收到停止请求: conversationId={}", conversationId);
        TenantResourceScope.requireConversationAccess(tenantId, subjectId, conversationId);

        boolean success = taskManager.stopTask(conversationId);

        Map<String, Object> result = new HashMap<>();
        if (success) {
            result.put("success", true);
            result.put("message", "已停止执行");
        } else {
            result.put("success", false);
            result.put("message", "没有找到正在执行的任务或已停止");
        }
        return result;
    }

    @Override
    public void afterPropertiesSet() {
        log.info("开始初始化工具toolcallback");
        webSearchToolCallbacks = new ToolCallback[0];
        if (!StringUtils.hasText(tavilyApiKey)) {
            log.warn("未配置 Tavily API Key，联网搜索工具已禁用");
            return;
        }
        try {
            initWebSearchToolCallbacks();
            log.info("工具toolcallback初始化完成");
        } catch (Exception exception) {
            log.warn("Tavily MCP 初始化失败，联网搜索工具已禁用: {}", exception.getMessage());
        }
    }

    /**
     * 初始化网页搜索工具回调
     */
    private void initWebSearchToolCallbacks() throws Exception {
        log.info("初始化网页搜索工具回调...");

        // tavily 搜索引擎
        String authorizationHeader = "Bearer " + tavilyApiKey;

        HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
                .header("Authorization", authorizationHeader);

        HttpClientStreamableHttpTransport tavTransport = HttpClientStreamableHttpTransport.builder(tavilyMcpUrl)
                .requestBuilder(requestBuilder).build();
        McpSyncClient tavilyMcp = McpClient.sync(tavTransport)
                .requestTimeout(Duration.ofSeconds(120))
                .build();
        tavilyMcp.initialize();

        List<McpSyncClient> mcpClients = List.of(tavilyMcp);
        SyncMcpToolCallbackProvider provider = SyncMcpToolCallbackProvider.builder().mcpClients(mcpClients).build();

        webSearchToolCallbacks = provider.getToolCallbacks();
        log.info("网页搜索工具回调初始化完成，工具数量: {}", webSearchToolCallbacks.length);
    }

    /**
     * 初始化网页搜索 Agent
     */
    private WebSearchReactAgent initWebSearchAgent() {
        log.info("初始化网页搜索 Agent...");

        return WebSearchReactAgent.builder()
                .name("web react")
                .chatModel(chatModel)
                .tools(webSearchToolCallbacks)
                .sessionService(sessionService)
                .taskManager(taskManager)
                .maxRounds(5)
                .build();
    }

    /**
     * 初始化文件问答 Agent
     */
    private FileReactAgent initFileReactAgent() {
        log.info("初始化文件问答 Agent...");

        FileContentService fileContentService = fileContentServiceProvider.getIfAvailable();
        if (fileContentService == null) {
            throw new IllegalStateException("文件检索服务不可用，请检查 PgVector 配置");
        }
        List<ToolCallback> allTools = Arrays.asList(ToolCallbacks.from(fileContentService));

        return FileReactAgent.builder()
                .name("file react")
                .chatModel(chatModel)
                .tools(allTools)
                .sessionService(sessionService)
                .taskManager(taskManager)
                .build();
    }

    /**
     * 初始化PPT Builder Agent
     */
    private PPTBuilderAgent initPPTBuilderAgent() {
        log.info("初始化PPT Builder Agent...");

        return new PPTBuilderAgent(
                chatModel,
                Arrays.asList(webSearchToolCallbacks),
                sessionService,
                taskManager);
    }

    /**
     * 初始化 PlanExecute Agent
     */
    private PlanExecuteAgent initPlanExecuteAgent() {
        log.info("初始化 PlanExecute Agent...");

        return PlanExecuteAgent.builder()
                .chatModel(chatModel)
                .tools(webSearchToolCallbacks)
                .sessionService(sessionService)
                .taskManager(taskManager)
                .maxRounds(3)
                .build();
    }

    private boolean modelConfigured() {
        return StringUtils.hasText(modelApiKey) && !"local-development-placeholder".equals(modelApiKey);
    }

    private Flux<String> modelConfigurationError() {
        return Flux.just(AgentResponse.error("模型密钥未配置，请设置 DODO_OPENAI_API_KEY"));
    }
}
