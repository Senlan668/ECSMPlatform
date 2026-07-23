<template>
  <div class="group bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col h-full" :class="{ 'opacity-70': template.is_active === false }">
    <!-- 封面图部分 -->
    <div class="relative aspect-video overflow-hidden bg-slate-50">
      <img 
        v-if="template.thumbnail_url" 
        :src="template.thumbnail_url" 
        loading="lazy"
        decoding="async"
        class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
      />
      <div 
        v-else 
        class="w-full h-full flex items-center justify-center text-4xl font-black text-white/90 transition-transform duration-500 group-hover:scale-110" 
        :style="{ background: placeholderBg }"
      >
        {{ template.name.substring(0, 1) }}
      </div>
      
      <!-- 悬停操作蒙层 (仅限个人模板且非选择模式) -->
      <div 
        v-if="!isSystem && !selectionMode" 
        class="absolute inset-0 bg-white/20 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3"
      >
        <button 
          @click.stop="$emit('edit')" 
          class="w-10 h-10 rounded-full bg-white/90 text-slate-600 flex items-center justify-center shadow-lg hover:text-blue-600 hover:scale-110 transition-all"
          title="编辑模板"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
        </button>
        <button 
          @click.stop="$emit('delete')" 
          class="w-10 h-10 rounded-full bg-white/90 text-slate-600 flex items-center justify-center shadow-lg hover:text-red-500 hover:scale-110 transition-all"
          title="删除模板"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </div>

      <!-- 公共标识 -->
      <div v-if="isSystem" class="absolute top-3 left-3 px-2 py-0.5 bg-blue-600 text-[10px] font-bold text-white rounded-md shadow-sm uppercase tracking-wider">
        Public
      </div>
      <div v-if="isSystem && template.is_active === false" class="absolute top-3 right-3 px-2 py-0.5 bg-slate-900 text-[10px] font-bold text-white rounded-md shadow-sm">
        已下架
      </div>
    </div>
    
    <!-- 内容区 -->
    <div class="p-5 flex-1 flex flex-col gap-3">
      <div class="flex items-start justify-between gap-2">
        <h3 class="font-bold text-slate-800 leading-tight group-hover:text-blue-600 transition-colors line-clamp-1">
          {{ template.name }}
        </h3>
        <span v-if="template.category" class="shrink-0 px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded uppercase">
          {{ template.category }}
        </span>
      </div>
      
      <p class="text-xs text-slate-500 line-clamp-2 leading-relaxed h-8">
        {{ template.description || '暂无描述信息...' }}
      </p>
      
      <div class="flex items-center gap-4 mt-auto">
        <div v-if="template.style_tag" class="flex items-center gap-1 text-[11px] text-slate-400 font-medium">
          <span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
          {{ template.style_tag }}
        </div>
        <div class="flex items-center gap-1 text-[11px] text-slate-400">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          {{ template.use_count || 0 }} 人已用
        </div>
      </div>
    </div>
    
    <!-- 操作区 -->
    <div class="px-5 py-4 bg-slate-50/50 border-t border-slate-100 flex gap-2">
      <button 
        @click.stop="$emit('use')"
        :disabled="isSystem && template.is_active === false"
        class="flex-1 px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl shadow-sm hover:bg-black active:scale-95 transition-all disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
      >
        {{ isSystem && template.is_active === false ? '已下架' : '使用模板' }}
      </button>
      <button 
        v-if="isSystem && !selectionMode && template.is_active !== false"
        @click.stop="$emit('duplicate')"
        class="px-4 py-2 bg-white text-slate-700 text-xs font-bold rounded-xl border border-slate-200 hover:bg-slate-50 active:scale-95 transition-all flex items-center gap-1.5"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
        Fork
      </button>
      <button
        v-if="isSystem && canManagePublic && !selectionMode && template.is_active !== false"
        @click.stop="$emit('deactivate')"
        class="px-4 py-2 bg-red-50 text-red-600 text-xs font-bold rounded-xl border border-red-100 hover:bg-red-100 active:scale-95 transition-all"
      >
        下架
      </button>
      <button
        v-if="isSystem && canManagePublic && !selectionMode && template.is_active === false"
        @click.stop="$emit('restore')"
        class="px-4 py-2 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-100 hover:bg-emerald-100 active:scale-95 transition-all"
      >
        恢复
      </button>
      <button
        v-if="!isSystem && !selectionMode"
        @click.stop="$emit('publish')"
        class="px-4 py-2 bg-white text-blue-700 text-xs font-bold rounded-xl border border-blue-100 hover:bg-blue-50 active:scale-95 transition-all flex items-center gap-1.5"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
        发布公共
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  template: {
    type: Object,
    required: true
  },
  isSystem: {
    type: Boolean,
    default: false
  },
  selectionMode: {
    type: Boolean,
    default: false
  },
  canManagePublic: {
    type: Boolean,
    default: false
  }
})

defineEmits(['use', 'edit', 'delete', 'duplicate', 'publish', 'deactivate', 'restore'])

const placeholderBg = computed(() => {
  const hash = Array.from(props.template.name || 'T').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const colors = [
    'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
    'linear-gradient(135deg, #3b82f6 0%, #2dd4bf 100%)',
    'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
    'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
    'linear-gradient(135deg, #22c55e 0%, #10b981 100%)'
  ]
  return colors[hash % colors.length]
})
</script>
