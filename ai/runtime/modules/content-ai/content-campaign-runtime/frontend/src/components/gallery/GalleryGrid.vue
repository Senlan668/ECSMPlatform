<template>
  <div class="w-full">
    <!-- 空状态 -->
    <div v-if="items.length === 0 && !loading" class="flex flex-col items-center justify-center py-32 bg-white/50 rounded-3xl border-2 border-dashed border-slate-200">
      <div class="text-6xl mb-6 grayscale opacity-80 animate-bounce">📭</div>
      <h3 class="text-xl font-bold text-slate-800 mb-2">作品库空空如也</h3>
      <p class="text-slate-400 text-sm max-w-sm text-center">
        尝试更换筛选条件，或者去「海报生成」页面创作你的第一份 AI 作品。
      </p>
    </div>
    
    <!-- 网格容器 -->
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
      <GalleryCard 
        v-for="item in items" 
        :key="item.id" 
        :item="item"
        :isSelected="selectedIds.includes(item.id)"
        @view-detail="$emit('view-detail', item)"
        @toggle-selection="$emit('toggle-selection', item.id)"
        @toggle-favorite="$emit('toggle-favorite', $event)"
        @save-template="$emit('save-template', $event)"
      />
    </div>

    <!-- 加载更多 -->
    <div v-if="hasMore" class="flex justify-center mt-12 mb-8">
      <button 
        class="group flex items-center gap-3 px-8 py-3 bg-white border border-slate-200 rounded-full text-slate-600 font-bold shadow-sm hover:shadow-md hover:border-blue-500 hover:text-blue-600 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
        @click="$emit('load-more')" 
        :disabled="loading"
      >
        <span v-if="loading" class="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
        <span v-else class="group-hover:translate-y-0.5 transition-transform">🔽</span>
        {{ loading ? '正在努力加载...' : '加载更多精彩内容' }}
      </button>
    </div>

    <!-- 加载中占位 (骨架屏思路) -->
    <div v-if="loading && items.length === 0" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
      <div v-for="i in 5" :key="i" class="aspect-[3/4] bg-slate-200 animate-pulse rounded-2xl"></div>
    </div>
  </div>
</template>

<script setup>
import GalleryCard from './GalleryCard.vue'

defineProps({
  items: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  hasMore: {
    type: Boolean,
    default: false
  },
  selectedIds: {
    type: Array,
    default: () => []
  }
})

defineEmits(['view-detail', 'toggle-favorite', 'save-template', 'load-more', 'toggle-selection'])
</script>
