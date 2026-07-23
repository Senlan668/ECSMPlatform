<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap gap-4 items-start">
      <div 
        v-for="(color, index) in modelValue" 
        :key="index" 
        class="group relative flex flex-col items-center gap-1.5"
      >
        <!-- 颜色滑块 -->
        <div 
          class="w-14 h-14 rounded-xl border-2 border-white shadow-sm ring-1 ring-slate-200 cursor-pointer relative overflow-hidden transition-all duration-200 hover:scale-105 active:scale-95"
          :style="{ backgroundColor: color }"
        >
          <input 
            type="color" 
            :value="color"
            @input="updateColor(index, $event.target.value)"
            class="absolute -inset-2 opacity-0 cursor-pointer w-[150%] h-[150%]"
          />
        </div>
        
        <!-- 移除按钮 -->
        <button 
          @click.stop="removeColor(index)" 
          class="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-md hover:bg-red-600 z-10"
          title="移除颜色"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
        
        <!-- HEX 代码 -->
        <div class="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase tracking-tighter">
          {{ color }}
        </div>
      </div>

      <!-- 添加颜色按钮 -->
      <div 
        v-if="modelValue.length < maxColors" 
        class="w-14 h-14 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer text-slate-400 hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50 transition-all duration-200 relative overflow-hidden group"
        title="添加品牌色"
        @click="triggerAddColor"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 mb-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-7-7v14"/></svg>
        <span class="text-[9px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">ADD</span>
        
        <input 
          type="color" 
          ref="newColorInput"
          value="#409EFF"
          @input="addColor($event.target.value)"
          class="absolute -inset-2 opacity-0 cursor-pointer w-[150%] h-[150%]"
        />
      </div>
    </div>
    
    <div v-if="modelValue.length === 0" class="text-xs text-slate-400 italic">
      尚未设置品牌色，建议设置 1-5 种颜色以协助 AI 构建视觉。
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  maxColors: {
    type: Number,
    default: 5
  }
})

const emit = defineEmits(['update:modelValue'])
const newColorInput = ref(null)

function updateColor(index, hex) {
  const newColors = [...props.modelValue]
  newColors[index] = hex
  emit('update:modelValue', newColors)
}

function removeColor(index) {
  const newColors = [...props.modelValue]
  newColors.splice(index, 1)
  emit('update:modelValue', newColors)
}

function triggerAddColor() {
  newColorInput.value.click()
}

function addColor(hex) {
  if (props.modelValue.length >= props.maxColors) return
  emit('update:modelValue', [...props.modelValue, hex])
}
</script>
