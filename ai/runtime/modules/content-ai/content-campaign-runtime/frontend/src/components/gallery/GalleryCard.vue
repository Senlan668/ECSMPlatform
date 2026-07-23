<template>
  <div 
    class="group relative bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer border border-slate-100"
    @click="$emit('view-detail', item)"
  >
    <!-- 图片容器 -->
    <div class="relative aspect-[3/4] overflow-hidden bg-slate-100">
      <img 
        :src="item.thumbnail_url || item.image_url"
        :alt="item.title" 
        loading="lazy"
        decoding="async"
        class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
      />
      
      <!-- 悬停遮罩 -->
      <div class="absolute inset-x-0 bottom-0 top-1/2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

      <!-- 顶部操作区 (仅悬停显示) -->
      <div class="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
        <button 
          class="w-9 h-9 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-xl text-lg shadow-lg hover:bg-white hover:scale-110 active:scale-90 transition-all"
          :class="{ 'text-yellow-500': item.is_favorite, 'text-slate-400': !item.is_favorite }"
          @click.stop="$emit('toggle-favorite', item.id)"
          :title="item.is_favorite ? '取消收藏' : '加入收藏'"
        >
          {{ item.is_favorite ? '⭐' : '☆' }}
        </button>
        <button 
          class="w-9 h-9 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-xl text-lg shadow-lg hover:bg-white hover:scale-110 active:scale-90 transition-all text-blue-600"
          @click.stop="$emit('save-template', item.id)"
          title="存为个人模板"
        >
          📑
        </button>
      </div>

      <!-- 批量选择勾选框 (始终可用操作) -->
      <div class="absolute top-3 left-3">
        <div 
          class="w-6 h-6 rounded-lg border-2 transition-all flex items-center justify-center"
          :class="isSelected 
            ? 'bg-blue-600 border-blue-600 shadow-lg shadow-blue-600/30' 
            : 'bg-black/20 border-white/40 group-hover:bg-white/40'"
          @click.stop="$emit('toggle-selection', item.id)"
        >
          <svg v-if="isSelected" class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>

      <!-- 左下角模式标签 -->
      <div class="absolute bottom-3 left-3 px-2.5 py-1 bg-black/40 backdrop-blur-md border border-white/10 rounded-lg text-[10px] font-bold text-white tracking-wider uppercase opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        {{ formatMode(item.mode) }}
      </div>
    </div>

    <!-- 信息展示区 -->
    <div class="p-4 space-y-2">
      <div class="flex justify-between items-start gap-2">
        <h3 class="text-sm font-bold text-slate-800 line-clamp-1 group-hover:text-blue-600 transition-colors">
          {{ item.title || '未命名作品' }}
        </h3>
        <span class="text-[10px] font-bold text-slate-400 bg-slate-100/80 px-1.5 py-0.5 rounded uppercase">{{ item.aspect_ratio }}</span>
      </div>

      <div class="flex items-center justify-between text-[11px] text-slate-400">
        <span class="flex items-center gap-1">🕒 {{ formatDate(item.created_at) }}</span>
      </div>

      <!-- 标签展示 -->
      <div class="flex flex-wrap gap-1.5 pt-1" v-if="item.tags && item.tags.length">
        <span 
          v-for="tag in item.tags.slice(0, 2)" 
          :key="tag" 
          class="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md text-[10px] font-bold"
        >
          #{{ tag }}
        </span>
        <span 
          v-if="item.tags.length > 2" 
          class="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md text-[10px] font-bold"
        >
          +{{ item.tags.length - 2 }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  item: {
    type: Object,
    required: true
  },
  isSelected: {
    type: Boolean,
    default: false
  }
})

defineEmits(['toggle-favorite', 'save-template', 'view-detail', 'toggle-selection'])

function formatMode(mode) {
  const map = {
    custom: '自定义',
    template: '模板',
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
  return `${date.getMonth() + 1}-${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}
</script>
