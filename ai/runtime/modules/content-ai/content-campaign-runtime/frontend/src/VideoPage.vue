<template>
  <div class="h-full flex flex-col lg:flex-row bg-slate-50 gap-6 p-6 overflow-hidden">
    
    <!-- 左侧：参数配置面板 -->
    <div class="w-full lg:w-[420px] shrink-0 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <!-- 头部 -->
      <div class="px-6 py-5 border-b border-slate-100 bg-white shadow-sm z-10">
        <h2 class="text-xl font-bold text-slate-800 flex items-center">
          <span class="mr-2 text-2xl">🎬</span>
          知识视频生成
        </h2>
        <p class="text-sm text-slate-500 mt-1">输入核心主题，AI 自动编写生成带解说、字幕和场景组合的干货视频。</p>
      </div>

      <!-- 参数表单 -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        
        <!-- 视频模板 -->
        <div>
          <label class="block text-sm font-semibold text-slate-700 mb-2">
            视频模板
          </label>
          <div class="grid grid-cols-2 gap-3">
            <button 
              v-for="tpl in templateOptions" 
              :key="tpl.value"
              @click="form.template = tpl.value"
              class="py-3 px-4 text-sm font-medium rounded-xl border-2 transition-all text-left"
              :class="form.template === tpl.value ? 'bg-blue-50 border-blue-400 text-blue-700 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'"
            >
              <div class="text-lg mb-1">{{ tpl.icon }}</div>
              <div class="font-semibold">{{ tpl.label }}</div>
              <div class="text-xs mt-0.5 opacity-70">{{ tpl.desc }}</div>
            </button>
          </div>
        </div>

        <!-- 视频尺寸 -->
        <div>
          <label class="block text-sm font-semibold text-slate-700 mb-2">
            视频尺寸
          </label>
          <div class="flex gap-3">
            <button 
              v-for="aspect in aspectOptions" 
              :key="aspect.value"
              @click="form.aspect_ratio = aspect.value"
              class="flex-1 py-3 px-4 text-sm font-medium rounded-xl border-2 transition-all text-center"
              :class="form.aspect_ratio === aspect.value ? 'bg-indigo-50 border-indigo-400 text-indigo-700 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'"
            >
              <div class="text-lg mb-1">{{ aspect.icon }}</div>
              <div class="font-semibold">{{ aspect.label }}</div>
              <div class="text-xs mt-0.5 opacity-70">{{ aspect.desc }}</div>
            </button>
          </div>
        </div>

        <!-- 核心主题 -->
        <div>
          <label class="block text-sm font-semibold text-slate-700 mb-2">
            核心主题 (必填)
          </label>
          <textarea
            v-model="form.topic"
            rows="4"
            placeholder="例如：3个CSS神技巧让网页颜值飙升..."
            class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none shadow-inner"
          ></textarea>
        </div>

        <!-- 讲解音色 -->
        <div>
          <label class="block text-sm font-semibold text-slate-700 mb-2">
            讲解音色
          </label>
          <div class="relative">
            <select
              v-model="form.voice_type"
              class="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl appearance-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer shadow-sm transition-all"
            >
              <option v-for="voice in voiceOptions" :key="voice.value" :value="voice.value">
                {{ voice.label }}
              </option>
            </select>
            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
            </div>
          </div>
          <p class="text-xs text-slate-400 mt-2">系统内置基于火山引擎的流式表现力音色</p>
        </div>

        <!-- 剧本风格偏好 -->
        <div>
          <label class="block text-sm font-semibold text-slate-700 mb-2">
            剧本风格表现
          </label>
          <div class="flex gap-2">
            <button 
              v-for="style in styleOptions" 
              :key="style.value"
              @click="form.style = style.value"
              class="flex-1 py-2 text-sm font-medium rounded-lg border transition-all"
              :class="form.style === style.value ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'"
            >
              {{ style.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- 底部操作区 -->
      <div class="p-6 bg-slate-50 border-t border-slate-100 shrink-0">
        <button
          @click="handleGenerate"
          :disabled="isGenerating || !form.topic"
          class="w-full flex items-center justify-center py-3.5 px-6 border border-transparent rounded-xl text-base font-medium text-white shadow-lg transition-all duration-300 transform"
          :class="isGenerating || !form.topic ? 'bg-slate-400 opacity-60 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-blue-500/30 hover:-translate-y-0.5'"
        >
          <template v-if="isGenerating">
            <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            准备生成中...
          </template>
          <template v-else>
            ✨ 开始生成视频
          </template>
        </button>
      </div>
    </div>

    <!-- 右侧：生成历史与结果看板 -->
    <div class="flex-1 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative">
      <div class="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-white/80 backdrop-blur shrink-0 z-10 sticky top-0">
        <h3 class="text-lg font-bold text-slate-800">生成历史看板</h3>
        <button 
          @click="fetchHistory"
          class="text-sm px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center shadow-sm"
        >
          <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
          </svg>
          刷新
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-8 bg-slate-50/50 custom-scrollbar relative">
        <div v-if="isLoadingHistory" class="flex flex-col items-center justify-center py-20 text-slate-400">
          <svg class="animate-spin h-8 w-8 text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8zM12 20a8 8 0 100-16 8 8 0 000 16z"></path>
          </svg>
          <p>加载历史记录...</p>
        </div>
        
        <div v-else-if="historyList.length === 0" class="flex flex-col items-center justify-center h-full text-slate-400 pt-20">
          <div class="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-4">
            <svg class="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
            </svg>
          </div>
          <p class="text-lg">暂无生成记录，快去左侧生成第一条视频吧！</p>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          <div 
            v-for="task in historyList" 
            :key="task.id"
            class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow flex flex-col"
          >
            <!-- 播放器区域 / 加载区 -->
            <div class="relative bg-slate-900 group shrink-0 aspect-[9/16] max-h-[360px] flex items-center justify-center overflow-hidden">
              <template v-if="task.status === 'completed' && task.video_url">
                <video 
                  :src="getAbsoluteUrl(task.video_url)" 
                  class="w-full h-full object-cover"
                  controls
                  preload="metadata"
                ></video>
              </template>
              
              <template v-else-if="task.status === 'failed'">
                <div class="flex flex-col items-center justify-center p-6 text-red-400">
                  <svg class="w-12 h-12 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  <span class="text-sm font-medium">生成失败</span>
                </div>
              </template>
              
              <template v-else>
                <!-- 加载中 -->
                <div class="absolute inset-0 bg-slate-800/80 flex flex-col items-center justify-center">
                  <svg class="animate-spin h-8 w-8 text-blue-500 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0a12 12 0 000 24v-4a8 8 0 01-8-8z"></path>
                  </svg>
                  <p class="text-white text-sm font-medium">{{ getStatusLabel(task.status) }} <span class="animate-pulse">...</span></p>
                </div>
                <!-- 骨架屏占位 -->
                <div class="absolute inset-0 bg-slate-800 flex flex-col justify-end p-4 z-[-1]">
                  <div class="h-4 bg-slate-700 rounded w-1/2 mb-2"></div>
                  <div class="h-3 bg-slate-700 rounded w-3/4"></div>
                </div>
              </template>
            </div>

            <!-- 底部信息 -->
            <div class="p-4 flex flex-col flex-1 border-t border-slate-100 bg-white">
              <h4 class="font-bold text-slate-800 text-sm mb-1 line-clamp-1" :title="task.title || task.topic">
                {{ task.title || task.topic }}
              </h4>
              <p class="text-xs text-slate-500 line-clamp-2 mt-1 mb-3" :title="task.topic">
                主题: {{ task.topic }}
              </p>
              
              <div class="mt-auto flex items-center justify-between pt-2">
                <span class="text-xs font-medium px-2.5 py-1 rounded-full border bg-slate-50"
                  :class="{
                    'text-green-600 border-green-200 bg-green-50': task.status === 'completed',
                    'text-red-600 border-red-200 bg-red-50': task.status === 'failed',
                    'text-blue-600 border-blue-200 bg-blue-50': ['pending', 'generating_script', 'synthesizing_audio', 'rendering'].includes(task.status)
                  }"
                >
                  {{ getStatusLabel(task.status) }}
                </span>
                
                <a 
                  v-if="task.status === 'completed' && task.video_url"
                  :href="getVideoDownloadUrl(task.id)"
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  class="flex items-center text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 hover:text-blue-700 py-1.5 px-3 rounded-lg font-medium transition-colors cursor-pointer"
                >
                  <svg class="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                  </svg>
                  极速下载
                </a>

                <button
                  @click.stop="handleDelete(task)"
                  class="flex items-center text-xs text-red-500 bg-red-50 hover:bg-red-100 hover:text-red-700 py-1.5 px-3 rounded-lg font-medium transition-colors cursor-pointer"
                  title="删除此任务"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { 
  generateVideo, 
  getVideoList, 
  getVideoStatus,
  getVideoDownloadUrl,
  getVoiceOptions,
  deleteVideoTask
} from './api.js'

// ============== 表单数据 ==============
const form = reactive({
  topic: '',
  voice_type: 'BV700_V2_streaming',
  style: '干货',
  template: 'KnowledgeVideo',
  aspect_ratio: '9:16'
})

const isGenerating = ref(false)

// 火山引擎音色（从后端动态加载）
const voiceOptions = ref([
  { label: '灿灿 2.0 (女声，强烈推荐)', value: 'BV700_V2_streaming' },
])
const isLoadingVoices = ref(false)

async function loadVoices() {
  isLoadingVoices.value = true
  try {
    const res = await getVoiceOptions()
    if (res && res.length > 0) {
      voiceOptions.value = res.map(v => ({
        label: `${v.label} (${v.gender === 'female' ? '女声' : '男声'})`,
        value: v.value
      }))
    }
  } catch (e) {
    console.error('加载音色失败，使用默认列表', e)
  } finally {
    isLoadingVoices.value = false
  }
}

const styleOptions = [
  { label: '清晰干货', value: '干货' },
  { label: '幽默搞笑', value: '幽默' }
]

const templateOptions = [
  { label: '干货技能卡', value: 'KnowledgeVideo', icon: '⚡', desc: '标题+要点+代码示例' },
  { label: '数据可视化', value: 'DataVizVideo', icon: '📊', desc: '数字翻转+柱状图+卡片' },
]

const aspectOptions = [
  { label: '9:16 竖屏', value: '9:16', icon: '📱', desc: '抖音/小红书' },
  { label: '16:9 横屏', value: '16:9', icon: '🖥️', desc: 'B站/YouTube' },
]

// ============== 历史列表 ==============
const historyList = ref([])
const isLoadingHistory = ref(true)
let pollTimer = null

// 状态字典
const statusDict = {
  'pending': '排队中',
  'generating_script': '编写脚本中',
  'synthesizing_audio': '合成配音中',
  'rendering': '服务端渲染中',
  'completed': '完成',
  'failed': '失败'
}

function getStatusLabel(status) {
  return statusDict[status] || status
}

// 补全由于代理使用的 baseURL 前缀
function getAbsoluteUrl(relativeUrl) {
  if (!relativeUrl) return ''
  const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
  return `${API_BASE}${relativeUrl}`
}

async function fetchHistory() {
  try {
    const res = await getVideoList(20)
    historyList.value = res.videos || []
    checkPollingTasks()
  } catch (error) {
    console.error('获取历史记录失败:', error)
  } finally {
    isLoadingHistory.value = false
  }
}

// 提交生成任务
async function handleGenerate() {
  if (!form.topic) return
  isGenerating.value = true
  try {
    const res = await generateVideo({ ...form })
    if (res && res.id) {
      form.topic = ''
      await fetchHistory()
    }
  } catch (err) {
    alert(`创建任务失败: ${err.response?.data?.detail || err.message}`)
  } finally {
    isGenerating.value = false
  }
}

async function handleDelete(task) {
  if (!confirm(`确定要删除「${task.title || task.topic}」吗？`)) return
  try {
    await deleteVideoTask(task.id)
    historyList.value = historyList.value.filter(t => t.id !== task.id)
  } catch (err) {
    alert(`删除失败: ${err.response?.data?.detail || err.message}`)
  }
}

// ============== 轮询逻辑 ==============
function checkPollingTasks() {
  // 如果没有任何未完成任务，清除定时器
  const hasActiveTasks = historyList.value.some(t => 
    ['pending', 'generating_script', 'synthesizing_audio', 'rendering'].includes(t.status)
  )
  
  if (hasActiveTasks) {
    if (!pollTimer) {
      pollTimer = setInterval(pollActiveTasks, 3000)
    }
  } else {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }
}

async function pollActiveTasks() {
  for (let i = 0; i < historyList.value.length; i++) {
    const task = historyList.value[i]
    if (['pending', 'generating_script', 'synthesizing_audio', 'rendering'].includes(task.status)) {
      try {
        const latestInfo = await getVideoStatus(task.id)
        // 动态合并属性
        Object.assign(task, latestInfo)
      } catch (e) {
        console.error(`轮询任务 ${task.id} 失败`, e)
      }
    }
  }
  // 检查是否所有任务都完成了，结束定时器
  const hasActiveTasks = historyList.value.some(t => 
    ['pending', 'generating_script', 'synthesizing_audio', 'rendering'].includes(t.status)
  )
  if (!hasActiveTasks && pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// 生命周期
onMounted(() => {
  fetchHistory()
  loadVoices()
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1; /* slate-300 */
  border-radius: 20px;
}
.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: #94a3b8; /* slate-400 */
}
</style>
