<template>
  <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <!-- 主配置卡片 -->
    <div class="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
      <div class="p-8 border-b border-slate-50 bg-slate-50/30">
        <h2 class="text-xl font-bold text-slate-800 tracking-tight">自定义生成</h2>
        <p class="text-xs text-slate-400 mt-1 uppercase tracking-widest font-semibold">Custom Creative Generation</p>
      </div>

      <div class="p-8 space-y-8">
        <!-- 提示词输入 -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <label class="text-sm font-bold text-slate-700 flex items-center gap-2">
              <span class="text-blue-500">✍️</span> 提示词描述
            </label>
            <div class="flex items-center gap-2">
              <button 
                @click="showPromptPicker = true"
                class="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-medium transition-colors flex items-center gap-1"
              >
                <span>📚</span> Prompt 库
              </button>
              <button 
                v-if="form.prompt.trim()"
                @click="openSavePromptModal"
                class="text-xs px-3 py-1.5 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-lg font-medium transition-colors flex items-center gap-1"
              >
                <span>⭐</span> 收藏
              </button>
            </div>
          </div>
          <textarea
            v-model="form.prompt"
            class="w-full bg-slate-50 border border-slate-200 rounded-3xl px-6 py-5 text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all placeholder:text-slate-400 resize-none overflow-y-auto"
            placeholder="描述你想要的海报风格和内容，例如：一张关于春日踏青的小红书封面，清新自然、阳光明媚..."
            rows="5"
          ></textarea>
        </div>

        <!-- 参考图片上传 -->
        <div class="space-y-4">
          <div class="flex items-center justify-between gap-4">
            <label class="text-sm font-bold text-slate-700 flex items-center gap-2">
              <span class="text-blue-500">🖼️</span> 参考图片
              <span class="text-xs text-slate-400 font-normal">（可选，可多张融合）</span>
            </label>
            <button
              type="button"
              class="text-xs px-3 py-1.5 bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600 rounded-lg font-medium transition-colors"
              @click="triggerReferenceInput"
            >
              + 添加图片
            </button>
          </div>

          <div
            class="rounded-3xl border-2 border-dashed transition-all px-5 py-5"
            :class="isDraggingReferences ? 'border-blue-500 bg-blue-50/70 shadow-lg shadow-blue-500/10' : 'border-slate-200 bg-slate-50/60 hover:border-blue-300'"
            @dragover.prevent="isDraggingReferences = true"
            @dragleave.prevent="isDraggingReferences = false"
            @drop.prevent="handleReferenceDrop"
          >
            <input
              ref="referenceInput"
              type="file"
              multiple
              class="hidden"
              accept="image/jpeg, image/png, image/webp"
              @change="handleReferenceSelect"
            />

            <div v-if="form.referenceImages.length === 0" class="min-h-[150px] flex flex-col items-center justify-center text-center gap-3 cursor-pointer" @click="triggerReferenceInput">
              <div class="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-2xl">☁️</div>
              <div>
                <p class="text-sm font-black text-slate-800">点击或拖拽图片到此处</p>
                <p class="text-xs text-slate-400 mt-1">支持一次上传多张，提示词里可引用“图1 / 图2 / 图3”</p>
              </div>
            </div>

            <div v-else class="space-y-4">
              <div class="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                <div
                  v-for="(image, index) in form.referenceImages"
                  :key="image.id"
                  class="relative shrink-0 w-36 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
                >
                  <div class="aspect-[4/3] bg-slate-100">
                    <img :src="image.image_base64" class="w-full h-full object-cover" :alt="`参考图 ${index + 1}`" />
                  </div>
                  <div class="p-2 flex items-center justify-between gap-2">
                    <span class="text-xs font-bold text-slate-700 truncate">图{{ index + 1 }}</span>
                    <button
                      type="button"
                      class="w-7 h-7 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 font-bold transition-colors"
                      title="移除图片"
                      @click="removeReferenceImage(image.id)"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  class="shrink-0 w-36 rounded-2xl border-2 border-dashed border-slate-200 bg-white/70 hover:border-blue-300 hover:bg-blue-50/60 text-slate-500 hover:text-blue-600 transition-colors flex flex-col items-center justify-center gap-2"
                  @click="triggerReferenceInput"
                >
                  <span class="text-2xl">+</span>
                  <span class="text-xs font-bold">继续添加</span>
                </button>
              </div>

              <p class="text-xs text-slate-400">
                已添加 {{ form.referenceImages.length }} 张参考图。不会限制上传张数，实际可用数量由当前模型供应商决定。
              </p>
            </div>
          </div>

          <p v-if="referenceUploadError" class="text-xs font-semibold text-red-500">{{ referenceUploadError }}</p>
        </div>

        <!-- 风格标签选择 -->
        <div class="space-y-4">
          <label class="text-sm font-bold text-slate-700 flex items-center gap-2">
            <span class="text-blue-500">🏷️</span> 风格标签
            <span class="text-xs text-slate-400 font-normal">（可多选）</span>
          </label>
          
          <div class="flex flex-wrap gap-2.5" v-if="styleTags.length > 0">
            <button
              v-for="tag in styleTags"
              :key="tag.name"
              class="group flex items-center gap-2 px-4 py-2 rounded-2xl border-2 transition-all"
              :class="form.selectedStyles.includes(tag.name) 
                ? 'border-blue-600 bg-blue-50 shadow-md shadow-blue-600/10' 
                : 'border-slate-100 bg-white hover:border-blue-200 hover:bg-slate-50'"
              @click="toggleStyle(tag.name)"
            >
              <span class="text-base group-hover:scale-110 transition-transform">{{ tag.icon }}</span>
              <span class="text-sm font-bold" :class="form.selectedStyles.includes(tag.name) ? 'text-blue-700' : 'text-slate-600'">{{ tag.name }}</span>
            </button>
          </div>
          <div v-else class="flex items-center gap-3 py-4 text-slate-400 animate-pulse">
            <div class="w-4 h-4 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin"></div>
            <span class="text-sm font-medium">加载审美预设...</span>
          </div>
        </div>

        <!-- 尺寸与色调 -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div class="space-y-4">
            <label class="text-sm font-bold text-slate-700 flex items-center gap-2">
              <span class="text-blue-500">📏</span> 输出尺寸
            </label>
            <RatioSelector v-model="form.aspectRatio" :ratios="aspectRatios" />
          </div>
          <div class="space-y-4">
            <label class="text-sm font-bold text-slate-700 flex items-center gap-2">
              <span class="text-blue-500">🎨</span> 色调偏好
            </label>
            <input
              v-model="form.colorTone"
              class="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all placeholder:text-slate-400"
              placeholder="例如：暖色调、莫兰迪色系、黑金色..."
            />
          </div>
        </div>

        <!-- 生成按钮区 -->
        <div class="pt-4 border-t border-slate-50 space-y-3">
          <div class="flex gap-3">
            <button
              class="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold py-5 rounded-3xl shadow-2xl shadow-blue-600/30 transition-all flex items-center justify-center gap-3 group relative overflow-hidden"
              :disabled="!form.prompt.trim() || generating"
              @click="handleGenerate"
            >
              <span v-if="generating" class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              <span v-else class="text-xl transition-transform group-hover:scale-125 group-hover:rotate-12 duration-300">🎨</span>
              <span class="text-lg tracking-wide">{{ generating ? 'AI 画家构思中...' : '开始生成海报' }}</span>
              <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" v-if="!generating"></div>
            </button>
            <button
              class="px-6 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold py-5 rounded-3xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 whitespace-nowrap"
              :disabled="!form.prompt.trim() || generatingPrompt"
              @click="handleGeneratePrompt"
            >
              <span v-if="generatingPrompt" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              <span v-else>📝</span>
              <span>生成提示词</span>
            </button>
          </div>

          <!-- 提示词结果展示 -->
          <div v-if="generatedPrompt" class="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm font-bold text-amber-800 flex items-center gap-2">
                📝 Prompt（可直接用于 Nano Banana Pro）
              </span>
              <div class="flex gap-2">
                <button
                  class="text-xs px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-semibold transition-all"
                  @click="copyPrompt"
                >
                  {{ copied ? '✅ 已复制' : '📋 复制' }}
                </button>
                <button
                  class="text-xs px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-lg font-semibold transition-all"
                  @click="generatedPrompt = null"
                >
                  ✕ 关闭
                </button>
              </div>
            </div>
            <pre class="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-white rounded-xl p-4 border border-amber-100 select-all cursor-text">{{ generatedPrompt }}</pre>
            <div class="text-xs text-amber-600">
              尺寸：{{ promptMeta.width }}×{{ promptMeta.height }} ({{ promptMeta.aspect_ratio }})
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 快捷提示词选择抽屉 -->
    <PromptPicker 
      :show="showPromptPicker" 
      defaultCategory="poster"
      @close="showPromptPicker = false"
      @select="handlePromptSelect"
    />

    <!-- 保存提示词弹窗 -->
    <PromptEditor 
      v-if="showSavePrompt"
      :prompt="promptToSave"
      @close="showSavePrompt = false"
      @saved="handlePromptSaved"
    />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import RatioSelector from './RatioSelector.vue'
import PromptPicker from '../prompt/PromptPicker.vue'
import PromptEditor from '../prompt/PromptEditor.vue'
import { generatePromptOnly } from '../../api.js'

const props = defineProps({
  styleTags: { type: Array, default: () => [] },
  aspectRatios: { type: Array, default: () => [] },
  generating: { type: Boolean, default: false },
  prefill: { type: Object, default: null },
})

const emit = defineEmits(['generate'])

const form = ref({
  prompt: '',
  selectedStyles: [],
  aspectRatio: '3:4',
  colorTone: '',
  referenceImages: [],
})

const generatingPrompt = ref(false)
const generatedPrompt = ref(null)
const promptMeta = ref({})
const copied = ref(false)
const consumedPrefillKey = ref(null)
const referenceInput = ref(null)
const isDraggingReferences = ref(false)
const referenceUploadError = ref('')

watch(() => props.prefill, (prefill) => {
  if (!prefill || prefill.mode !== 'custom') return
  const key = prefill.remix_key || JSON.stringify(prefill)
  if (consumedPrefillKey.value === key) return

  form.value = {
    prompt: prefill.prompt || '',
    selectedStyles: Array.isArray(prefill.selected_styles) ? [...prefill.selected_styles] : [],
    aspectRatio: prefill.aspect_ratio || '3:4',
    colorTone: prefill.color_tone || '',
    referenceImages: [],
  }
  generatedPrompt.value = null
  copied.value = false
  consumedPrefillKey.value = key
}, { immediate: true })

function toggleStyle(name) {
  const idx = form.value.selectedStyles.indexOf(name)
  if (idx >= 0) {
    form.value.selectedStyles.splice(idx, 1)
  } else {
    form.value.selectedStyles.push(name)
  }
}

function handleGenerate() {
  if (!form.value.prompt.trim() || props.generating) return
  emit('generate', {
    ...form.value,
    referenceImages: form.value.referenceImages.map((image, index) => ({
      name: `图${index + 1}`,
      image_base64: image.image_base64,
    })),
  })
}

function triggerReferenceInput() {
  referenceInput.value?.click()
}

function removeReferenceImage(id) {
  form.value.referenceImages = form.value.referenceImages.filter(image => image.id !== id)
}

async function handleReferenceSelect(event) {
  await processReferenceFiles(event.target.files)
  if (referenceInput.value) referenceInput.value.value = ''
}

async function handleReferenceDrop(event) {
  isDraggingReferences.value = false
  await processReferenceFiles(event.dataTransfer?.files)
}

async function processReferenceFiles(fileList) {
  const files = Array.from(fileList || [])
  if (files.length === 0) return

  referenceUploadError.value = ''
  const validFiles = []
  for (const file of files) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      referenceUploadError.value = '仅支持 JPG、PNG、WEBP 格式的图片'
      continue
    }
    if (file.size > 10 * 1024 * 1024) {
      referenceUploadError.value = '单张图片建议小于 10MB，过大的图片不会上传'
      continue
    }
    validFiles.push(file)
  }

  if (validFiles.length === 0) return

  try {
    const compressed = await Promise.all(validFiles.map(file => compressImage(file, 1600, 0.82)))
    const now = Date.now()
    form.value.referenceImages.push(...compressed.map((image_base64, index) => ({
      id: `${now}-${index}-${Math.random().toString(36).slice(2)}`,
      image_base64,
    })))
  } catch (error) {
    console.error('参考图片处理失败:', error)
    referenceUploadError.value = '图片处理失败，请重试'
  }
}

function compressImage(file, maxWidth = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (event) => {
      const img = new Image()
      img.src = event.target.result
      img.onload = () => {
        let width = img.width
        let height = img.height
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/webp', quality))
      }
      img.onerror = (e) => reject(e)
    }
    reader.onerror = (e) => reject(e)
  })
}

async function handleGeneratePrompt() {
  if (!form.value.prompt.trim() || generatingPrompt.value) return
  generatingPrompt.value = true
  copied.value = false
  try {
    const res = await generatePromptOnly({
      prompt: form.value.prompt,
      style_tags: form.value.selectedStyles.length > 0 ? form.value.selectedStyles : undefined,
      aspect_ratio: form.value.aspectRatio,
      color_tone: form.value.colorTone || undefined,
    })
    if (res.success) {
      generatedPrompt.value = res.prompt
      promptMeta.value = {
        aspect_ratio: res.aspect_ratio,
        width: res.width,
        height: res.height,
      }
    } else {
      generatedPrompt.value = `生成失败: ${res.error || '未知错误'}`
      promptMeta.value = {}
    }
  } catch (e) {
    console.error('生成提示词失败:', e)
    generatedPrompt.value = `请求失败: ${e.message || '网络错误'}`
    promptMeta.value = {}
  } finally {
    generatingPrompt.value = false
  }
}

function copyPrompt() {
  if (!generatedPrompt.value) return
  navigator.clipboard.writeText(generatedPrompt.value).then(() => {
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  })
}

// ============ Prompt 库集成 ============
const showPromptPicker = ref(false)
const showSavePrompt = ref(false)
const promptToSave = ref(null)

const handlePromptSelect = (content) => {
  // 如果当前已有内容，追加到末尾；否则直接替换
  if (form.value.prompt.trim()) {
    form.value.prompt = form.value.prompt.trim() + '\n\n' + content
  } else {
    form.value.prompt = content
  }
}

const openSavePromptModal = () => {
  promptToSave.value = {
    content: form.value.prompt,
    category: 'poster',
    tags: form.value.selectedStyles.length > 0 ? [...form.value.selectedStyles] : []
  }
  showSavePrompt.value = true
}

const handlePromptSaved = () => {
  showSavePrompt.value = false
  // 可以添加一个全局的 Toast 提示成功
}
</script>
