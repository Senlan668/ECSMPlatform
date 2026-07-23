<template>
  <div 
    class="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 transition-all duration-300"
    :class="{ 'opacity-100 backdrop-blur-xl': true }"
  >
    <!-- 背景遮罩 -->
    <div class="absolute inset-0 bg-slate-900/60 transition-opacity" @click="$emit('close')"></div>
    
    <!-- 模态框主体 -->
    <div class="relative bg-white w-full max-w-6xl h-full max-h-[850px] rounded-[32px] shadow-2xl overflow-hidden flex flex-col md:flex-row animate-in fade-in zoom-in duration-300">
      <!-- 关闭按钮 -->
      <button 
        class="absolute top-6 right-6 z-20 w-10 h-10 flex items-center justify-center bg-white/20 hover:bg-white/40 backdrop-blur-md text-white rounded-full transition-all active:scale-90 text-2xl"
        @click="$emit('close')"
      >
        ×
      </button>

      <!-- 左侧：高清预览 -->
      <div class="flex-[1.5] bg-slate-950 flex shadow-inner relative group overflow-hidden">
        <img 
          :src="item.image_url" 
          :alt="item.title" 
          class="w-full h-full object-contain p-8 drop-shadow-2xl"
        />
        <!-- 装饰性渐变 -->
        <div class="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none"></div>
      </div>

      <!-- 右侧：详情面板 -->
      <div class="flex-1 flex flex-col bg-white border-l border-slate-100 min-w-[380px]">
        <!-- 面板头部 -->
        <div class="p-8 border-b border-slate-50 space-y-4">
          <div class="flex flex-wrap gap-2">
            <span class="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold uppercase tracking-wider">{{ formatMode(item.mode) }}</span>
            <span class="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-xs font-bold">{{ item.aspect_ratio }}</span>
          </div>
          <!-- 标题区域：内联编辑 -->
          <div class="group relative">
            <!-- 显示模式 -->
            <div v-if="!isEditingTitle" class="flex items-center gap-2">
              <h2 class="text-2xl font-black text-slate-800 leading-tight">
                {{ item.title || '未命名作品' }}
              </h2>
              <button
                class="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                title="重命名"
                @click="startEditTitle"
              >
                ✏️
              </button>
            </div>
            <!-- 编辑模式 -->
            <div v-else class="space-y-1" ref="editContainerRef">
              <div class="flex items-center gap-2">
                <input
                  ref="titleInputRef"
                  v-model="editTitleValue"
                  type="text"
                  maxlength="200"
                  :disabled="isSubmittingTitle"
                  class="flex-1 text-xl font-bold text-slate-800 border border-blue-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  @keydown.enter="submitTitle"
                  @keydown.escape="cancelEditTitle"
                />
                <button
                  :disabled="isSubmittingTitle"
                  class="px-3 py-1.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  @click="submitTitle"
                >
                  确认
                </button>
                <button
                  :disabled="isSubmittingTitle"
                  class="px-3 py-1.5 bg-slate-100 text-slate-600 text-sm font-bold rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  @click="cancelEditTitle"
                >
                  取消
                </button>
              </div>
              <p v-if="titleError" class="text-red-500 text-xs font-medium">{{ titleError }}</p>
            </div>
          </div>
          <div class="flex items-center gap-2 text-slate-400 text-sm">
            <span>📅 创建于 {{ formatDate(item.created_at) }}</span>
          </div>
        </div>

        <!-- 面板主滚动区 -->
        <div class="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
          <!-- 提示词展示 -->
          <div class="space-y-3" v-if="item.prompt">
            <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <span class="w-1 h-3 bg-blue-500 rounded-full"></span> 核心提示词
            </h3>
            <div class="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-sm text-slate-700 leading-relaxed font-medium">
              {{ item.prompt }}
            </div>
          </div>

          <!-- AI 优化后的词 -->
          <div class="space-y-3" v-if="item.ai_prompt_used">
            <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center justify-between">
              <span class="flex items-center gap-2"><span class="w-1 h-3 bg-indigo-500 rounded-full"></span> AI 执行词</span>
              <button 
                @click="copyText(item.ai_prompt_used)"
                class="text-blue-600 hover:text-blue-700 active:scale-95 transition-all flex items-center gap-1"
              >
                <span>📋</span> 复制
              </button>
            </h3>
            <div class="p-4 bg-slate-900 rounded-2xl border border-slate-800 text-[13px] text-slate-300 leading-relaxed font-mono break-all">
              {{ item.ai_prompt_used }}
            </div>
          </div>

          <!-- 风格标签 -->
          <div class="space-y-3" v-if="item.style_tags && item.style_tags.length">
            <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <span class="w-1 h-3 bg-emerald-500 rounded-full"></span> 风格标签
            </h3>
            <div class="flex flex-wrap gap-2">
              <span 
                v-for="tag in item.style_tags" 
                :key="tag" 
                class="px-3 py-1.5 bg-slate-50 text-slate-600 rounded-xl text-xs font-bold border border-slate-100"
              >
                {{ tag }}
              </span>
            </div>
          </div>

          <!-- 参数详情 (JSON) -->
          <div class="space-y-3" v-if="item.params && Object.keys(item.params).length">
            <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <span class="w-1 h-3 bg-orange-500 rounded-full"></span> 引擎详细参数
            </h3>
            <pre class="p-4 bg-slate-50 rounded-2xl text-[12px] text-slate-500 font-mono overflow-x-auto border border-slate-100">{{ JSON.stringify(item.params, null, 2) }}</pre>
          </div>
        </div>

        <!-- 面板底部操作区 -->
        <div class="p-8 border-t border-slate-50 bg-slate-50/30 grid grid-cols-2 gap-3">
          <button 
            class="col-span-2 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            @click="$emit('remix', item)"
          >
            🚀 基于此作品进行二次创作
          </button>
          <button
            v-if="item.image_url"
            class="col-span-2 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold shadow-lg shadow-emerald-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            @click="salesModalOpen = true"
          >
            🔗 关联销售系统
          </button>
          <button 
            class="py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
            @click="$emit('toggle-favorite', item.id)"
          >
            {{ item.is_favorite ? '⭐ 已收藏' : '☆ 加入收藏' }}
          </button>
          <button 
            class="py-3 bg-white border border-red-100 text-red-500 rounded-2xl font-bold hover:bg-red-50 transition-all flex items-center justify-center gap-2"
            @click="handleDelete"
          >
            🗑️ 彻底删除
          </button>
        </div>
      </div>
    </div>

    <SalesSyncModal
      v-if="item.image_url"
      :is-open="salesModalOpen"
      :image-url="item.image_url"
      :default-title="item.title || '喜报'"
      @close="salesModalOpen = false"
    />
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import SalesSyncModal from '../common/SalesSyncModal.vue'
import { renameGalleryWork } from '../../api.js'

const props = defineProps({
  item: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close', 'toggle-favorite', 'delete', 'remix', 'renamed'])
const salesModalOpen = ref(false)

// ============== 内联编辑状态 ==============
const isEditingTitle = ref(false)
const editTitleValue = ref('')
const isSubmittingTitle = ref(false)
const titleError = ref('')
const titleInputRef = ref(null)
const editContainerRef = ref(null)

watch(() => props.item.id, () => {
  salesModalOpen.value = false
  cancelEditTitle()
})

// 点击外部区域取消编辑
function handleClickOutside(event) {
  if (
    isEditingTitle.value &&
    !isSubmittingTitle.value &&
    editContainerRef.value &&
    !editContainerRef.value.contains(event.target)
  ) {
    cancelEditTitle()
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside)
})

function startEditTitle() {
  isEditingTitle.value = true
  editTitleValue.value = props.item.title || ''
  titleError.value = ''
  nextTick(() => {
    titleInputRef.value?.focus()
    titleInputRef.value?.select()
  })
}

function cancelEditTitle() {
  isEditingTitle.value = false
  editTitleValue.value = ''
  titleError.value = ''
  isSubmittingTitle.value = false
}

async function submitTitle() {
  // 校验：空标题或纯空白
  const trimmed = editTitleValue.value.trim()
  if (!trimmed) {
    titleError.value = '名称不能为空'
    return
  }

  titleError.value = ''
  isSubmittingTitle.value = true

  try {
    const result = await renameGalleryWork(props.item.id, editTitleValue.value)
    // 更新本地状态
    props.item.title = result.title
    props.item.updated_at = result.updated_at
    isEditingTitle.value = false
    emit('renamed', { id: result.id, title: result.title, updated_at: result.updated_at })
  } catch (e) {
    // 失败时恢复输入框为可编辑状态，保留用户输入内容
    titleError.value = e.response?.data?.detail || '重命名失败，请重试'
  } finally {
    isSubmittingTitle.value = false
  }
}

function formatMode(mode) {
  const map = {
    custom: '自定义生成',
    template: '模板生成',
    edit: '以图改图',
    style_transfer: '风格迁移',
    inpaint: '局部重绘',
    erase: '智能擦除',
    adapt: '尺寸适配',
    export_all: '全平台导出',
    batch: '批量生成'
  }
  return map[mode] || mode
}

function formatDate(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleString()
}

function copyText(text) {
  navigator.clipboard.writeText(text)
    .then(() => alert('✅ 已成功复制到剪贴板'))
    .catch(() => alert('❌ 复制失败'))
}

function handleDelete() {
  emit('delete', props.item.id)
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
