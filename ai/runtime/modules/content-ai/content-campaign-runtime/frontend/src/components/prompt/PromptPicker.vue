<template>
  <div v-if="show" class="fixed inset-y-0 right-0 z-[100] w-96 bg-white shadow-2xl border-l border-slate-200 flex flex-col transform transition-transform duration-300" :class="show ? 'translate-x-0' : 'translate-x-full'">
    <!-- 头部 -->
    <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50">
      <h3 class="text-base font-bold text-slate-800 flex items-center gap-2">
        <span>📚</span>
        <span>选择提示词</span>
      </h3>
      <button @click="$emit('close')" class="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200 transition-colors">
        ✕
      </button>
    </div>

    <!-- 搜索栏 -->
    <div class="p-4 border-b border-slate-100 shrink-0">
      <div class="relative">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <span class="text-slate-400 text-sm">🔍</span>
        </div>
        <input 
          v-model="searchKeyword"
          @input="handleSearch"
          type="text" 
          placeholder="搜索提示词..." 
          class="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
        />
      </div>
      
      <!-- 分类过滤 (水平滚动) -->
      <div class="flex overflow-x-auto no-scrollbar gap-2 mt-3">
        <button 
          v-for="cat in categories" :key="cat.value"
          @click="activeCategory = cat.value; fetchPrompts()"
          class="px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0"
          :class="activeCategory === cat.value ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
        >
          {{ cat.label }}
        </button>
      </div>
    </div>

    <!-- 列表区域 -->
    <div class="flex-1 overflow-y-auto p-4 custom-scrollbar relative bg-slate-50/30">
      <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-10">
        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>

      <div v-else-if="prompts.length === 0" class="h-full flex flex-col items-center justify-center text-center text-slate-500 py-10">
        <div class="text-3xl mb-2">📭</div>
        <p class="text-sm">暂无提示词</p>
      </div>

      <div v-else class="space-y-3">
        <div 
          v-for="prompt in prompts" :key="prompt.id"
          class="bg-white border border-slate-200 rounded-xl p-3 hover:border-blue-300 hover:shadow-sm transition-all group cursor-pointer"
          @click="handleSelect(prompt)"
        >
          <div class="flex justify-between items-start mb-1.5">
            <h4 class="font-bold text-slate-800 text-sm truncate flex-1 pr-2" :title="prompt.title">
              {{ prompt.title }}
            </h4>
            <span v-if="prompt.is_public" class="px-1.5 py-0.5 bg-green-50 text-green-600 rounded text-[10px] shrink-0">公开</span>
          </div>
          
          <div class="text-[13px] text-slate-500 line-clamp-2 leading-relaxed mb-2 font-mono">
            {{ prompt.content }}
          </div>
          
          <div class="flex items-center justify-between mt-2 pt-2 border-t border-slate-50">
            <div class="flex flex-wrap gap-1 h-[20px] overflow-hidden">
              <span v-for="tag in (prompt.tags || []).slice(0, 2)" :key="tag" class="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px]">
                {{ tag }}
              </span>
            </div>
            <button class="text-xs font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-blue-50 px-2 py-1 rounded">
              使用 →
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  
  <!-- 背景遮罩 -->
  <div v-if="show" @click="$emit('close')" class="fixed inset-0 bg-slate-900/20 backdrop-blur-[1px] z-[90] transition-opacity duration-300"></div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { getPromptList, usePrompt } from '../../api'

const props = defineProps({
  show: Boolean,
  defaultCategory: {
    type: String,
    default: 'all'
  }
})

const emit = defineEmits(['close', 'select'])

const loading = ref(false)
const prompts = ref([])
const activeCategory = ref(props.defaultCategory)
const searchKeyword = ref('')
let searchTimeout = null

const categories = [
  { label: '全部', value: 'all' },
  { label: '海报', value: 'poster' },
  { label: '工作流', value: 'workflow' },
]

const fetchPrompts = async () => {
  loading.value = true
  try {
    const res = await getPromptList({
      category: activeCategory.value,
      keyword: searchKeyword.value
    })
    prompts.value = res.items || []
  } catch (error) {
    console.error('获取提示词失败:', error)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    fetchPrompts()
  }, 300)
}

const handleSelect = async (prompt) => {
  // 触发使用计数增加
  try {
    await usePrompt(prompt.id)
  } catch (e) {
    // 忽略错误
  }
  emit('select', prompt.content)
  emit('close')
}

watch(() => props.show, (newVal) => {
  if (newVal) {
    activeCategory.value = props.defaultCategory
    searchKeyword.value = ''
    fetchPrompts()
  }
})

onMounted(() => {
  if (props.show) {
    fetchPrompts()
  }
})
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 20px;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
