<template>
  <div class="bg-white p-8 md:p-10 rounded-[2.5rem] shadow-xl shadow-slate-200/50 space-y-10 group/panel relative overflow-hidden">
    <!-- 装饰背景 -->
    <div class="absolute -top-12 -left-12 w-48 h-48 bg-slate-50 rounded-full blur-3xl opacity-50 pointer-events-none"></div>

    <div class="flex items-center justify-between relative z-10">
      <h3 class="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
        <span class="w-1.5 h-6 bg-blue-600 rounded-full"></span>
        创作概览 <span class="text-slate-400 font-light text-sm ml-1 uppercase tracking-widest">Stats Center</span>
      </h3>
      <div v-if="loading" class="flex gap-1">
        <span class="w-1 h-1 bg-blue-400 rounded-full animate-bounce"></span>
        <span class="w-1 h-1 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
        <span class="w-1 h-1 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
      </div>
    </div>
    
    <div v-if="loading" class="flex flex-col items-center justify-center py-20 animate-pulse">
      <div class="w-16 h-16 bg-slate-100 rounded-3xl mb-4"></div>
      <div class="h-4 w-32 bg-slate-100 rounded-full"></div>
    </div>
    
    <template v-else>
      <!-- 数字卡片区 -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div v-for="item in [
          { icon: '🖼️', label: '总生成数', val: stats.total_works || 0, color: 'text-blue-600' },
          { icon: '⭐', label: '已收藏', val: stats.total_favorites || 0, color: 'text-amber-500' },
          { icon: '📋', label: '个人模板', val: stats.total_templates || 0, color: 'text-purple-600' },
          { icon: '💾', label: '空间占用', val: formatBytes(stats.storage_used_bytes), color: 'text-emerald-500' }
        ]" :key="item.label" class="p-6 bg-slate-50 border border-slate-100/50 rounded-3xl hover:bg-white hover:shadow-lg hover:shadow-slate-100 transition-all duration-300 group/card">
          <div class="text-3xl mb-4 grayscale group-hover/card:grayscale-0 transition-all scale-90 group-hover/card:scale-100">{{ item.icon }}</div>
          <div class="flex flex-col">
            <span class="text-2xl font-black text-slate-900 tracking-tighter">{{ item.val }}</span>
            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{{ item.label }}</span>
          </div>
        </div>
      </div>

      <!-- 分布区域 -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <!-- 模式分布 -->
        <div class="space-y-6">
          <h4 class="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2v20"/><path d="M2 12h20"/></svg>
            模式偏好分布
          </h4>
          <div class="space-y-4">
            <div v-for="(count, mode) in (stats.mode_distribution || {})" :key="mode" class="space-y-1.5">
              <div class="flex justify-between text-[11px] font-bold">
                <span class="text-slate-600">{{ formatMode(mode) }}</span>
                <span class="text-slate-400">{{ count }} 次</span>
              </div>
              <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  class="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-1000 ease-out"
                  :style="{ width: percent(count) + '%' }"
                ></div>
              </div>
            </div>
            <div v-if="!stats.mode_distribution || Object.keys(stats.mode_distribution).length === 0" class="flex flex-col items-center py-6 text-slate-300 italic text-xs">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 mb-2 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M8 7h6"/><path d="M8 11h8"/></svg>
              点滴记录，从此刻开始
            </div>
          </div>
        </div>
        
        <!-- 趋势 -->
        <div class="space-y-6">
          <h4 class="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
            最近 7 天生成趋势
          </h4>
          <div class="h-40 flex items-end justify-between px-2">
            <template v-if="stats.recent_trend && stats.recent_trend.length > 0">
              <div v-for="item in stats.recent_trend" :key="item.date" class="flex flex-col items-center gap-3 w-8 group/bar">
                <div class="relative w-full flex justify-center">
                  <div 
                    class="w-4 bg-slate-100 rounded-full group-hover/bar:bg-blue-600 group-hover/bar:scale-x-125 transition-all duration-300 origin-bottom"
                    :style="{ height: Math.max((item.count / maxTrend) * 120, 8) + 'px' }"
                  ></div>
                  <!-- Tooltip -->
                  <div class="absolute -top-10 bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg opacity-0 group-hover/bar:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none">
                    {{ item.count }} 次
                  </div>
                </div>
                <span class="text-[10px] font-bold text-slate-400 tracking-tighter">{{ item.date.substring(5) }}</span>
              </div>
            </template>
            <div v-else class="flex-1 flex flex-col items-center justify-center text-slate-300 italic text-xs">
              暂无趋势数据
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  stats: {
    type: Object,
    default: () => ({})
  },
  loading: {
    type: Boolean,
    default: false
  }
})

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatMode(mode) {
  const map = {
    custom: '提示词生成',
    template: '模板生成',
    edit: '局部重绘',
    adapt: '多平台适配',
    style_transfer: '风格迁移',
    batch: '批量生成'
  }
  return map[mode] || mode
}

const maxCount = computed(() => {
  if (!props.stats.mode_distribution) return 1
  const vals = Object.values(props.stats.mode_distribution)
  return Math.max(...vals, 1)
})

function percent(count) {
  return (count / maxCount.value) * 100
}

const maxTrend = computed(() => {
  if (!props.stats.recent_trend || props.stats.recent_trend.length === 0) return 1
  return Math.max(...props.stats.recent_trend.map(i => i.count), 1)
})
</script>
