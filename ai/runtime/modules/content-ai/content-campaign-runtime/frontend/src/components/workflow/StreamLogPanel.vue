<template>
  <div class="h-full flex flex-col bg-slate-900 overflow-hidden relative border-l border-slate-800">
    <!-- Header: 整合了指标与控制按钮 -->
    <div class="bg-slate-800/80 backdrop-blur-md px-6 py-4 border-b border-slate-800 flex items-center justify-between z-10 sticky top-0">
      <div class="flex items-center gap-3">
        <div class="relative">
          <span class="w-3 h-3 bg-green-500 rounded-full block" :class="{ 'animate-pulse': logs.length > 0 }"></span>
          <span class="absolute inset-0 w-3 h-3 bg-green-500 rounded-full animate-ping opacity-20"></span>
        </div>
        <h3 class="text-xs font-bold text-slate-200 uppercase tracking-widest">Workflow Console</h3>
        <span v-if="mergedLogs.length > 0" class="bg-blue-500/10 text-blue-400 px-2.5 py-0.5 rounded-full text-[10px] font-mono border border-blue-500/20">
          {{ mergedLogs.length }} EVENTS
        </span>
      </div>
      
      <div class="flex items-center gap-3">
        <button 
          v-if="logs.length > 0"
          @click="$emit('clear')"
          class="text-[10px] font-bold text-slate-500 hover:text-red-400 uppercase transition-colors px-2 py-1 hover:bg-red-400/10 rounded"
        >
          Clear
        </button>
        <button 
          @click="$emit('close')"
          class="bg-slate-700/50 hover:bg-slate-600/50 text-slate-400 w-6 h-6 rounded flex items-center justify-center transition-colors"
        >
          <span class="text-sm">×</span>
        </button>
      </div>
    </div>
    
    <!-- Scrolling Content (Terminal View) -->
    <div 
      class="flex-1 overflow-y-auto p-6 font-mono text-[11px] leading-relaxed scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent" 
      ref="logListRef"
    >
      <div v-if="mergedLogs.length === 0" class="flex flex-col items-center justify-center h-full gap-4 opacity-20 text-slate-500">
        <div class="text-4xl animate-pulse">📡</div>
        <p class="text-[10px] uppercase tracking-widest font-bold">Waiting for stream...</p>
      </div>
      
      <div v-else class="space-y-4">
        <div 
          v-for="(log, index) in mergedLogs" 
          :key="index" 
          class="flex flex-col gap-1.5 group"
          :class="{
            'text-red-400': log.type === 'error',
            'text-blue-400': log.type === 'update',
            'text-slate-400': log.type !== 'error' && log.type !== 'update'
          }"
        >
          <div class="flex items-center gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
            <span class="text-[9px] font-bold px-1.5 py-0.5 rounded border border-current/20 bg-current/5">
              {{ log.type.toUpperCase() }}
            </span>
            <span class="text-[9px]">{{ log.time.split(' ')[0] || log.time }}</span>
            <div class="h-px flex-1 bg-current/10"></div>
          </div>
          
          <div class="pl-2 border-l-2 border-current/10 group-hover:border-current/30 transition-colors">
            <!-- 聚合后的 LLM token 块 -->
            <template v-if="log.type === 'llm_token'">
              <span class="text-slate-300 whitespace-pre-wrap selection:bg-blue-500/30">{{ log.content }}</span>
              <span v-if="log._tokenCount > 1" class="ml-2 text-[9px] text-slate-600 italic">({{ log._tokenCount }} tokens)</span>
            </template>
            
            <!-- 带数据的日志 -->
            <template v-else-if="log.data">
              <span class="text-slate-200 block mb-1 font-bold" v-if="log.message">{{ log.message }}</span>
              <div class="bg-slate-950/50 rounded-lg p-3 border border-slate-800/50 mt-1 max-h-[300px] overflow-auto hover:border-blue-500/20 transition-colors">
                <pre class="text-slate-500 leading-tight">{{ formatLogData(log.data) }}</pre>
              </div>
            </template>
            
            <!-- 普通消息 -->
            <template v-else>
              <span class="text-slate-200">{{ log.message }}</span>
            </template>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Floating Quick Stats at Bottom -->
    <div v-if="logs.length > 0" class="absolute bottom-6 right-6 flex flex-col gap-2 z-20">
      <div class="bg-slate-800/90 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-700 shadow-2xl flex items-center gap-4 text-[10px] font-bold">
        <div class="flex flex-col">
          <span class="text-slate-500 uppercase">Tokens</span>
          <span class="text-blue-400 font-mono">{{ tokenCount }}</span>
        </div>
        <div class="h-4 w-px bg-slate-700"></div>
        <div class="flex flex-col">
          <span class="text-slate-500 uppercase">Updates</span>
          <span class="text-slate-300 font-mono">{{ updateCount }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue'

const props = defineProps({
  logs: { type: Array, default: () => [] }
})

defineEmits(['clear', 'close'])

const logListRef = ref(null)

// 日志统计
const tokenCount = computed(() => props.logs.filter(l => l.type === 'llm_token').length)
const updateCount = computed(() => props.logs.filter(l => l.type === 'update').length)

/**
 * 核心优化：将连续的 llm_token 合并为一条记录
 */
const mergedLogs = computed(() => {
  const result = []
  let currentTokenGroup = null

  for (const log of props.logs) {
    if (log.type === 'llm_token') {
      if (currentTokenGroup) {
        currentTokenGroup.content += (log.content || '')
        currentTokenGroup._tokenCount++
      } else {
        currentTokenGroup = {
          ...log,
          content: log.content || '',
          _tokenCount: 1
        }
      }
    } else {
      if (currentTokenGroup) {
        result.push(currentTokenGroup)
        currentTokenGroup = null
      }
      result.push(log)
    }
  }

  if (currentTokenGroup) {
    result.push(currentTokenGroup)
  }

  return result
})

// 自动滚动到底部
watch(() => props.logs.length, () => {
  nextTick(() => {
    if (logListRef.value) {
      logListRef.value.scrollTo({
        top: logListRef.value.scrollHeight,
        behavior: 'smooth'
      })
    }
  })
})

// 格式化日志数据
function formatLogData(data) {
  if (!data) return ''
  try {
    return JSON.stringify(data, null, 2)
  } catch (e) {
    return String(data)
  }
}
</script>
