<template>
  <div class="flex flex-wrap gap-4">
    <button
      v-for="ratio in ratios"
      :key="ratio.key"
      class="group flex flex-col items-center gap-3 p-4 rounded-3xl border-2 transition-all min-w-[100px]"
      :class="modelValue === ratio.key 
        ? 'border-blue-600 bg-blue-50/50 shadow-lg shadow-blue-600/10 scale-105 z-10' 
        : 'border-slate-100 bg-slate-50 hover:bg-white hover:border-blue-200 hover:shadow-md'"
      @click="$emit('update:modelValue', ratio.key)"
    >
      <div 
        class="bg-white border-2 rounded-lg shadow-sm transition-all group-hover:scale-110 flex items-center justify-center overflow-hidden" 
        :class="modelValue === ratio.key ? 'border-blue-500 bg-blue-50' : 'border-slate-200'"
        :style="getRatioPreviewStyle(ratio.key)"
      >
        <div class="w-full h-full bg-slate-100/50 flex items-center justify-center">
           <div class="w-1/2 h-1/2 border border-slate-300 rounded-sm opacity-20"></div>
        </div>
      </div>
      <div class="text-center">
        <div class="text-[13px] font-black tracking-tight" :class="modelValue === ratio.key ? 'text-blue-700' : 'text-slate-800'">
          {{ ratio.label }}
        </div>
        <div class="text-[10px] font-bold text-slate-400 mt-0.5">{{ ratio.key }}</div>
      </div>
    </button>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: String, required: true },
  ratios: { type: Array, required: true, default: () => [] }
})

defineEmits(['update:modelValue'])

function getRatioPreviewStyle(ratio) {
  const map = {
    '3:4': { width: '28px', height: '37px' },
    '1:1': { width: '32px', height: '32px' },
    '4:3': { width: '37px', height: '28px' },
    '9:16': { width: '22px', height: '40px' },
    '16:9': { width: '40px', height: '22px' },
    '2.35:1': { width: '44px', height: '19px' },
  }
  return map[ratio] || { width: '32px', height: '32px' }
}
</script>
