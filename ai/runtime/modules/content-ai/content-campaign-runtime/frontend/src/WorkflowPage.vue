<template>
  <div class="flex-1 min-h-full bg-slate-50 w-full relative flex">
    
    <!-- 消息提示 (Toast) -->
    <Transition name="fade">
      <div v-if="message" class="fixed top-8 right-8 z-[100] p-4 rounded-xl shadow-lg shadow-black/5 border text-sm font-medium transition-all max-w-sm flex items-start gap-3"
           :class="messageType === 'error' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-green-50 text-green-700 border-green-200'">
        <span class="text-lg leading-none mt-0.5">{{ messageType === 'error' ? '⚠️' : '✅' }}</span>
        <span class="flex-1">{{ message }}</span>
      </div>
    </Transition>

    <!-- 左侧：工作流主内容 -->
    <div class="flex-1 p-4 md:p-8 overflow-y-auto min-w-0">
    <div class="max-w-4xl mx-auto flex flex-col gap-8 pb-24">
      <!-- 工作流进度条 -->
      <WorkflowSteps :currentStep="currentStep" />

      <!-- 主界面：单列居中布局 -->
      <div class="flex flex-col gap-8">
        
        <!-- 主体操作区 -->
        <div class="flex flex-col gap-6">
          
          <!-- 当前工作流信息（步骤0以外时显示主题方向） -->
          <Transition name="fade">
            <div v-if="currentStep > 0 && topicDirection" class="bg-white/60 backdrop-blur-sm p-5 rounded-2xl shadow-sm border border-slate-200/60">
              <h3 class="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                <span class="text-blue-500">📌</span> 当前创作主题
              </h3>
              <div class="space-y-3 text-sm">
                <div class="flex gap-3">
                  <span class="text-slate-400 shrink-0">主题方向</span>
                  <span class="text-slate-700 font-medium">{{ topicDirection }}</span>
                </div>
                <div v-if="selectedTopic" class="flex gap-3">
                  <span class="text-slate-400 shrink-0">最终选题</span>
                  <span class="text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded">{{ selectedTopic }}</span>
                </div>
              </div>
            </div>
          </Transition>

          <!-- 各步骤组件 -->
          <div class="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200/60 overflow-hidden min-h-[500px] flex flex-col transition-all duration-500">
            <TopicInput
              v-if="currentStep === 0"
              v-model="topicDirection"
              :loading="loading"
              @start="handleStart"
            />
            <TopicSelect
              v-if="currentStep === 1"
              v-model="selectedTopic"
              :topics="generatedTopics"
              :loading="loading"
              :streamingText="streamingTopicsText"
              @confirm="handleSelectTopic"
              @reset="handleReset"
            />
            <ArticleReview
              v-if="currentStep === 2"
              v-model:feedback="feedback"
              :articleContent="articleContent"
              :loading="loading"
              @approve="handleApprove"
              @reject="handleReject"
            />
            <ImageGeneration
              v-if="currentStep === 3"
              :visualPoints="visualPoints"
            />
            <WorkflowComplete
              v-if="currentStep === 4"
              :articleContent="articleContent"
              :imageUrls="imageUrls"
              :visualPoints="visualPoints"
              :threadId="threadId"
              @reset="handleReset"
            />
          </div>

          <!-- 提示卡片 (仅在第一步显示) -->
          <div v-if="currentStep === 0" class="bg-blue-50/50 border border-blue-100 p-6 rounded-2xl flex gap-4 items-start">
            <span class="text-blue-600 text-xl shrink-0">💡</span>
            <div class="flex flex-col gap-1">
              <h4 class="text-sm font-bold text-blue-600">专家提示</h4>
              <p class="text-xs text-slate-600 leading-relaxed">提供越详细的描述，生成的内容质量越高。建议包含目标读者、文章基调以及希望涵盖的具体关键词。</p>
            </div>
          </div>
          
        </div>
      </div>
    </div>
    </div>

    <!-- 右侧：创作历史面板 -->
    <div class="w-72 border-l border-slate-200/80 bg-white shrink-0 hidden lg:flex flex-col">
      <!-- 面板标题 -->
      <div class="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2">
          <span class="text-lg">📚</span>
          <h3 class="text-sm font-bold text-slate-800">创作历史</h3>
          <span v-if="threadList.length" class="bg-slate-100 text-slate-500 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{{ threadList.length }}</span>
        </div>
        <button 
          @click="fetchThreadList"
          class="text-slate-400 hover:text-blue-500 transition-colors p-1.5 rounded-lg hover:bg-blue-50"
          title="刷新"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" :class="loadingThreads ? 'animate-spin' : ''" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
        </button>
      </div>

      <!-- 列表区域 -->
      <div class="flex-1 overflow-y-auto p-3 custom-scrollbar">
        <!-- 加载态 -->
        <div v-if="loadingThreads" class="space-y-2">
          <div v-for="i in 4" :key="i" class="h-16 bg-slate-50 rounded-xl animate-pulse"></div>
        </div>

        <!-- 空状态 -->
        <div v-else-if="threadList.length === 0" class="py-12 text-center">
          <div class="text-slate-200 text-4xl mb-3">📝</div>
          <p class="text-sm text-slate-400 font-medium">还没有创作记录</p>
          <p class="text-xs text-slate-300 mt-1">在左侧输入主题开始创作</p>
        </div>

        <!-- 历史列表 -->
        <div v-else class="space-y-1.5">
          <div 
            v-for="thread in threadList" 
            :key="thread.thread_id"
            @click="handleHistoryClick(thread.thread_id)"
            class="group p-3 rounded-xl cursor-pointer transition-all relative"
            :class="threadId === thread.thread_id 
              ? 'bg-blue-50 border border-blue-200 shadow-sm' 
              : 'hover:bg-slate-50 border border-transparent'"
          >
            <div class="flex items-start gap-2.5">
              <!-- 状态指示器 -->
              <div class="mt-1 shrink-0">
                <span v-if="thread.is_completed" class="block w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-emerald-100"></span>
                <span v-else class="block w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-amber-100 animate-pulse"></span>
              </div>

              <!-- 内容 -->
              <div class="flex-1 min-w-0">
                <p class="text-[13px] font-semibold truncate leading-tight"
                   :class="threadId === thread.thread_id ? 'text-blue-700' : 'text-slate-700'">
                  {{ thread.selected_topic || thread.topic_direction || '未命名工作流' }}
                </p>
                <div class="flex items-center gap-1.5 mt-1.5">
                  <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                    :class="thread.is_completed 
                      ? 'bg-emerald-50 text-emerald-600' 
                      : 'bg-amber-50 text-amber-600'">
                    {{ thread.is_completed ? '✓ 完成' : '● 进行中' }}
                  </span>
                </div>
                <p v-if="thread.topic_direction && thread.selected_topic" class="text-[11px] text-slate-400 truncate mt-1">
                  {{ thread.topic_direction }}
                </p>
              </div>

              <!-- 删除按钮 -->
              <button 
                @click.stop="handleHistoryDelete(thread.thread_id)"
                class="opacity-0 group-hover:opacity-100 shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                title="删除"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 抽屉式侧边栏 (Console Drawer) -->
    <Transition name="drawer">
      <div v-if="isConsoleOpen" class="fixed inset-y-0 right-0 w-[400px] z-[60] shadow-[-20px_0_50px_rgba(0,0,0,0.2)] bg-slate-900 border-l border-slate-800 flex flex-col">
        <div class="flex-1 overflow-hidden flex flex-col">
          <!-- 这里我们将指标面板和日志面板合二为一 -->
          <div class="flex-1 flex flex-col overflow-hidden">
            <StreamLogPanel
              :logs="streamLogs"
              @clear="clearStreamLogs"
              @close="isConsoleOpen = false"
            />
          </div>
          <div class="h-[250px] border-t border-slate-800 bg-slate-950 overflow-y-auto p-4 no-scrollbar">
            <NodeMetricsPanel :nodeMetrics="nodeMetrics" />
          </div>
        </div>
      </div>
    </Transition>

    <!-- 遮罩层 -->
    <Transition name="fade">
      <div v-if="isConsoleOpen" class="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-[55]" @click="isConsoleOpen = false"></div>
    </Transition>

    <!-- 底部状态胶囊 (Status Capsule) -->
    <div class="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2">
      <div 
        class="bg-white/80 backdrop-blur-xl border border-slate-200 shadow-2xl rounded-full px-6 py-3 flex items-center gap-6 transition-all hover:scale-105"
        :class="{ 'opacity-50 grayscale pointer-events-none': !threadId && streamLogs.length === 0 }"
      >
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full" :class="loading ? 'bg-blue-500 animate-pulse' : 'bg-slate-300'"></span>
          <span class="text-xs font-bold text-slate-600 uppercase tracking-widest whitespace-nowrap">
            {{ loading ? 'Running' : (workflowStatus || 'IDLE') }}
          </span>
        </div>

        <div class="h-4 w-px bg-slate-200"></div>

        <button 
          @click="isConsoleOpen = !isConsoleOpen"
          class="flex items-center gap-2 text-xs font-bold text-slate-700 hover:text-blue-600 transition-colors group"
        >
          <span class="text-lg group-hover:rotate-12 transition-transform">💻</span>
          <span class="uppercase tracking-widest">Console</span>
          <span v-if="streamLogs.length > 0" class="bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full text-[10px]">
            {{ streamLogs.length }}
          </span>
        </button>

        <div v-if="threadId" class="h-4 w-px bg-slate-200"></div>

        <div v-if="threadId" class="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
          <span class="hidden sm:inline">Thread:</span>
          <span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{{ threadId.substring(0,8) }}</span>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

// 导入子组件
import WorkflowSteps from './components/workflow/WorkflowSteps.vue'
import TopicInput from './components/workflow/TopicInput.vue'
import TopicSelect from './components/workflow/TopicSelect.vue'
import ArticleReview from './components/workflow/ArticleReview.vue'
import ImageGeneration from './components/workflow/ImageGeneration.vue'
import WorkflowComplete from './components/workflow/WorkflowComplete.vue'
import NodeMetricsPanel from './components/workflow/NodeMetricsPanel.vue'
import StreamLogPanel from './components/workflow/StreamLogPanel.vue'

import {
  getWorkflowState,
  streamStartWorkflow,
  streamSelectTopic,
  streamApproveArticle,
  streamRejectArticle,
  getAllThreads,
  deleteThread
} from './api.js'
import { consumePromptApplyPayload } from './utils/promptApply.js'

const emit = defineEmits([
  'new-workflow',
  'refresh-threads',
  'thread-changed'
])

// 状态
const currentStep = ref(0)
const loading = ref(false)
const message = ref('')
const messageType = ref('info')
const isConsoleOpen = ref(false)
const loadingThreads = ref(false)
const threadList = ref([])

// 工作流数据
const threadId = ref('')
const workflowStatus = ref('')
const interruptInfo = ref(null)

// 步骤数据
const topicDirection = ref('')
const generatedTopics = ref([])
const selectedTopic = ref('')
const streamingTopicsText = ref('')
const articleContent = ref('')
const feedback = ref('')
const imageUrls = ref([])
const visualPoints = ref([])
const nodeMetrics = ref([])

// 流式日志状态
const streamLogs = ref([])

function showMessage(msg, type = 'info') {
  message.value = msg
  messageType.value = type
  setTimeout(() => {
    message.value = ''
  }, 5000)
}

function addStreamLog(type, data, source = '') {
  const now = new Date()
  const time = now.toLocaleTimeString('zh-CN', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    fractionalSecondDigits: 3
  })
  
  const getLogMessage = (t, d) => {
    const messages = {
      'init': `工作流初始化 - Thread ID: ${d?.thread_id || ''}`,
      'start': `开始执行 - 模式: ${d?.stream_mode || ''}`,
      'resume': `恢复工作流 - 操作: ${d?.action || ''}`,
      'update': `节点更新 - ${d?.node || ''}`,
      'state': '状态快照更新',
      'node_start': `节点开始 - ${d?.node || ''}`,
      'node_end': `节点结束 - ${d?.node || ''}`,
      'llm_start': `LLM 开始调用 - ${d?.model || ''}`,
      'llm_end': `LLM 调用结束`,
      'done': `执行完成 - 状态: ${d?.status || ''}`,
      'error': `错误: ${d?.message || d || ''}`
    }
    return messages[t] || t
  }

  const log = {
    type,
    time,
    source,
    ...(type === 'llm_token' ? { content: data } : { data, message: getLogMessage(type, data) })
  }
  
  streamLogs.value.push(log)
  if (streamLogs.value.length > 1000) {
    streamLogs.value = streamLogs.value.slice(-800)
  }

  // 发现新日志时，如果是初次执行且控制台没关，可以自动打开（可选）
  if (type === 'start' && !isConsoleOpen.value) {
    // isConsoleOpen.value = true
  }
}

function clearStreamLogs() {
  streamLogs.value = []
}

async function handleStart() {
  if (!topicDirection.value.trim()) return
  
  loading.value = true
  message.value = ''
  generatedTopics.value = []
  streamingTopicsText.value = ''
  currentStep.value = 1
  
  try {
    await streamStartWorkflow(topicDirection.value, {
      onInit: (data) => {
        threadId.value = data.thread_id
        emit('thread-changed', data.thread_id)
        addStreamLog('init', data, 'start')
      },
      onStart: (data) => addStreamLog('start', data, 'start'),
      onNodeStart: (data) => addStreamLog('node_start', data, 'start'),
      onNodeEnd: (data) => {
        addStreamLog('node_end', data, 'start')
        if (data.metrics) {
          nodeMetrics.value = [...nodeMetrics.value, data.metrics]
        }
      },
      onLlmStart: (data) => addStreamLog('llm_start', data, 'start'),
      onLlmToken: (content) => addStreamLog('llm_token', content, 'start'),
      onLlmEnd: (data) => addStreamLog('llm_end', data, 'start'),
      onUpdate: (node, output) => {
        addStreamLog('update', { node, output }, 'start')
        if (node === 'topic_selection' || node === 'plan_topics' || node.includes('plan_topics')) {
          if (output.generated_topics?.length > 0) {
            generatedTopics.value = output.generated_topics
          }
        }
        if (output.node_metrics) {
          nodeMetrics.value = output.node_metrics
        }
      },
      onState: (data) => addStreamLog('state', data, 'start'),
      onDone: (data) => {
        addStreamLog('done', data, 'start')
        workflowStatus.value = data.status
        interruptInfo.value = data.interrupt_info
        if (data.interrupt_info?.options?.length > 0 && generatedTopics.value.length === 0) {
          generatedTopics.value = data.interrupt_info.options
        }
        if (data.values?.generated_topics?.length > 0) {
          generatedTopics.value = data.values.generated_topics
        }
        if (data.values?.node_metrics) {
          nodeMetrics.value = data.values.node_metrics
        }
        streamingTopicsText.value = ''
        loading.value = false
        showMessage('选题已生成，请选择一个继续', 'success')
        emit('refresh-threads')
        fetchThreadList()
      },
      onError: (errorMsg) => {
        addStreamLog('error', { message: errorMsg }, 'start')
        loading.value = false
        streamingTopicsText.value = ''
        currentStep.value = 0
        showMessage(`启动失败: ${errorMsg}`, 'error')
      }
    }, 'updates')
  } catch (error) {
    loading.value = false
    streamingTopicsText.value = ''
    currentStep.value = 0
    showMessage(`启动失败: ${error.message}`, 'error')
  }
}

async function handleSelectTopic() {
  if (!selectedTopic.value) return
  loading.value = true
  currentStep.value = 2
  articleContent.value = ''
  try {
    await streamSelectTopic(threadId.value, selectedTopic.value, {
      onResume: (data) => addStreamLog('resume', data, 'select_topic'),
      onStart: (data) => addStreamLog('start', data, 'select_topic'),
      onNodeStart: (data) => addStreamLog('node_start', data, 'select_topic'),
      onNodeEnd: (data) => addStreamLog('node_end', data, 'select_topic'),
      onLlmStart: (data) => addStreamLog('llm_start', data, 'select_topic'),
      onLlmToken: (content) => {
        articleContent.value += content
        addStreamLog('llm_token', content, 'select_topic')
      },
      onLlmEnd: (data) => addStreamLog('llm_end', data, 'select_topic'),
      onUpdate: (node, output) => {
        addStreamLog('update', { node, output }, 'select_topic')
        if (node === 'write_draft' && output.article_content) {
          articleContent.value = output.article_content
        }
        if (output.node_metrics) {
          nodeMetrics.value = output.node_metrics
        }
      },
      onDone: (data) => {
        addStreamLog('done', data, 'select_topic')
        workflowStatus.value = data.status
        interruptInfo.value = data.interrupt_info
        if (data.values?.article_content) {
          articleContent.value = data.values.article_content
        }
        if (data.values?.node_metrics) {
          nodeMetrics.value = data.values.node_metrics
        }
        loading.value = false
        showMessage('文章草稿已生成，请审核', 'success')
      },
      onError: (errorMsg) => {
        addStreamLog('error', { message: errorMsg }, 'select_topic')
        loading.value = false
        currentStep.value = 1
        showMessage(`操作失败: ${errorMsg}`, 'error')
      }
    }, 'events')
  } catch (error) {
    loading.value = false
    showMessage(`操作失败: ${error.message}`, 'error')
    currentStep.value = 1
  }
}

async function handleApprove() {
  loading.value = true
  currentStep.value = 3
  try {
    await streamApproveArticle(threadId.value, {
      onResume: (data) => addStreamLog('resume', data, 'approve'),
      onStart: (data) => addStreamLog('start', data, 'approve'),
      onUpdate: (node, output) => {
        addStreamLog('update', { node, output }, 'approve')
        if (output.visual_points) {
          visualPoints.value = output.visual_points
        }
        if (output.image_urls) {
          imageUrls.value = output.image_urls
        }
        if (output.node_metrics) {
          nodeMetrics.value = output.node_metrics
        }
      },
      onDone: (data) => {
        addStreamLog('done', data, 'approve')
        workflowStatus.value = data.status
        if (data.is_completed) {
          articleContent.value = data.values?.article_content || articleContent.value
          imageUrls.value = data.values?.image_urls || []
          visualPoints.value = data.values?.visual_points || []
          if (data.values?.node_metrics) {
            nodeMetrics.value = data.values.node_metrics
          }
          currentStep.value = 4
          showMessage('工作流已完成！', 'success')
        }
        loading.value = false
      },
      onError: (errorMsg) => {
        addStreamLog('error', { message: errorMsg }, 'approve')
        loading.value = false
        currentStep.value = 2
        showMessage(`操作失败: ${errorMsg}`, 'error')
      }
    }, 'updates')
  } catch (error) {
    loading.value = false
    currentStep.value = 2
    showMessage(`操作失败: ${error.message}`, 'error')
  }
}

async function handleReject() {
  loading.value = true
  articleContent.value = ''
  const currentFeedback = feedback.value
  feedback.value = ''
  try {
    await streamRejectArticle(threadId.value, currentFeedback, {
      onResume: (data) => addStreamLog('resume', data, 'reject'),
      onStart: (data) => addStreamLog('start', data, 'reject'),
      onNodeStart: (data) => addStreamLog('node_start', data, 'reject'),
      onNodeEnd: (data) => addStreamLog('node_end', data, 'reject'),
      onLlmStart: (data) => addStreamLog('llm_start', data, 'reject'),
      onLlmToken: (content) => {
        articleContent.value += content
        addStreamLog('llm_token', content, 'reject')
      },
      onLlmEnd: (data) => addStreamLog('llm_end', data, 'reject'),
      onUpdate: (node, output) => {
        addStreamLog('update', { node, output }, 'reject')
        if (node === 'write_draft' && output.article_content) {
          articleContent.value = output.article_content
        }
        if (output.node_metrics) {
          nodeMetrics.value = output.node_metrics
        }
      },
      onDone: (data) => {
        addStreamLog('done', data, 'reject')
        workflowStatus.value = data.status
        interruptInfo.value = data.interrupt_info
        if (data.values?.article_content) {
          articleContent.value = data.values.article_content
        }
        if (data.values?.node_metrics) {
          nodeMetrics.value = data.values.node_metrics
        }
        loading.value = false
        showMessage('文章已重写，请重新审核', 'info')
      },
      onError: (errorMsg) => {
        addStreamLog('error', { message: errorMsg }, 'reject')
        loading.value = false
        showMessage(`操作失败: ${errorMsg}`, 'error')
      }
    }, 'events')
  } catch (error) {
    loading.value = false
    showMessage(`操作失败: ${error.message}`, 'error')
  }
}

function handleReset() {
  resetWorkflow()
  emit('new-workflow')
}

// ============== 创作历史 ==============
async function fetchThreadList() {
  loadingThreads.value = true
  try {
    const result = await getAllThreads()
    threadList.value = result.threads || []
  } catch (e) {
    console.error('获取历史记录失败:', e)
  } finally {
    loadingThreads.value = false
  }
}

function handleHistoryClick(targetThreadId) {
  if (targetThreadId === threadId.value) return
  switchThread(targetThreadId)
}

async function handleHistoryDelete(targetThreadId) {
  if (!confirm('确定要删除这条历史记录吗？')) return
  try {
    await deleteThread(targetThreadId)
    if (targetThreadId === threadId.value) {
      resetWorkflow()
    }
    await fetchThreadList()
    emit('refresh-threads')
  } catch (e) {
    showMessage(`删除失败: ${e.response?.data?.detail || e.message}`, 'error')
  }
}

// 初始加载
onMounted(() => {
  fetchThreadList()
  consumePromptApplication()
})

// 暴露给外部的方法
function resetWorkflow() {
  currentStep.value = 0
  threadId.value = ''
  workflowStatus.value = ''
  interruptInfo.value = null
  topicDirection.value = ''
  generatedTopics.value = []
  selectedTopic.value = ''
  streamingTopicsText.value = ''
  articleContent.value = ''
  feedback.value = ''
  imageUrls.value = []
  visualPoints.value = []
  nodeMetrics.value = []
  message.value = ''
  streamLogs.value = []
}

function consumePromptApplication() {
  const payload = consumePromptApplyPayload(sessionStorage, 'workflow')
  if (!payload) return

  resetWorkflow()
  currentStep.value = 0
  topicDirection.value = payload.content
}

function determineCurrentStep(state) {
  const values = state.values || {}
  const interruptInfo = state.interrupt_info
  const isCompleted = state.is_completed
  
  if (isCompleted) return 4
  
  if (interruptInfo) {
    const actionRequired = interruptInfo.action_required
    if (actionRequired === 'select_topic') return 1
    else if (actionRequired === 'review') return 2
  }
  
  if (values.image_urls && values.image_urls.length > 0) return 4
  if (values.article_content) return 2
  if (values.generated_topics && values.generated_topics.length > 0) return 1
  
  return 0
}

async function switchThread(targetThreadId) {
  if (targetThreadId === threadId.value) return
  
  loading.value = true
  message.value = ''
  
  try {
    const state = await getWorkflowState(targetThreadId)
    
    threadId.value = targetThreadId
    workflowStatus.value = state.status
    interruptInfo.value = state.interrupt_info
    
    const values = state.values || {}
    topicDirection.value = values.topic_direction || ''
    generatedTopics.value = values.generated_topics || []
    selectedTopic.value = values.selected_topic || ''
    articleContent.value = values.article_content || ''
    imageUrls.value = values.image_urls || []
    visualPoints.value = values.visual_points || []
    feedback.value = ''
    
    streamingTopicsText.value = ''
    streamLogs.value = []
    
    const rawMetrics = state.node_metrics || values.node_metrics || []
    nodeMetrics.value = rawMetrics.map(m => ({
      node_name: m.node_name || '',
      duration_ms: m.duration_ms || 0,
      input_tokens: m.input_tokens || 0,
      output_tokens: m.output_tokens || 0,
      total_tokens: m.total_tokens || 0,
      start_time: m.start_time || '',
      end_time: m.end_time || '',
      model: m.model || ''
    }))
    
    currentStep.value = determineCurrentStep(state)
    
    showMessage('已切换到历史工作流', 'success')
  } catch (error) {
    showMessage(`切换失败: ${error.response?.data?.detail || error.message}`, 'error')
  } finally {
    loading.value = false
  }
}

function startWithParams(params) {
  resetWorkflow()
  if (params && params.topic_direction) {
    let focus = params.topic_direction
    if (params.description) {
      focus += '。备注要求：' + params.description
    }
    topicDirection.value = focus

    setTimeout(() => {
      handleStart()
    }, 200)
  }
}

defineExpose({
  switchThread,
  resetWorkflow,
  startWithParams
})
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.drawer-enter-active, .drawer-leave-active { transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
.drawer-enter-from, .drawer-leave-to { transform: translateX(100%); }

.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: transparent; border-radius: 20px; }
.custom-scrollbar:hover::-webkit-scrollbar-thumb { background-color: #cbd5e1; }
</style>
