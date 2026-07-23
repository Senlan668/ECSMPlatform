<template>
  <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <!-- 主配置卡片 -->
    <div class="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
      <div class="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
        <div>
          <h2 class="text-xl font-bold text-slate-800 tracking-tight">批量生成配置</h2>
          <p class="text-xs text-slate-400 mt-1 uppercase tracking-widest font-semibold">Bulk Generation Task Configuration</p>
        </div>
        <div class="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-2xl border border-blue-100">
          <input type="checkbox" v-model="form.seriesMode" id="series-mode" class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-slate-300 transition-all" />
          <label for="series-mode" class="text-sm font-bold text-blue-700 cursor-pointer select-none">开启系列一致性</label>
        </div>
      </div>

      <div class="p-8 space-y-10">
        <!-- 风格标签选择 -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <label class="text-sm font-bold text-slate-700 flex items-center gap-2">
              <span class="text-blue-500">🏷️</span> 全局风格标签
              <span class="text-xs text-slate-400 font-normal">（可选，应用于系列所有图片）</span>
            </label>
          </div>
          
          <div class="flex flex-wrap gap-2.5" v-if="styleTags.length > 0">
            <button
              v-for="tag in styleTags"
              :key="tag.name"
              class="group flex items-center gap-2 px-4 py-2 rounded-2xl border-2 transition-all"
              :class="form.selectedStyles.includes(tag.name) 
                ? 'border-blue-600 bg-blue-50 shadow-md shadow-blue-600/10' 
                : 'border-slate-100 bg-white hover:border-blue-200 hover:bg-slate-50'"
              @click="toggleStyle(tag.name)"
            >
              <span class="text-base group-hover:scale-110 transition-transform">{{ tag.icon }}</span>
              <span class="text-sm font-bold" :class="form.selectedStyles.includes(tag.name) ? 'text-blue-700' : 'text-slate-600'">{{ tag.name }}</span>
            </button>
          </div>
          <div v-else class="flex items-center gap-3 py-4 text-slate-400 animate-pulse">
            <div class="w-4 h-4 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin"></div>
            <span class="text-sm font-medium">正在拉取审美趋势...</span>
          </div>
        </div>

        <!-- 尺寸与色调 -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div class="space-y-4">
            <label class="text-sm font-bold text-slate-700 flex items-center gap-2">
              <span class="text-blue-500">📏</span> 统一输出尺寸
            </label>
            <RatioSelector v-model="form.aspectRatio" :ratios="aspectRatios" />
          </div>
          <div class="space-y-4">
            <label class="text-sm font-bold text-slate-700 flex items-center gap-2">
              <span class="text-blue-500">🎨</span> 全局色调偏好
            </label>
            <div class="relative group">
              <input 
                v-model="form.colorTone" 
                class="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all placeholder:text-slate-400" 
                placeholder="例如：暖色调、莫兰迪色系、极简白..." 
              />
              <span class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-400 transition-colors pointer-events-none text-xl">✨</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 批量列表区域 -->
    <div class="space-y-6">
      <div class="flex items-center justify-between px-4">
        <div class="flex items-baseline gap-3">
          <h3 class="text-lg font-bold text-slate-800">生成内容列表</h3>
          <span class="text-sm font-mono text-slate-400">Total: {{ form.items.length }}</span>
        </div>
        <div class="flex items-center gap-3">
          <button 
            @click="handleCsvImport"
            class="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all flex items-center gap-2"
          >
            <span>📥</span> 导入 CSV
          </button>
          <button 
            @click="addItem"
            class="px-4 py-2 text-sm font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 transition-all flex items-center gap-2"
          >
            <span>➕</span> 添加一条
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div 
          v-for="(item, index) in form.items" 
          :key="index" 
          class="group bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-blue-900/5 hover:-translate-y-1 transition-all relative overflow-hidden"
        >
          <!-- 装饰背景 -->
          <div class="absolute -right-4 -top-4 w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-xs font-mono font-bold text-slate-200 group-hover:bg-blue-50 group-hover:text-blue-100 transition-all">
            {{ index + 1 }}
          </div>
          
          <button 
            @click="removeItem(index)" 
            class="absolute right-4 top-4 w-8 h-8 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all z-10"
            title="移除此项"
          >
            ✕
          </button>

          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">主标题</span>
                <input v-model="item.title" class="w-full bg-slate-50/50 border border-transparent rounded-xl px-4 py-2 text-sm focus:bg-white focus:border-blue-100 outline-none transition-all" placeholder="输入主标题" />
              </div>
              <div class="space-y-1.5">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">副标题</span>
                <input v-model="item.subtitle" class="w-full bg-slate-50/50 border border-transparent rounded-xl px-4 py-2 text-sm focus:bg-white focus:border-blue-100 outline-none transition-all" placeholder="输入副标题" />
              </div>
            </div>
            <div class="space-y-1.5">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">画面描述 (必填)</span>
              <textarea 
                v-model="item.prompt" 
                rows="3" 
                class="w-full bg-slate-50/50 border border-transparent rounded-2xl px-4 py-3 text-sm focus:bg-white focus:border-blue-100 outline-none transition-all resize-none overflow-y-auto" 
                placeholder="描述一下海报上的核心画面，例如：一个身穿红色长裙的女子在枫林中起舞..."
              ></textarea>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="form.items.length === 0" class="lg:col-span-2 py-20 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-4">
          <span class="text-4xl text-slate-300">📭</span>
          <p class="text-slate-500 font-medium text-sm">暂无内容，快去添加您的创意吧</p>
          <button @click="addItem" class="text-blue-600 text-sm font-bold hover:underline">点击立即添加条目</button>
        </div>
      </div>
    </div>

    <!-- 悬浮提交栏 -->
    <div class="pt-6 sticky bottom-0 bg-gradient-to-t from-slate-50 pb-4 z-20">
      <button
        class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold py-5 rounded-3xl shadow-2xl shadow-blue-600/30 transition-all flex items-center justify-center gap-3 group overflow-hidden relative"
        :disabled="!isValid || generating"
        @click="handleGenerate"
      >
        <span v-if="generating" class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
        <span v-else class="text-xl transition-transform group-hover:scale-125 group-hover:rotate-12 duration-300">🚀</span>
        <span class="text-lg tracking-wide">{{ generating ? 'AI 全速排期中...' : '提交批量生成任务' }}</span>
        
        <!-- 装饰光效 -->
        <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" v-if="!generating"></div>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import RatioSelector from './RatioSelector.vue'

const props = defineProps({
  styleTags: { type: Array, default: () => [] },
  aspectRatios: { type: Array, default: () => [] },
  generating: { type: Boolean, default: false }
})

const emit = defineEmits(['generate'])

const form = ref({
  seriesMode: true,
  selectedStyles: [],
  aspectRatio: '3:4',
  colorTone: '',
  items: [
    { title: '穿搭分享', subtitle: '日常舒适风', prompt: '一个女孩走在春天的街道上，阳光明媚' },
    { title: '咖啡探店', subtitle: '周末好去处', prompt: '一杯精致拿铁放在木质桌面上，背景虚化' }
  ]
})

const isValid = computed(() => {
  if (form.value.items.length === 0) return false
  return form.value.items.every(item => item.prompt && item.prompt.trim() !== '')
})

function addItem() {
  form.value.items.push({ title: '', subtitle: '', prompt: '' })
}

function removeItem(index) {
  form.value.items.splice(index, 1)
}

function handleCsvImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.csv'
  input.onchange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target.result
      const lines = text.split('\n').filter(line => line.trim())
      // 假设 CSV 格式为：主标题,副标题,提示词
      const newItems = []
      // 跳过表头(如果第一行包含"标题"或"prompt"等字眼)
      let startIndex = 0
      if (lines[0].includes('标题') || lines[0].toLowerCase().includes('title') || lines[0].toLowerCase().includes('prompt')) {
        startIndex = 1
      }
      for (let i = startIndex; i < lines.length; i++) {
        const parts = lines[i].split(',')
        if (parts.length >= 3) {
          newItems.push({
            title: parts[0].trim(),
            subtitle: parts[1].trim(),
            prompt: parts.slice(2).join(',').trim() // 提示词可能包含逗号
          })
        } else if (parts.length > 0 && parts[0].trim()) {
           newItems.push({
            title: '',
            subtitle: '',
            prompt: lines[i].trim()
          })
        }
      }
      if (newItems.length > 0) {
        form.value.items = newItems
        alert(`成功导入 ${newItems.length} 条数据`)
      } else {
        alert('未解析到有效数据，请检查 CSV 格式 (标题,副标题,提示词)')
      }
    }
    reader.readAsText(file)
  }
  input.click()
}

function toggleStyle(name) {
  const idx = form.value.selectedStyles.indexOf(name)
  if (idx >= 0) {
    form.value.selectedStyles.splice(idx, 1)
  } else {
    form.value.selectedStyles.push(name)
  }
}

function getTagStyle(tag) {
  const palette = tag.color_palette || []
  if (palette.length >= 2) {
    return {
      '--tag-color-1': palette[0],
      '--tag-color-2': palette[1],
    }
  }
  return {}
}

function handleGenerate() {
  if (!isValid.value || props.generating) return
  emit('generate', { ...form.value })
}
</script>


