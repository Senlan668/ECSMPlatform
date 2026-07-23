<template>
  <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <!-- 模板选择列表 -->
    <div v-if="!selectedTemplate" class="space-y-6">
      <div class="flex flex-col md:flex-row md:items-center justify-between px-4 gap-4">
        <div>
          <h2 class="text-xl font-bold text-slate-800 tracking-tight">精选设计模板</h2>
          <p class="text-xs text-slate-400 mt-1 uppercase tracking-widest font-semibold">Premium Design Templates</p>
        </div>
        
        <!-- Tab 切换 -->
        <div class="inline-flex p-1 bg-white border border-slate-200 rounded-2xl shadow-sm self-start">
          <button 
            v-for="tab in [{id: 'mine', label: '我的模板', icon: '👤'}, {id: 'system', label: '公共模板', icon: '🏛️'}]" 
            :key="tab.id"
            @click="currentTab = tab.id"
            :class="[
              'flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold transition-all duration-200',
              currentTab === tab.id 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-100' 
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            ]"
          >
            <span>{{ tab.icon }}</span>
            {{ tab.label }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" v-if="filteredTemplates.length > 0">
        <TemplatePreview
          v-for="tpl in filteredTemplates"
          :key="tpl.id"
          :template="tpl"
          :isSystem="currentTab === 'system'"
          :selectionMode="true"
          @click="selectTemplate(tpl)"
          @use="selectTemplate(tpl)"
          class="cursor-pointer"
        />
      </div>
      
      <!-- 空状态 -->
      <div v-else-if="templates.length > 0" class="py-20 flex flex-col items-center justify-center gap-4 border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/50">
        <span class="text-4xl grayscale opacity-40">{{ currentTab === 'mine' ? '📂' : '🏛️' }}</span>
        <p class="text-slate-500 font-medium">{{ currentTab === 'mine' ? '您还没有创建过个人模板' : '暂无公共模板' }}</p>
      </div>
      
      <!-- 加载中 -->
      <div v-else class="py-32 flex flex-col items-center justify-center gap-6">
        <div class="w-12 h-12 border-4 border-blue-50 border-t-blue-600 rounded-full animate-spin"></div>
        <div class="text-center">
          <p class="text-lg font-bold text-slate-700">正在同步云端模板库...</p>
          <p class="text-slate-400 text-xs mt-1">Fetching the latest creative inspirations</p>
        </div>
      </div>
    </div>

    <!-- 模板参数配置 -->
    <div v-if="selectedTemplate" class="bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
      <div class="p-8 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
        <div class="flex items-center gap-4">
          <button @click="selectedTemplate = null" class="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-100 hover:bg-blue-50 transition-all">
            ←
          </button>
          <div>
            <h2 class="text-xl font-bold text-slate-800">{{ selectedTemplate.name }}</h2>
            <p class="text-xs text-slate-400 font-medium">定制您的专属内容</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <div
            v-if="currentImageModel"
            class="hidden sm:flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-2xl shadow-sm max-w-[20rem]"
            :title="`${currentImageModel.label} · ${currentImageModel.provider} · ${currentImageModel.model}`"
          >
            <span class="text-base shrink-0">{{ currentImageModel.icon }}</span>
            <div class="min-w-0 text-left">
              <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                当前模型 · {{ currentImageModel.source }}
              </div>
              <div class="mt-1 text-xs font-black text-slate-700 truncate">
                {{ currentImageModel.label }}
                <span class="text-slate-400 font-bold">/ {{ currentImageModel.provider }}</span>
              </div>
            </div>
          </div>
          <div class="px-4 py-1.5 bg-blue-50 text-blue-600 text-[10px] font-black rounded-full uppercase tracking-widest border border-blue-100">
            Template Config
          </div>
        </div>
      </div>

      <div class="p-8 space-y-10">
        <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem] gap-8 items-start">
          <div class="space-y-10 min-w-0">
        <!-- 动态参数列表 -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div
            v-for="slot in selectedTemplate.text_slots"
            :key="slot.name"
            class="space-y-4"
            :class="slot.multiline ? 'md:col-span-2' : ''"
          >
            <label class="text-sm font-bold text-slate-700 flex items-center gap-2">
              <span class="text-blue-500">✏️</span> {{ slot.label }}
              <span v-if="slot.required" class="text-red-400 text-xs font-normal">(必填)</span>
            </label>
            <textarea
              v-if="slot.multiline"
              v-model="form.params[slot.name]"
              class="w-full bg-slate-50 border border-slate-200 rounded-[1.5rem] px-6 py-5 text-sm focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all placeholder:text-slate-400 resize-none"
              :placeholder="`请输入${slot.label}...`"
              rows="4"
            ></textarea>
            <input
              v-else
              v-model="form.params[slot.name]"
              class="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all placeholder:text-slate-400"
              :placeholder="`请输入${slot.label}`"
              :maxlength="slot.max_length || 100"
            />
          </div>
        </div>

        <!-- 颜色方案与尺寸并排 -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 border-t border-slate-50 pt-10">
          <div class="space-y-4" v-if="selectedTemplate.color_options?.length > 0">
            <label class="text-sm font-bold text-slate-700 flex items-center gap-2">
              <span class="text-blue-500">🎨</span> 色调选项
            </label>
            <div class="flex flex-wrap gap-2.5">
              <button
                v-for="color in selectedTemplate.color_options"
                :key="color"
                class="px-5 py-2.5 rounded-xl border-2 font-bold text-sm transition-all"
                :class="form.colorOption === color 
                  ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-md shadow-blue-600/10' 
                  : 'border-slate-100 bg-white hover:border-blue-200 text-slate-600'"
                @click="form.colorOption = color"
              >
                {{ color }}
              </button>
            </div>
          </div>

          <div class="space-y-4">
            <label class="text-sm font-bold text-slate-700 flex items-center gap-2">
              <span class="text-blue-500">📏</span> 输出尺寸
              <span class="text-xs text-slate-400 font-normal">(默认: {{ selectedTemplate.default_aspect_ratio }})</span>
            </label>
            <RatioSelector 
              :modelValue="form.aspectRatio || selectedTemplate.default_aspect_ratio"
              @update:modelValue="val => form.aspectRatio = val"
              :ratios="aspectRatios" 
            />
          </div>
        </div>

        <!-- 生成按钮 -->
        <div class="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-black py-5 rounded-[2rem] shadow-2xl shadow-blue-600/30 transition-all flex items-center justify-center gap-3 group relative overflow-hidden"
            :disabled="!isValid || generating || batchProcessing"
            @click="handleGenerate"
          >
            <span v-if="generating" class="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            <span v-else class="text-xl transition-transform group-hover:scale-125 group-hover:rotate-12 duration-300">🪄</span>
            <span class="text-lg tracking-wide">{{ generating ? '正在施展魔法...' : '生成渲染海报' }}</span>
            <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" v-if="!generating"></div>
          </button>
          <button
            class="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-black py-5 rounded-[2rem] shadow-2xl shadow-slate-900/20 transition-all flex items-center justify-center gap-3 group relative overflow-hidden"
            :disabled="!isValid || generating || batchSubmitting"
            @click="handleBatchGenerate"
          >
            <span v-if="batchSubmitting" class="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            <span v-else class="text-xl transition-transform group-hover:scale-125 duration-300">➕</span>
            <span class="text-lg tracking-wide">批量生产</span>
          </button>
        </div>
          </div>

          <aside
            v-if="hasBatchActivity"
            class="xl:sticky xl:top-6 bg-slate-50 border border-slate-100 rounded-[2rem] p-5 space-y-5 shadow-inner"
          >
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-black text-slate-800">批量生产队列</h3>
                <p class="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Template Batch Queue</p>
              </div>
              <span class="px-3 py-1 bg-white border border-slate-100 rounded-full text-xs font-black text-blue-600">
                {{ batchStatus?.success_count || 0 }}/{{ batchStatus?.total_count || batchResults.length + batchQueue.length }}
              </span>
            </div>

            <div v-if="batchQueue.length > 0" class="space-y-3">
              <div
                v-for="item in batchQueue"
                :key="item.id"
                class="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex items-center gap-3"
              >
                <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  :class="item.status === 'running' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'"
                >
                  <span v-if="item.status === 'running'" class="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
                  <span v-else class="text-xs font-black">{{ item.order_index + 1 }}</span>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-xs font-black text-slate-700 truncate">{{ item.title }}</div>
                  <div class="text-[10px] text-slate-400 mt-0.5">{{ item.status === 'running' ? '生成中' : '等待生成' }}</div>
                </div>
              </div>
            </div>
            <div v-else class="py-8 text-center text-xs text-slate-400 bg-white/60 rounded-2xl border border-dashed border-slate-200">
              {{ batchProcessing ? '正在收尾...' : '队列已清空' }}
            </div>
          </aside>
        </div>

        <div
          v-if="batchResults.length > 0 && isBatchComplete"
          class="border-t border-slate-100 pt-10 space-y-6"
        >
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-black text-slate-800">批量生成结果</h3>
              <p class="text-xs text-slate-400 mt-1">
                成功 {{ batchStatus?.success_count || 0 }} 张，失败 {{ batchStatus?.failed_count || 0 }} 张
              </p>
            </div>
            <button
              class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-black rounded-xl transition-colors"
              @click="clearBatchResults"
            >
              清空结果
            </button>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
            <div
              v-for="item in batchResults"
              :key="item.id"
              class="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all group"
            >
              <div v-if="item.status === 'success' && item.image_url" class="aspect-[3/4] bg-slate-900 relative overflow-hidden">
                <img :src="getImageUrl(item.image_url)" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="批量生成海报" />
                <div class="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <a :href="getImageUrl(item.image_url)" download class="px-3 py-2 bg-white rounded-xl text-xs font-black text-slate-700 shadow-lg">下载</a>
                </div>
              </div>
              <div v-else class="aspect-[3/4] bg-red-50 flex flex-col items-center justify-center gap-3 p-5 text-center">
                <span class="text-3xl">⚠️</span>
                <p class="text-xs font-bold text-red-500 line-clamp-3">{{ item.error_message || '生成失败' }}</p>
              </div>
              <div class="p-4">
                <div class="text-sm font-black text-slate-800 truncate">{{ item.title }}</div>
                <div class="text-[10px] text-slate-400 mt-1">#{{ item.order_index + 1 }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import RatioSelector from './RatioSelector.vue'
import TemplatePreview from '../template/TemplatePreview.vue'
import {
  appendTemplateBatchItems,
  createTemplateBatchTask,
  getBatchStatus,
} from '../../api.js'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

const props = defineProps({
  templates: { type: Array, default: () => [] },
  aspectRatios: { type: Array, default: () => [] },
  generating: { type: Boolean, default: false },
  prefill: { type: Object, default: null },
  currentImageModel: { type: Object, default: null },
})

const emit = defineEmits(['generate'])

const currentTab = ref('system')
const filteredTemplates = computed(() => {
  return props.templates.filter(t => {
    if (currentTab.value === 'system') return t.is_system === true
    return !t.is_system
  })
})

const selectedTemplate = ref(null)
const form = ref({
  params: {},
  colorOption: '',
  aspectRatio: null,
})
const consumedPrefillKey = ref(null)
const batchTaskId = ref(null)
const batchStatus = ref(null)
const batchSubmitting = ref(false)
let batchPollTimer = null
const terminalBatchStatuses = ['completed', 'partial_failed', 'failed']

onMounted(() => {
  const saved = sessionStorage.getItem('use_template')
  if (saved) {
    sessionStorage.removeItem('use_template')
    try {
      const tpl = JSON.parse(saved)
      if (tpl && tpl.config) {
        selectTemplate({
          id: tpl.id || null,
          index: tpl.sort_order || 0,
          name: tpl.name,
          description: tpl.description,
          category: tpl.category,
          style_tag: tpl.style_tag,
          text_slots: tpl.config.text_slots || [],
          color_options: tpl.config.color_options || [],
          default_aspect_ratio: tpl.config.default_aspect_ratio || '3:4',
          ai_prompt_template: tpl.config.ai_prompt_template || '',
        })
      }
    } catch (e) {
      console.error('解析模板数据失败:', e)
    }
  }
})

onUnmounted(() => {
  clearBatchPolling()
})

watch(
  [() => props.prefill, () => props.templates],
  () => {
    applyPrefill()
  },
  { immediate: true, deep: false },
)

const isValid = computed(() => {
  if (!selectedTemplate.value) return false
  const slots = selectedTemplate.value.text_slots || []
  for (const slot of slots) {
    if (slot.required && !form.value.params[slot.name]?.trim()) {
      return false
    }
  }
  return true
})

const batchQueue = computed(() => {
  const items = batchStatus.value?.items || []
  return items.filter(item => ['pending', 'running'].includes(item.status))
})

const batchResults = computed(() => {
  const items = batchStatus.value?.items || []
  return items.filter(item => ['success', 'failed'].includes(item.status))
})

const batchProcessing = computed(() => {
  const status = batchStatus.value?.status
  return batchSubmitting.value || status === 'pending' || status === 'running'
})

const hasBatchActivity = computed(() => {
  return !!batchTaskId.value || batchSubmitting.value || batchQueue.value.length > 0 || batchResults.value.length > 0
})

const isBatchComplete = computed(() => {
  return terminalBatchStatuses.includes(batchStatus.value?.status)
})

function selectTemplate(tpl, overrides = {}) {
  // 兜底：确保从 config 中解构出关键字段（防止缓存/数据源未映射的情况）
  const resolved = {
    ...tpl,
    text_slots: tpl.text_slots || tpl.config?.text_slots || [],
    color_options: tpl.color_options || tpl.config?.color_options || [],
    default_aspect_ratio: tpl.default_aspect_ratio || tpl.config?.default_aspect_ratio || '3:4',
    ai_prompt_template: tpl.ai_prompt_template || tpl.config?.ai_prompt_template || '',
  }
  selectedTemplate.value = resolved
  const params = {}
  for (const slot of resolved.text_slots) {
    params[slot.name] = overrides.params?.[slot.name] ?? ''
  }
  for (const [key, value] of Object.entries(overrides.params || {})) {
    if (!(key in params)) {
      params[key] = value
    }
  }
  form.value = {
    params,
    colorOption: overrides.colorOption ?? resolved.color_options?.[0] ?? '',
    aspectRatio: overrides.aspectRatio ?? null,
  }
}

function applyPrefill() {
  const prefill = props.prefill
  if (!prefill || prefill.mode !== 'template') return
  const key = prefill.remix_key || JSON.stringify(prefill)
  if (consumedPrefillKey.value === key) return

  const tpl = props.templates.find(item => item.id === prefill.template_id)
  if (!tpl) return

  currentTab.value = tpl.is_system ? 'system' : 'mine'
  selectTemplate(tpl, {
    params: prefill.params || {},
    colorOption: prefill.color_option || '',
    aspectRatio: prefill.aspect_ratio || null,
  })
  consumedPrefillKey.value = key
}


function handleGenerate() {
  if (!selectedTemplate.value || !isValid.value || props.generating) return
  emit('generate', {
    template: selectedTemplate.value,
    ...form.value
  })
}

async function handleBatchGenerate() {
  if (!selectedTemplate.value || !isValid.value || props.generating) return

  const params = JSON.parse(JSON.stringify(form.value.params))
  const item = {
    title: getBatchTitle(params),
    params,
  }
  const payload = buildTemplateBatchPayload([item])

  batchSubmitting.value = true
  try {
    let result
    if (batchTaskId.value) {
      result = await appendTemplateBatchItems(batchTaskId.value, payload)
    } else {
      result = await createTemplateBatchTask(payload)
      if (result?.task_id) {
        batchTaskId.value = result.task_id
      }
    }

    if (!result?.success) {
      throw new Error(result?.error || '加入批量队列失败')
    }
    if (!batchTaskId.value && result.task_id) {
      batchTaskId.value = result.task_id
    }

    clearTextParams()
    await refreshTemplateBatchStatus()
    startBatchPolling()
  } catch (e) {
    console.error('模板批量任务提交失败:', e)
    window.alert?.(e.response?.data?.detail || e.message || '加入批量队列失败')
  } finally {
    batchSubmitting.value = false
  }
}

function getBatchTitle(params) {
  const slots = selectedTemplate.value?.text_slots || []
  for (const slot of slots) {
    const value = params[slot.name]
    if (value && String(value).trim()) return String(value).trim()
  }
  return selectedTemplate.value?.name || '模板任务'
}

function clearTextParams() {
  const cleared = {}
  for (const key of Object.keys(form.value.params || {})) {
    cleared[key] = ''
  }
  form.value.params = cleared
}

function buildTemplateBatchPayload(items) {
  return {
    template_id: selectedTemplate.value.id,
    items,
    style_tag: selectedTemplate.value.style_tag || undefined,
    color_option: form.value.colorOption || undefined,
    aspect_ratio: form.value.aspectRatio || selectedTemplate.value.default_aspect_ratio || undefined,
  }
}

async function refreshTemplateBatchStatus() {
  if (!batchTaskId.value) return null
  try {
    const status = await getBatchStatus(batchTaskId.value)
    batchStatus.value = status
    return status
  } catch (e) {
    console.error('刷新模板批量任务状态失败:', e)
    throw e
  }
}

function startBatchPolling() {
  clearBatchPolling()
  const poll = async () => {
    try {
      const status = await refreshTemplateBatchStatus()
      if (!status || terminalBatchStatuses.includes(status.status)) {
        batchPollTimer = null
        return
      }
    } catch (e) {
      batchPollTimer = null
      return
    }
    batchPollTimer = window.setTimeout(poll, 2000)
  }
  batchPollTimer = window.setTimeout(poll, 1000)
}

function clearBatchPolling() {
  if (!batchPollTimer) return
  window.clearTimeout(batchPollTimer)
  batchPollTimer = null
}

function clearBatchResults() {
  clearBatchPolling()
  batchTaskId.value = null
  batchStatus.value = null
  batchSubmitting.value = false
}

function getImageUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${API_BASE}${url}`
}
</script>
