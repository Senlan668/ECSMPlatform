<template>
  <div class="bg-white border border-slate-200 rounded-2xl p-5 hover:border-blue-300 hover:shadow-md transition-all group flex flex-col h-64">
    <!-- 头部 -->
    <div class="flex justify-between items-start mb-3 shrink-0">
      <div class="flex-1 min-w-0 pr-4">
        <h3 class="font-bold text-slate-800 text-base truncate flex items-center gap-1.5" :title="prompt.title">
          <span v-if="prompt.category === 'poster'" class="text-lg">🎨</span>
          <span v-else-if="prompt.category === 'workflow'" class="text-lg">⚡</span>
          <span v-else class="text-lg">🔧</span>
          <span class="truncate">{{ prompt.title }}</span>
        </h3>
        <div class="text-xs text-slate-400 mt-1 flex items-center gap-2">
          <span>{{ formatDate(prompt.created_at) }}</span>
          <span v-if="prompt.is_public" class="px-1.5 py-0.5 bg-green-50 text-green-600 rounded text-[10px]">公开</span>
          <span v-else class="px-1.5 py-0.5 bg-slate-50 text-slate-500 rounded text-[10px]">私有</span>
        </div>
      </div>
      
      <!-- 操作菜单 -->
      <div class="relative shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          @click="showMenu = !showMenu"
          @blur="closeMenuDelay"
          class="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path>
          </svg>
        </button>
        
        <div v-if="showMenu" class="absolute right-0 mt-1 w-28 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-20">
          <button @click="$emit('edit', prompt)" class="w-full text-left px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-blue-600">编辑</button>
          <button v-if="!prompt.is_public" @click="$emit('publish', prompt.id)" class="w-full text-left px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-green-600">发布共享</button>
          <button @click="$emit('delete', prompt.id)" class="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">删除</button>
        </div>
      </div>
    </div>

    <!-- 标签 -->
    <div class="flex flex-wrap gap-1.5 mb-3 shrink-0 h-[22px] overflow-hidden">
      <span v-for="tag in (prompt.tags || []).slice(0, 3)" :key="tag" class="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md text-[10px] font-medium truncate max-w-[80px]">
        {{ tag }}
      </span>
      <span v-if="(prompt.tags || []).length > 3" class="px-1.5 py-0.5 bg-slate-50 text-slate-400 rounded-md text-[10px]">
        +{{ prompt.tags.length - 3 }}
      </span>
    </div>

    <!-- 内容预览 -->
    <div class="flex-1 bg-slate-50 rounded-xl p-3 text-sm text-slate-600 relative overflow-hidden group/content cursor-pointer border border-transparent hover:border-blue-100 hover:bg-blue-50/30 transition-colors" @click="copyContent">
      <div class="line-clamp-4 leading-relaxed font-mono text-[13px] opacity-80">{{ prompt.content }}</div>
      
      <!-- 渐变遮罩 -->
      <div class="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-slate-50 group-hover/content:from-blue-50/90 to-transparent"></div>
      
      <!-- 复制提示 -->
      <div class="absolute right-2 bottom-2 text-[10px] bg-white px-2 py-1 rounded shadow-sm text-blue-600 opacity-0 group-hover/content:opacity-100 transition-opacity flex items-center gap-1">
        <span v-if="copied">已复制 ✓</span>
        <span v-else>点击复制内容</span>
      </div>
    </div>

    <!-- 底部状态 -->
    <div class="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 shrink-0">
      <div class="flex items-center gap-3">
        <span class="flex items-center gap-1" title="使用次数">
          <span>🔄</span> {{ prompt.use_count || 0 }}
        </span>
      </div>
      <button
        v-if="canApply"
        @click="$emit('use', prompt)"
        :disabled="applying || applyDisabled"
        class="text-blue-600 font-medium hover:text-blue-700 hover:underline flex items-center gap-1 disabled:text-slate-400 disabled:no-underline disabled:cursor-not-allowed"
      >
        <span>{{ applying ? '应用中' : '应用' }}</span>
        <span>→</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { APPLICABLE_PROMPT_CATEGORIES } from '../../utils/promptApply.js'

const props = defineProps({
  prompt: {
    type: Object,
    required: true
  },
  applying: Boolean,
  applyDisabled: Boolean
})

const emit = defineEmits(['edit', 'delete', 'publish', 'use'])

const showMenu = ref(false)
const copied = ref(false)
const canApply = computed(() => APPLICABLE_PROMPT_CATEGORIES.includes(props.prompt.category))

const closeMenuDelay = () => {
  setTimeout(() => {
    showMenu.value = false
  }, 200)
}

const formatDate = (isoString) => {
  if (!isoString) return ''
  const date = new Date(isoString)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

const copyContent = async () => {
  try {
    await navigator.clipboard.writeText(props.prompt.content)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch (err) {
    console.error('复制失败', err)
  }
}
</script>
