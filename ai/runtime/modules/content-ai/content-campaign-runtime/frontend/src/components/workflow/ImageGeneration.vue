<template>
  <div class="p-6 md:p-8 h-full flex flex-col items-center justify-center min-h-[400px]">
    <div class="flex flex-col items-center gap-6 max-w-lg w-full">
      <!-- Loading Indicator -->
      <div class="relative flex items-center justify-center w-24 h-24">
        <div class="absolute inset-0 rounded-full border-4 border-blue-100 opacity-20"></div>
        <div class="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
        <span class="text-3xl">🎨</span>
      </div>
      
      <div class="text-center">
        <h3 class="text-lg font-bold text-slate-800 tracking-tight mb-2">正在绘制专属配图</h3>
        <p class="text-sm text-slate-500">AI 画师正在根据文章视觉要点生成高品质封面图，请稍作等待...</p>
      </div>

      <!-- 显示配图摘要（视觉要点） -->
      <div v-if="visualPoints.length > 0" class="w-full bg-blue-50/50 border border-blue-100 rounded-xl p-5 mt-4">
        <h4 class="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2"><span>💡</span> 视觉生成要点</h4>
        <ul class="space-y-3">
          <li v-for="(point, index) in visualPoints" :key="index" class="flex gap-3 text-sm text-blue-900/80">
            <span class="w-5 h-5 rounded-full bg-blue-200/50 text-blue-700 flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">
              {{ index + 1 }}
            </span>
            <span class="leading-relaxed">{{ point }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * ImageGeneration - 步骤3：生成配图中
 * 纯展示型组件，显示视觉要点和加载状态
 */
defineProps({
  /** 视觉要点列表 */
  visualPoints: { type: Array, default: () => [] }
})
</script>
