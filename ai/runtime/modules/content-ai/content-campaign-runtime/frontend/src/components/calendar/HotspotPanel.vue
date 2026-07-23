<template>
  <div class="space-y-4">
    <div v-if="hotspots.length === 0" class="text-slate-400 text-sm text-center py-6">
      本月暂无即将到来的热点
    </div>
    
    <div 
      v-else 
      v-for="(item, index) in hotspots" 
      :key="index"
      class="relative overflow-hidden group rounded-2xl border"
      :class="getColorClasses(index)"
    >
      <div class="absolute inset-0 opacity-20 -z-10 rounded-2xl transition-colors"></div>
      <div class="p-4">
        <div class="flex items-start justify-between mb-3">
          <div class="text-center">
            <p class="text-2xl font-black leading-none bg-clip-text text-transparent" :style="getTextGradient(index)">{{ item.month }}/{{ item.day }}</p>
            <span v-if="item.is_major" class="inline-block mt-1 px-2 py-0.5 text-white text-[10px] font-bold rounded uppercase shadow-sm" :style="{ backgroundColor: getBgColor(index) }">重要</span>
          </div>
          <span class="text-3xl">{{ item.icon }}</span>
        </div>
        <h4 class="text-base font-bold text-slate-800 mb-2">{{ item.name }}</h4>
        <div class="flex flex-wrap gap-2">
          <span 
            v-for="tip in item.content_tips.slice(0, 2)" 
            :key="tip" 
            class="px-2 py-1 bg-white border text-xs rounded-full font-medium"
            :class="getBadgeClasses(index)"
          >
            {{ tip }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  hotspots: {
    type: Array,
    default: () => []
  }
})

function getColorIndex(index) { return index % 3 }

function getColorClasses(index) {
  const i = getColorIndex(index)
  if (i === 0) return 'border-pink-100 bg-pink-50/30 hover:bg-pink-50/50'
  if (i === 1) return 'border-emerald-100 bg-emerald-50/30 hover:bg-emerald-50/50'
  return 'border-blue-100 bg-blue-50/30 hover:bg-blue-50/50'
}

function getTextGradient(index) {
  const i = getColorIndex(index)
  if (i === 0) return 'background-image: linear-gradient(to right, #db2777, #be185d);'
  if (i === 1) return 'background-image: linear-gradient(to right, #059669, #047857);'
  return 'background-image: linear-gradient(to right, #2563eb, #1d4ed8);'
}

function getBgColor(index) {
  const i = getColorIndex(index)
  if (i === 0) return '#ec4899'
  if (i === 1) return '#10b981'
  return '#3b82f6'
}

function getBadgeClasses(index) {
  const i = getColorIndex(index)
  if (i === 0) return 'border-pink-100 text-pink-600'
  if (i === 1) return 'border-emerald-100 text-emerald-600'
  return 'border-blue-100 text-blue-600'
}
</script>
