<template>
  <div class="h-full flex flex-col bg-slate-50/50">
    <!-- 顶部功能切换区 (Pill Tabs) -->
    <div class="px-8 pt-6 pb-2">
      <div class="bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200 inline-flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap"
          :class="activeTab === tab.id 
            ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' 
            : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'"
          @click="switchTab(tab.id)"
        >
          <span>{{ tab.icon }}</span>
          <span>{{ tab.label }}</span>
        </button>
      </div>
    </div>

    <!-- 主体内容区 -->
    <div class="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar">
      <div class="max-w-7xl mx-auto space-y-6 pt-4">
        
        <!-- ============ 面板区域 ============ -->
        <component 
          :is="activePanel"
          v-if="!generatedResult"
          :styleTags="styleTags"
          :aspectRatios="aspectRatios"
          :templates="templates"
          :generating="generating"
          :prefill="panelPrefill"
          :currentImageModel="currentImageModel"
          @generate="handleGenerateDispatch"
        />

        <!-- ============ 生成结果展示 ============ -->
        <ResultDisplay
          v-if="generatedResult"
          :result="generatedResult"
          @reset="generatedResult = null"
        />
      </div>
    </div>

    <!-- ============ 生成中遮罩 ============ -->
    <div v-if="generating" class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm transition-all duration-500">
      <div class="bg-white/90 p-10 rounded-3xl shadow-2xl flex flex-col items-center gap-6 max-w-sm w-full mx-4 border border-white/20">
        <div class="relative w-20 h-20">
          <div class="absolute inset-0 rounded-full border-4 border-blue-100 opacity-30"></div>
          <div class="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
          <div class="absolute inset-0 flex items-center justify-center text-3xl">🎨</div>
        </div>
        <div class="text-center">
          <h3 class="text-xl font-bold text-slate-800 mb-2">AI 正在创作灵感...</h3>
          <p class="text-sm text-slate-500 mb-1">正在为您生成高品质的海报设计</p>
          <div class="flex items-center justify-center gap-1.5 mt-4">
            <span class="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" style="animation-delay: 0s"></span>
            <span class="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" style="animation-delay: 0.1s"></span>
            <span class="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, defineAsyncComponent, computed } from 'vue'
import { useRoute } from 'vue-router'

// 静态引入共享、轻量的展示组件
import ResultDisplay from './components/poster/ResultDisplay.vue'

// 动态懒加载 7 大核心面板（极大减小首屏打包体积）
const PanelBatch = defineAsyncComponent(() => import('./components/poster/PanelBatch.vue'))
const PanelCustom = defineAsyncComponent(() => import('./components/poster/PanelCustom.vue'))
const PanelTemplate = defineAsyncComponent(() => import('./components/poster/PanelTemplate.vue'))
const PanelEdit = defineAsyncComponent(() => import('./components/poster/PanelEdit.vue'))
const PanelInpaint = defineAsyncComponent(() => import('./components/poster/PanelInpaint.vue'))
const PanelAdapt = defineAsyncComponent(() => import('./components/poster/PanelAdapt.vue'))
const PanelStyle = defineAsyncComponent(() => import('./components/poster/PanelStyle.vue'))

import {
  generateCustomPoster,
  generateTemplatePoster,
  generateEditPoster,
  generateInpaintPoster,
  generateErasePoster,
  generateAdaptPoster,
  generateExportAll,
  generateStyleTransfer,
  generateBatchPoster,
  getTemplatesList,
  getPosterStyles,
  getPosterAspectRatios,
  getPreferences,
  getImageModels,
} from './api.js'
import {
  consumePosterRemixPayload,
  resolvePosterRemixTarget,
} from './utils/posterRemix.js'
import { consumePromptApplyPayload } from './utils/promptApply.js'

const route = useRoute()

// ============== 状态 ==============
const activeTab = ref(route.query.tab || 'batch')
const generating = ref(false)
const generatedResult = ref(null)
const panelPrefill = ref(null)
const preferences = ref({})
const imageModels = ref([])

const tabs = [
  { id: 'batch', label: '批量生成', icon: '📦' },
  { id: 'custom', label: '自定义生成', icon: '✨' },
  { id: 'template', label: '模板生成', icon: '📋' },
  { id: 'edit', label: '以图改图', icon: '✏️' },
  { id: 'inpaint', label: '局部重绘', icon: '🖌️' },
  { id: 'adapt', label: '尺寸适配', icon: '📐' },
  { id: 'style', label: '风格迁移', icon: '🌈' },
]

const activePanel = computed(() => {
  switch (activeTab.value) {
    case 'batch': return PanelBatch
    case 'custom': return PanelCustom
    case 'template': return PanelTemplate
    case 'edit': return PanelEdit
    case 'inpaint': return PanelInpaint
    case 'adapt': return PanelAdapt
    case 'style': return PanelStyle
    default: return PanelBatch
  }
})

const builtinImageProviders = {
  gemini: {
    icon: '💎',
    label: 'Gemini',
    provider: 'xunruijie',
    model: 'gemini-3-pro-image-preview',
  },
  gpt_image: {
    icon: '🖼️',
    label: 'GPT Image 2',
    provider: 'scdn',
    model: 'gpt-image-2',
  },
  doubao: {
    icon: '🎨',
    label: '豆包 Seedream',
    provider: '火山方舟',
    model: 'doubao-seedream',
  },
}

const currentImageModel = computed(() => {
  const selectedModelId = preferences.value?.image_model_config_id
  if (selectedModelId) {
    const model = imageModels.value.find(item => item.id === selectedModelId)
    if (model) {
      return {
        icon: providerIcon(model.provider_type),
        label: model.name,
        provider: providerLabel(model.provider_type),
        model: model.model_name,
        source: '个人选择',
      }
    }
  }

  const selectedProvider = preferences.value?.image_provider
  if (selectedProvider && builtinImageProviders[selectedProvider]) {
    return {
      ...builtinImageProviders[selectedProvider],
      source: '个人选择',
    }
  }

  const defaultModel = imageModels.value.find(item => item.is_active && item.is_default)
  if (defaultModel) {
    return {
      icon: providerIcon(defaultModel.provider_type),
      label: defaultModel.name,
      provider: providerLabel(defaultModel.provider_type),
      model: defaultModel.model_name,
      source: '系统默认',
    }
  }

  return {
    icon: '⚙️',
    label: '系统默认',
    provider: '.env',
    model: '全局配置',
    source: '系统默认',
  }
})

// 预置数据
const styleTags = ref([])
const templates = ref([])
const aspectRatios = ref([])

// ============== 优化：策略映射字典 ==============
const apiMethodMap = {
  batch: generateBatchPoster,
  custom: generateCustomPoster,
  template: generateTemplatePoster,
  edit: generateEditPoster,
  inpaint: generateInpaintPoster,
  erase: generateErasePoster,
  adapt: generateAdaptPoster,
  export_all: generateExportAll,
  style: generateStyleTransfer,
}

// ============== 初始化 ==============
onMounted(async () => {
  await Promise.all([
    loadStyles(),
    loadTemplates(),
    loadAspectRatios(),
    loadImageModelContext(),
  ])
  consumeRemixWork()
  consumePromptApplication()
})

function switchTab(tabId) {
  activeTab.value = tabId
  generatedResult.value = null
  panelPrefill.value = null
}

function consumeRemixWork() {
  const payload = consumePosterRemixPayload(sessionStorage)
  const target = resolvePosterRemixTarget(payload, templates.value)
  if (!target) return

  activeTab.value = target.tab
  generatedResult.value = null
  panelPrefill.value = target.prefill
}

function consumePromptApplication() {
  const payload = consumePromptApplyPayload(sessionStorage, 'poster')
  if (!payload) return

  activeTab.value = 'custom'
  generatedResult.value = null
  panelPrefill.value = {
    mode: 'custom',
    remix_key: `prompt:${payload.prompt_id}:${payload.created_at}`,
    prompt: payload.content,
  }
}

// ============== 本地缓存工具函数 ==============
function getCachedData(key) {
  const cached = localStorage.getItem(key)
  if (cached) {
    try {
      const parsed = JSON.parse(cached)
      // 检查缓存是否过期（设置 4 小时有效期）
      if (Date.now() - parsed.timestamp < 4 * 60 * 60 * 1000) {
        return parsed.data
      }
    } catch (e) {
      console.warn('缓存读取失败:', e)
    }
  }
  return null
}

function setCachedData(key, data) {
  localStorage.setItem(key, JSON.stringify({
    timestamp: Date.now(),
    data: data
  }))
}

// ============== 数据加载逻辑 ==============

async function loadStyles() {
  const CACHE_KEY = 'poster_styles_cache'
  const cached = getCachedData(CACHE_KEY)
  if (cached) {
    styleTags.value = cached
    return
  }
  try {
    const data = await getPosterStyles()
    styleTags.value = data.tags || []
    setCachedData(CACHE_KEY, styleTags.value)
  } catch (e) {
    console.error('加载风格标签失败:', e)
  }
}

async function loadTemplates() {
  // 清除旧版缓存 key，避免干扰
  localStorage.removeItem('poster_templates_cache')
  const CACHE_KEY = 'poster_all_templates_cache'
  const cached = getCachedData(CACHE_KEY)
  if (cached) {
    templates.value = cached
    return
  }
  try {
    const data = await getTemplatesList({ scope: 'all' })
    const parsedData = (data || []).map(t => ({
      ...t,
      text_slots: t.config?.text_slots || [],
      color_options: t.config?.color_options || [],
      default_aspect_ratio: t.config?.default_aspect_ratio || '3:4',
    }))
    templates.value = parsedData
    setCachedData(CACHE_KEY, templates.value)
  } catch (e) {
    console.error('加载模板失败:', e)
  }
}

async function loadAspectRatios() {
  const CACHE_KEY = 'poster_ratios_cache'
  const cached = getCachedData(CACHE_KEY)
  if (cached) {
    aspectRatios.value = cached
    return
  }
  try {
    const data = await getPosterAspectRatios()
    aspectRatios.value = data.ratios || []
    setCachedData(CACHE_KEY, aspectRatios.value)
  } catch (e) {
    console.error('加载尺寸比例失败:', e)
    // 使用默认值保底
    aspectRatios.value = [
      { key: '3:4', label: '小红书', width: 1080, height: 1440 },
      { key: '1:1', label: '正方形', width: 1080, height: 1080 },
      { key: '9:16', label: '抖音', width: 1080, height: 1920 },
      { key: '16:9', label: '横版', width: 1920, height: 1080 },
      { key: '2.35:1', label: '公众号', width: 1080, height: 460 },
    ]
  }
}

async function loadImageModelContext() {
  try {
    const [prefs, models] = await Promise.all([
      getPreferences(),
      getImageModels(false),
    ])
    preferences.value = prefs || {}
    imageModels.value = models.items || []
  } catch (e) {
    console.error('加载当前图片模型失败:', e)
  }
}

function providerLabel(type) {
  if (type === 'openai_image') return 'OpenAI Image'
  if (type === 'gemini') return 'Gemini'
  if (type === 'doubao') return '豆包 Seedream'
  return type || '未知供应商'
}

function providerIcon(type) {
  if (type === 'gemini') return '💎'
  if (type === 'doubao') return '🎨'
  return '🖼️'
}

// ============== Api 统一执行外壳 ==============

async function generateWithWrapper(mode, payload) {
  generating.value = true
  generatedResult.value = null
  
  const func = apiMethodMap[mode]
  if (!func) {
    console.warn(`未知的生成模式: ${mode}`)
    generating.value = false
    return
  }

  try {
    const result = await func(payload)
    generatedResult.value = result
  } catch (e) {
    generatedResult.value = {
      success: false,
      error: e.response?.data?.detail || e.message || '生成失败',
      mode: mode
    }
  } finally {
    generating.value = false
  }
}

// ============== 事件分发中心 ==============

function handleGenerateDispatch(form) {
  switch (activeTab.value) {
    case 'batch': handleBatchGenerate(form); break
    case 'custom': handleCustomGenerate(form); break
    case 'template': handleTemplateGenerate(form); break
    case 'edit': handleEditGenerate(form); break
    case 'inpaint': handleInpaintGenerate(form); break
    case 'adapt': handleAdaptGenerate(form); break
    case 'style': handleStyleGenerate(form); break
  }
}

function handleBatchGenerate(form) {
  generateWithWrapper('batch', {
    mode: 'custom', 
    aspect_ratio: form.aspectRatio,
    color_tone: form.colorTone || undefined,
    style_tags: form.selectedStyles.length > 0 ? form.selectedStyles : undefined,
    series_mode: form.seriesMode,
    items: form.items
  })
}

function handleCustomGenerate(form) {
  generateWithWrapper('custom', {
    prompt: form.prompt,
    style_tags: form.selectedStyles.length > 0 ? form.selectedStyles : undefined,
    aspect_ratio: form.aspectRatio,
    color_tone: form.colorTone || undefined,
    reference_images: form.referenceImages?.length > 0 ? form.referenceImages : undefined,
  })
}

function handleTemplateGenerate(form) {
  const payload = {
    template_id: form.template.id,
    params: form.params,
    color_option: form.colorOption || undefined,
    aspect_ratio: form.aspectRatio || undefined,
  }

  generateWithWrapper('template', payload)
}

function handleEditGenerate(form) {
  generateWithWrapper('edit', {
    image_base64: form.imageBase64,
    edit_prompt: form.editPrompt,
    aspect_ratio: form.aspectRatio,
  })
}

function handleInpaintGenerate(form) {
  if (form.editMode === 'inpaint') {
    generateWithWrapper('inpaint', {
      image_base64: form.imageBase64,
      mask_base64: form.maskBase64,
      inpaint_prompt: form.prompt,
    })
  } else {
    generateWithWrapper('erase', {
      image_base64: form.imageBase64,
      mask_base64: form.maskBase64,
    })
  }
}

function handleAdaptGenerate(form) {
  if (form.exportAll) {
    generateWithWrapper('export_all', {
      image_base64: form.imageBase64,
      source_ratio: form.sourceRatio,
      strategy: form.strategy,
      outpaint_prompt: form.outpaintPrompt || undefined
    })
  } else {
    generateWithWrapper('adapt', {
      image_base64: form.imageBase64,
      source_ratio: form.sourceRatio,
      target_ratio: form.targetRatio,
      strategy: form.strategy,
      outpaint_prompt: form.outpaintPrompt || undefined
    })
  }
}

function handleStyleGenerate(form) {
  generateWithWrapper('style', {
    image_base64: form.imageBase64,
    style_tags: form.selectedStyles,
    strength: form.strength,
    aspect_ratio: form.aspectRatio,
  })
}
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  display: none;
}
.custom-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
