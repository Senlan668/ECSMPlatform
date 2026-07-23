<template>
  <div class="space-y-4">
    <label class="text-sm font-bold text-slate-700 flex items-center gap-2">
      <span class="text-blue-500">🖼️</span> 参考底图
      <span class="text-xs text-slate-400 font-normal">（支持 JPG/PNG/WEBP，建议小于 10MB）</span>
    </label>
    
    <div
      class="relative group cursor-pointer"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleDrop"
      @click="triggerFileInput"
    >
      <!-- 背景装饰 -->
      <div 
        class="absolute -inset-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-[2rem] blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"
        :class="isDragging ? 'opacity-100 scale-[1.02]' : ''"
      ></div>

      <div
        class="relative min-h-[220px] bg-white rounded-[1.8rem] border-2 border-dashed flex flex-col items-center justify-center transition-all duration-300 overflow-hidden"
        :class="[
          isDragging ? 'border-blue-500 bg-blue-50/50 scale-[1.01]' : 'border-slate-200 group-hover:border-blue-300 group-hover:bg-slate-50/50',
          modelValue ? 'border-solid p-4' : 'px-8 py-10'
        ]"
      >
        <!-- 有图预览 -->
        <div v-if="modelValue" class="w-full h-full relative animate-in fade-in zoom-in duration-500">
          <img :src="modelValue" class="w-full max-h-[400px] object-contain rounded-2xl shadow-xl border border-white" alt="参考图片预览" />
          
          <div class="absolute top-4 right-4 flex gap-2">
            <button 
              @click.stop="clearImage"
              class="w-10 h-10 bg-white/90 backdrop-blur-md rounded-xl shadow-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-white transition-all transform hover:scale-110 active:scale-90"
              title="清除图片"
            >
              ✕
            </button>
          </div>
          
          <!-- 图片信息浮动层 (可选) -->
          <div class="absolute bottom-4 left-4 right-4 p-3 bg-slate-900/60 backdrop-blur-md rounded-xl text-[10px] text-white/80 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
            <span>✨ 参考图就位</span>
            <span class="font-mono">OPTIMIZED WEBP</span>
          </div>
        </div>

        <!-- 无图占位 -->
        <div v-else class="flex flex-col items-center gap-5 text-center">
          <div class="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-3xl group-hover:scale-110 transition-transform duration-500">
            <span class="animate-pulse">☁️</span>
          </div>
          <div>
            <p class="text-sm font-black text-slate-800 tracking-tight">点击或拖拽图片到此处</p>
            <p class="text-[11px] text-slate-400 font-medium mt-1 uppercase tracking-widest">Supports high resolution uploads</p>
          </div>
          <div class="flex gap-1.5">
            <span class="w-1.5 h-1.5 bg-slate-200 rounded-full group-hover:bg-blue-400 transition-colors"></span>
            <span class="w-1.5 h-1.5 bg-slate-200 rounded-full group-hover:bg-blue-400 delay-75 transition-colors"></span>
            <span class="w-1.5 h-1.5 bg-slate-200 rounded-full group-hover:bg-blue-400 delay-150 transition-colors"></span>
          </div>
        </div>

        <!-- 隐藏的文件选择器 -->
        <input
          type="file"
          ref="fileInput"
          class="hidden"
          accept="image/jpeg, image/png, image/webp"
          @change="handleFileSelect"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue'])

const isDragging = ref(false)
const fileInput = ref(null)

const triggerFileInput = () => {
  if (!props.modelValue) fileInput.value?.click()
}

const clearImage = () => {
  emit('update:modelValue', '')
  if (fileInput.value) fileInput.value.value = ''
}

const processFile = (file) => {
  if (!file) return
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    alert('仅支持 jpg, png, webp 格式的图片')
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    alert('图片大小不能超过 10MB')
    return
  }

  compressImage(file, 1600, 0.82).then((base64) => {
    emit('update:modelValue', base64)
  }).catch((err) => {
    console.error('图片压缩失败:', err)
    alert('图片处理失败，请重试')
  })
}

function compressImage(file, maxWidth = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (event) => {
      const img = new Image()
      img.src = event.target.result
      img.onload = () => {
        let width = img.width
        let height = img.height
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        const base64 = canvas.toDataURL('image/webp', quality)
        resolve(base64)
      }
      img.onerror = (e) => reject(e)
    }
    reader.onerror = (e) => reject(e)
  })
}

const handleFileSelect = (e) => {
  const file = e.target.files?.[0]
  if (file) processFile(file)
}

const handleDrop = (e) => {
  isDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) processFile(file)
}
</script>
