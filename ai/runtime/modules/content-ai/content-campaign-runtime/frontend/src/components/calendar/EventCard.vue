<template>
  <div class="p-1.5 border-l-4 rounded text-[11px] cursor-pointer hover:shadow-md transition-all group opacity-90 hover:opacity-100"
       :class="typeClasses" 
       @click.stop="$emit('select', event)">
    
    <div class="flex justify-between items-start mb-0.5" v-if="event.scheduled_time || event.status">
      <span class="font-bold flex items-center gap-0.5 whitespace-nowrap overflow-hidden text-ellipsis mr-1">
        {{ event.scheduled_time || '' }} 
        <span v-for="p in event.platform" :key="p" class="ml-0.5 opacity-80">{{ getPlatformIcon(p) }}</span>
      </span>
      <span class="px-1 bg-white/70 rounded text-[10px] shrink-0" v-if="event.status">
        {{ statusNames[event.status] || event.status }}
      </span>
    </div>
    
    <p class="font-medium line-clamp-2 text-slate-700 leading-[1.3]">{{ event.title }}</p>
    
    <div class="mt-0.5 flex items-center space-x-0.5 text-pink-600" v-if="event.hotspot_tag">
      <span class="text-[10px]">🔥</span> <span class="truncate">{{ event.hotspot_tag }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  event: {
    type: Object,
    required: true
  }
})

defineEmits(['select'])

const typeClasses = computed(() => {
  const map = {
    education: 'bg-indigo-50 border-indigo-500 text-indigo-700',
    grass: 'bg-emerald-50 border-emerald-500 text-emerald-700',
    interaction: 'bg-amber-50 border-amber-500 text-amber-700',
    brand_story: 'bg-violet-50 border-violet-500 text-violet-700'
  }
  return map[props.event.content_type] || 'bg-slate-50 border-slate-500 text-slate-700'
})

const statusNames = {
  draft: '草稿',
  scheduled: '已排期',
  in_progress: '创作中',
  published: '已发布',
  cancelled: '已取消'
}

function getPlatformIcon(platform) {
  const icons = {
    xiaohongshu: '📕',
    douyin: '🎵',
    wechat: '📱',
    bilibili: '📺',
    weibo: '🐦'
  }
  return icons[platform] || '📄'
}
</script>

<style scoped>
/* Scoped styles omitted, replaced by Tailwind */
</style>
