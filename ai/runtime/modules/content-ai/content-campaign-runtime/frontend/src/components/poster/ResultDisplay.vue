<template>
  <div v-if="result" class="animate-in fade-in zoom-in duration-700 bg-white rounded-[2rem] shadow-2xl shadow-blue-900/10 border border-slate-100 overflow-hidden">
    <!-- 头部标识 -->
    <div class="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 flex items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/30">
          <span class="text-xl">✨</span>
        </div>
        <div>
          <h3 class="text-xl font-black text-slate-800 tracking-tight">创意生成结果</h3>
          <p class="text-[10px] text-slate-400 uppercase tracking-widest font-black mt-0.5">Creative Generation Result</p>
        </div>
      </div>
      <div 
        class="px-5 py-2 rounded-full text-xs font-black tracking-tight shadow-sm"
        :class="badgeTailwindClass"
      >
        {{ modeLabel }}
      </div>
    </div>

    <!-- 成功态内容 -->
    <div v-if="result.success" class="p-8 space-y-10">
      <!-- 单图展示 -->
      <div v-if="result.mode !== 'batch' && result.mode !== 'export_all'" class="relative group">
        <div class="absolute -inset-4 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 rounded-[3rem] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
        <div class="relative bg-slate-900 rounded-[2.5rem] p-4 shadow-2xl overflow-hidden border-8 border-slate-900 mx-auto max-w-lg lg:max-w-2xl transform transition-transform duration-700 hover:scale-[1.02]">
          <img :src="getImageUrl(result.image_url)" alt="生成的海报" class="w-full h-auto rounded-[1.5rem] shadow-inner" />
          <div class="absolute top-8 right-8 flex flex-col gap-2">
            <a :href="getImageUrl(result.image_url)" download class="w-12 h-12 bg-white/90 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-xl hover:bg-white hover:scale-110 active:scale-95 transition-all" title="下载原始图像">
              <span class="text-xl">⬇️</span>
            </a>
          </div>
        </div>
      </div>

      <!-- 全平台套装展示 -->
      <div v-else-if="result.mode === 'export_all'" class="space-y-6">
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
          <div v-for="(imgInfo, idx) in result.images" :key="idx" class="group bg-slate-50 border border-slate-200 rounded-3xl p-4 hover:bg-white hover:shadow-xl hover:-translate-y-1 transition-all">
            <div class="aspect-[3/4] bg-slate-200 rounded-2xl overflow-hidden mb-4 relative shadow-inner">
              <img :src="getImageUrl(imgInfo.url)" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt="适配图片" />
              <div class="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                <a :href="getImageUrl(imgInfo.url)" download class="p-3 bg-white rounded-xl shadow-xl hover:scale-110 transition-transform">📥</a>
              </div>
            </div>
            <div class="text-center">
              <div class="text-[13px] font-black text-slate-700">{{ imgInfo.ratio }}</div>
              <div class="text-[10px] text-slate-400 mt-0.5">Optimized for Platform</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 单张后台任务：保持后台生成逻辑，但按单图结果展示 -->
      <div v-else-if="isSingleBatchTask" class="space-y-6">
        <div class="p-6 bg-blue-50/50 rounded-[2rem] border border-blue-100 space-y-4">
          <div class="flex items-center justify-between gap-4">
            <h3 class="text-lg font-black text-slate-800 flex items-center gap-2">
              <span v-if="batchPolling" class="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
              <span v-else-if="singleBatchDisplayItem?.status === 'failed'">⚠️</span>
              <span v-else>✅</span>
              单张生成 · {{ batchStatusLabel }}
            </h3>
            <div class="flex items-center gap-3">
              <button
                v-if="canRetryBatch"
                type="button"
                class="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-xl text-xs font-black transition-all active:scale-95"
                :disabled="batchRetrying"
                @click="retryFailedBatchItems"
              >
                {{ batchRetrying ? '重试中...' : '重试失败项' }}
              </button>
              <div class="text-xs font-mono text-slate-400">{{ result.task_id?.slice(0,8) }}</div>
            </div>
          </div>
          <div v-if="batchStatus" class="space-y-2">
            <div class="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
              <div class="h-full bg-blue-600 rounded-full transition-all duration-500" :style="{ width: batchProgress + '%' }"></div>
            </div>
            <div class="flex justify-between text-xs font-bold text-slate-500">
              <span>后台任务进度</span>
              <span>{{ batchStatus.success_count + batchStatus.failed_count }} / {{ batchStatus.total_count }}</span>
            </div>
          </div>
          <div v-else class="text-sm text-slate-500">任务已提交，正在加载进度...</div>
        </div>

        <div class="relative group">
          <div class="absolute -inset-4 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 rounded-[3rem] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
          <div class="relative bg-slate-900 rounded-[2.5rem] p-4 shadow-2xl overflow-hidden border-8 border-slate-900 mx-auto max-w-lg lg:max-w-2xl min-h-[360px] flex items-center justify-center">
            <img
              v-if="singleBatchDisplayItem?.status === 'success' && singleBatchDisplayItem.image_url"
              :src="getImageUrl(singleBatchDisplayItem.image_url)"
              alt="生成的海报"
              class="w-full h-auto rounded-[1.5rem] shadow-inner"
            />
            <div v-else-if="singleBatchDisplayItem?.status === 'failed'" class="w-full min-h-[420px] bg-red-50 rounded-[1.5rem] flex flex-col items-center justify-center gap-4 p-8 text-center">
              <span class="text-5xl">⚠️</span>
              <div>
                <div class="text-lg font-black text-red-600">生成失败</div>
                <p class="mt-2 text-sm text-red-500 line-clamp-3">{{ singleBatchDisplayItem.error_message || '后台任务失败，请重试' }}</p>
              </div>
              <button
                v-if="canRetryBatch"
                type="button"
                class="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-2xl text-sm font-black transition-all active:scale-95"
                :disabled="batchRetrying"
                @click="retryFailedBatchItems"
              >
                {{ batchRetrying ? '重试中...' : '重试失败项' }}
              </button>
            </div>
            <div v-else class="w-full min-h-[420px] bg-blue-50 rounded-[1.5rem] flex flex-col items-center justify-center gap-4 text-center">
              <div class="w-12 h-12 border-[4px] border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
              <div>
                <div class="text-base font-black text-blue-600">后台生成中...</div>
                <p class="mt-1 text-xs font-bold text-blue-300 uppercase tracking-widest">Single poster task</p>
              </div>
            </div>
            <div v-if="singleBatchDisplayItem?.status === 'success' && singleBatchDisplayItem.image_url" class="absolute top-8 right-8 flex flex-col gap-2">
              <a :href="getImageUrl(singleBatchDisplayItem.image_url)" download class="w-12 h-12 bg-white/90 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-xl hover:bg-white hover:scale-110 active:scale-95 transition-all" title="下载原始图像">
                <span class="text-xl">⬇️</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- 批量任务：进度 + 图片网格 -->
      <div v-else class="space-y-6">
        <div class="p-6 bg-blue-50/50 rounded-[2rem] border border-blue-100 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-black text-slate-800 flex items-center gap-2">
              <span v-if="batchPolling" class="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
              <span v-else>✅</span>
              批量生成 · {{ batchStatusLabel }}
            </h3>
            <div class="flex items-center gap-3">
              <button
                v-if="canRetryBatch"
                type="button"
                class="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-xl text-xs font-black transition-all active:scale-95"
                :disabled="batchRetrying"
                @click="retryFailedBatchItems"
              >
                {{ batchRetrying ? '重试中...' : '重试失败项' }}
              </button>
              <div class="text-xs font-mono text-slate-400">{{ result.task_id?.slice(0,8) }}</div>
            </div>
          </div>
          <div v-if="batchStatus" class="space-y-2">
            <div class="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
              <div class="h-full bg-blue-600 rounded-full transition-all duration-500" :style="{ width: batchProgress + '%' }"></div>
            </div>
            <div class="flex justify-between text-xs font-bold text-slate-500">
              <span>成功 <span class="text-emerald-600">{{ batchStatus.success_count }}</span> / 失败 <span class="text-red-500">{{ batchStatus.failed_count }}</span></span>
              <span>{{ batchStatus.success_count + batchStatus.failed_count }} / {{ batchStatus.total_count }}</span>
            </div>
          </div>
          <div v-else class="text-sm text-slate-500">任务已提交，正在加载进度...</div>
        </div>

        <div v-if="batchStatus?.items?.length" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <div v-for="item in batchStatus.items" :key="item.order_index" class="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <div v-if="item.status === 'success' && item.image_url" class="aspect-[3/4] relative group">
              <img :src="getImageUrl(item.image_url)" class="w-full h-full object-cover" />
              <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                <a :href="getImageUrl(item.image_url)" download class="p-2 bg-white rounded-xl shadow-lg text-sm">📥</a>
              </div>
            </div>
            <div v-else-if="item.status === 'running'" class="aspect-[3/4] bg-blue-50 flex flex-col items-center justify-center gap-2">
              <div class="w-8 h-8 border-[3px] border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
              <span class="text-xs text-blue-500 font-bold">生成中...</span>
            </div>
            <div v-else-if="item.status === 'failed'" class="aspect-[3/4] bg-red-50 flex flex-col items-center justify-center gap-2 p-4">
              <span class="text-2xl">❌</span>
              <span class="text-xs text-red-500 text-center line-clamp-2">{{ item.error_message || '生成失败' }}</span>
            </div>
            <div v-else class="aspect-[3/4] bg-slate-50 flex items-center justify-center">
              <span class="text-xs text-slate-400 font-bold">等待中...</span>
            </div>
            <div class="p-3 text-center">
              <div class="text-xs font-bold text-slate-700 truncate">{{ item.title || `#${item.order_index + 1}` }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 元数据卡片 -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div v-if="result.aspect_ratio" class="bg-slate-50 rounded-2xl p-4 border border-slate-100">
          <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">尺寸比例</div>
          <div class="text-sm font-bold text-slate-700 mt-1">{{ result.aspect_ratio }}</div>
        </div>
        <div v-if="result.width" class="bg-slate-50 rounded-2xl p-4 border border-slate-100">
          <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">物理分辨率</div>
          <div class="text-sm font-bold text-slate-700 mt-1">{{ result.width }} × {{ result.height }}</div>
        </div>
        <div v-if="result.template_name" class="bg-slate-50 rounded-2xl p-4 border border-slate-100">
          <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">设计模板</div>
          <div class="text-sm font-bold text-slate-700 mt-1 truncate" :title="result.template_name">{{ result.template_name }}</div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="flex flex-col sm:flex-row gap-4 pt-6">
        <button
          v-if="canSyncToSales"
          class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-2xl shadow-xl shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 border-b-4 border-emerald-800 active:border-b-0 active:translate-y-1"
          @click="openSalesModal"
        >
          <span>🔗</span> 关联销售系统
        </button>
        <button class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-600/20 transition-all flex items-center justify-center gap-2 border-b-4 border-blue-800 active:border-b-0 active:translate-y-1" @click="$emit('reset')">
          <span>🎨</span> 继续创作
        </button>
      </div>
    </div>

    <!-- 错误态 -->
    <div v-else class="p-12 flex flex-col items-center text-center space-y-6">
      <div class="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-4xl shadow-lg shadow-red-500/10">
        🥀
      </div>
      <div class="space-y-2">
        <h3 class="text-xl font-black text-red-600 italic tracking-tighter">创意在时空裂缝中迷失了...</h3>
        <p class="text-slate-500 text-sm font-medium px-8">{{ result.error || '可能是网络或服务器波动，请稍后再试' }}</p>
      </div>
      <button class="px-10 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black rounded-2xl transition-all" @click="$emit('reset')">
        尝试修复并重试
      </button>
    </div>

    <SalesSyncModal
      v-if="salesImageUrl"
      :is-open="salesModalOpen"
      :image-url="salesImageUrl"
      @close="salesModalOpen = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { getBatchStatus, retryBatchTask } from '../../api.js'
import SalesSyncModal from '../common/SalesSyncModal.vue'

const props = defineProps({
  result: { type: Object, default: null }
})

defineEmits(['reset'])

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

function getImageUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${API_BASE}${url}`
}

const batchStatus = ref(null)
const batchPolling = ref(false)
const batchRetrying = ref(false)
const salesModalOpen = ref(false)
let pollTimer = null

const batchProgress = computed(() => {
  if (!batchStatus.value) return 0
  const { success_count, failed_count, total_count } = batchStatus.value
  if (!total_count) return 0
  return Math.round(((success_count + failed_count) / total_count) * 100)
})

const batchStatusLabel = computed(() => {
  if (!batchStatus.value) return '已提交'
  const s = batchStatus.value.status
  if (s === 'running') return '进行中...'
  if (s === 'completed') return '全部完成'
  if (s === 'partial_failed') return '部分失败'
  if (s === 'failed') return '全部失败'
  return s
})

const canSyncToSales = computed(() => {
  if (!props.result?.success) return false
  return Boolean(salesImageUrl.value)
})

const singleBatchSuccessItem = computed(() => {
  if (props.result?.mode !== 'batch') return null
  if (batchStatus.value?.total_count === 1) {
    return batchStatus.value.items?.find(item => item.status === 'success' && item.image_url) || null
  }
  return null
})

const singleBatchDisplayItem = computed(() => {
  if (props.result?.mode !== 'batch') return null
  if (batchStatus.value?.total_count === 1) {
    return batchStatus.value.items?.[0] || null
  }
  return null
})

const isSingleBatchTask = computed(() => {
  if (props.result?.mode !== 'batch') return false
  if (props.result.display_mode === 'single') return true
  return batchStatus.value?.total_count === 1
})

const salesImageUrl = computed(() => {
  if (props.result?.image_url && props.result.mode !== 'export_all') return props.result.image_url
  return singleBatchSuccessItem.value?.image_url || ''
})

const canRetryBatch = computed(() => {
  if (!props.result?.success || props.result.mode !== 'batch' || !props.result.task_id) return false
  if (!batchStatus.value?.failed_count) return false
  return ['partial_failed', 'failed'].includes(batchStatus.value.status)
})

function openSalesModal() {
  salesModalOpen.value = true
}

function resetSalesState() {
  salesModalOpen.value = false
}

async function pollBatch(taskId) {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
  batchPolling.value = true
  try {
    const data = await getBatchStatus(taskId)
    batchStatus.value = data

    const done = ['completed', 'partial_failed', 'failed'].includes(data.status)
    if (done) {
      batchPolling.value = false
      return
    }
    pollTimer = setTimeout(() => pollBatch(taskId), 3000)
  } catch (e) {
    console.error('轮询批量状态失败:', e)
    pollTimer = setTimeout(() => pollBatch(taskId), 5000)
  }
}

async function retryFailedBatchItems() {
  if (!props.result?.task_id || batchRetrying.value) return
  batchRetrying.value = true
  try {
    await retryBatchTask(props.result.task_id)
    await pollBatch(props.result.task_id)
  } catch (e) {
    console.error('重试失败项失败:', e)
  } finally {
    batchRetrying.value = false
  }
}

watch(() => props.result, (val) => {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
  batchStatus.value = null
  batchPolling.value = false
  batchRetrying.value = false
  resetSalesState()

  if (val?.success && val?.mode === 'batch' && val?.task_id) {
    pollBatch(val.task_id)
  }
}, { immediate: true })

onUnmounted(() => {
  if (pollTimer) clearTimeout(pollTimer)
})

const map = {
  custom: { label: '自定义创意', tailwind: 'bg-blue-100 text-blue-700' },
  template: { label: '专业模板', tailwind: 'bg-emerald-100 text-emerald-700' },
  edit: { label: '智能改图', tailwind: 'bg-amber-100 text-amber-700' },
  inpaint: { label: '局部重绘', tailwind: 'bg-indigo-100 text-indigo-700' },
  erase: { label: '智能消除', tailwind: 'bg-rose-100 text-rose-700' },
  adapt: { label: '多端适配', tailwind: 'bg-cyan-100 text-cyan-700' },
  export_all: { label: '全端全家桶', tailwind: 'bg-purple-100 text-purple-700' },
  style_transfer: { label: '风格迁移', tailwind: 'bg-fuchsia-100 text-fuchsia-700' },
  batch: { label: '后台生成', tailwind: 'bg-teal-100 text-teal-700' },
}

const badgeTailwindClass = computed(() => {
  if (!props.result) return ''
  return map[props.result.mode]?.tailwind || 'bg-slate-100 text-slate-600'
})

const modeLabel = computed(() => {
  if (!props.result) return ''
  if (isSingleBatchTask.value) return props.result.single_label || '模板生成'
  return map[props.result.mode]?.label || props.result.mode || ''
})
</script>
