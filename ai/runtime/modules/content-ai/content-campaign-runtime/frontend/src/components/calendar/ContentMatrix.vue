<template>
  <div class="grid grid-cols-2 gap-4">
    <!-- 教育型 -->
    <div class="bg-slate-50 rounded-xl p-4 border border-slate-100 hover:border-indigo-100 transition-colors">
      <div class="flex items-center gap-2 mb-2 text-sm text-slate-600">
        <span>📚</span>
        <span class="font-medium">教育干货</span>
      </div>
      <div class="text-2xl font-bold text-slate-800 mb-2">{{ stats?.education || 0 }} <span class="text-xs font-normal text-slate-400">篇</span></div>
      <div class="h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div class="h-full bg-indigo-500 rounded-full transition-all duration-500" :style="{ width: getPercentage(stats?.education) + '%' }"></div>
      </div>
    </div>
    
    <!-- 种草型 -->
    <div class="bg-slate-50 rounded-xl p-4 border border-slate-100 hover:border-emerald-100 transition-colors">
      <div class="flex items-center gap-2 mb-2 text-sm text-slate-600">
        <span>🛍️</span>
        <span class="font-medium">种草推荐</span>
      </div>
      <div class="text-2xl font-bold text-slate-800 mb-2">{{ stats?.grass || 0 }} <span class="text-xs font-normal text-slate-400">篇</span></div>
      <div class="h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div class="h-full bg-emerald-500 rounded-full transition-all duration-500" :style="{ width: getPercentage(stats?.grass) + '%' }"></div>
      </div>
    </div>

    <!-- 互动型 -->
    <div class="bg-slate-50 rounded-xl p-4 border border-slate-100 hover:border-amber-100 transition-colors">
      <div class="flex items-center gap-2 mb-2 text-sm text-slate-600">
        <span>💬</span>
        <span class="font-medium">互动话题</span>
      </div>
      <div class="text-2xl font-bold text-slate-800 mb-2">{{ stats?.interaction || 0 }} <span class="text-xs font-normal text-slate-400">篇</span></div>
      <div class="h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div class="h-full bg-amber-500 rounded-full transition-all duration-500" :style="{ width: getPercentage(stats?.interaction) + '%' }"></div>
      </div>
    </div>

    <!-- 品牌型 -->
    <div class="bg-slate-50 rounded-xl p-4 border border-slate-100 hover:border-violet-100 transition-colors">
      <div class="flex items-center gap-2 mb-2 text-sm text-slate-600">
        <span>✨</span>
        <span class="font-medium">品牌故事</span>
      </div>
      <div class="text-2xl font-bold text-slate-800 mb-2">{{ stats?.brand_story || 0 }} <span class="text-xs font-normal text-slate-400">篇</span></div>
      <div class="h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div class="h-full bg-violet-500 rounded-full transition-all duration-500" :style="{ width: getPercentage(stats?.brand_story) + '%' }"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  stats: {
    type: Object,
    default: () => ({ education: 0, grass: 0, interaction: 0, brand_story: 0 })
  },
  total: {
    type: Number,
    default: 0
  }
})

function getPercentage(value) {
  if (!props.total || !value) return 0
  return Math.round((value / props.total) * 100)
}
</script>
