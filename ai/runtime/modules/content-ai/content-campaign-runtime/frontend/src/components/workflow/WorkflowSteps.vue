<template>
  <div class="bg-white/80 backdrop-blur-sm p-6 lg:p-8 rounded-2xl shadow-sm border border-slate-200/60">
    <!-- Header Info -->
    <div class="flex justify-between items-center mb-8">
      <div class="flex flex-col gap-1.5">
        <h3 class="text-base font-bold text-blue-600 flex items-center gap-2">
          <span>🎯</span> 当前阶段：{{ stepInfo.title }}
        </h3>
        <p class="text-sm text-slate-500">{{ stepInfo.desc }}</p>
      </div>
      <span class="text-sm font-bold bg-blue-50 text-blue-600 px-4 py-1.5 rounded-full border border-blue-100 shadow-sm">
        {{ Math.min(currentStep + 1, 5) }} / 5
      </span>
    </div>

    <!-- Progress Track -->
    <div class="relative">
      <!-- Background Line -->
      <div aria-hidden="true" class="absolute top-4 left-0 right-0 px-8 flex items-center -z-10">
        <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div class="h-full bg-blue-500 transition-all duration-700 ease-out" :style="{ width: `${currentStep * 25}%` }"></div>
        </div>
      </div>
      
      <!-- Steps -->
      <div class="relative flex justify-between">
        <div v-for="(step, index) in steps" :key="index" class="flex flex-col items-center gap-3 w-16 group">
          <div 
            class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ring-4 ring-white transition-all duration-500"
            :class="[
              index < currentStep ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 
              index === currentStep ? 'bg-blue-500 text-white shadow-md shadow-blue-400/40 scale-110' : 
              'bg-slate-100 text-slate-400'
            ]"
          >
            <span v-if="index < currentStep">✓</span>
            <span v-else>{{ index + 1 }}</span>
          </div>
          <span 
            class="text-xs font-semibold whitespace-nowrap transition-colors duration-300"
            :class="index <= currentStep ? 'text-slate-800' : 'text-slate-400'"
          >
            {{ step.title }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  currentStep: { type: Number, required: true }
})

const steps = [
  { title: '输入主题', desc: '设定内容方向与创作要求' },
  { title: '选择话题', desc: '从AI生成的方向中选择一个' },
  { title: '审核文章', desc: '审阅并优化生成的正文内容' },
  { title: '生成配图', desc: '为您匹配精美吸引眼球的封面配图' },
  { title: '完成', desc: '工作流已结束，可进行发布' }
]

const stepInfo = computed(() => {
  const index = Math.min(Math.max(props.currentStep, 0), 4)
  return steps[index]
})
</script>
