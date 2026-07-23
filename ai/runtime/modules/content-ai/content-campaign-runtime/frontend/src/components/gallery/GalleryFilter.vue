<template>
  <div class="bg-white/80 backdrop-blur-md rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6 transition-all hover:shadow-md">
    <!-- 第一行：搜索与快速筛选 -->
    <div class="flex flex-col md:flex-row gap-6 items-center">
      <!-- 搜索框 -->
      <div class="flex-1 w-full relative group">
        <span class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">🔍</span>
        <input 
          type="text" 
          v-model="localFilters.keyword" 
          placeholder="搜索作品名称、提示词或标签..."
          class="w-full pl-12 pr-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all font-medium"
          @keyup.enter="applyFilters"
        />
        <button 
          class="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-lg shadow-blue-600/20 transition-all active:scale-95"
          @click="applyFilters"
        >
          立即搜索
        </button>
      </div>

      <!-- 快速筛选 Toggle -->
      <div class="flex items-center gap-4 bg-slate-100/50 p-1.5 rounded-xl border border-slate-200">
        <label class="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all hover:bg-white select-none"
               :class="{ 'bg-white shadow-sm text-orange-600': localFilters.only_mine }">
          <input type="checkbox" v-model="localFilters.only_mine" class="hidden" @change="applyFilters" />
          <span class="text-xs font-bold">👤 只看自己</span>
        </label>
        <label class="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all hover:bg-white select-none"
               :class="{ 'bg-white shadow-sm text-blue-600': localFilters.is_favorite }">
          <input type="checkbox" v-model="localFilters.is_favorite" class="hidden" @change="applyFilters" />
          <span class="text-xs font-bold">⭐ 只看收藏</span>
        </label>
        <label class="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all hover:bg-white select-none"
               :class="{ 'bg-white shadow-sm text-indigo-600': localFilters.is_template }">
          <input type="checkbox" v-model="localFilters.is_template" class="hidden" @change="applyFilters" />
          <span class="text-xs font-bold">📑 只看模板</span>
        </label>
      </div>
    </div>

    <!-- 第二行：高级筛选器 -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-slate-100">
      <!-- 生成模式选择 -->
      <div class="space-y-2">
        <label class="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">生成模式</label>
        <div class="relative">
          <select 
            v-model="localFilters.mode" 
            class="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
            @change="applyFilters"
          >
            <option value="">✨ 全部模式</option>
            <option value="custom">🎨 自定义生成</option>
            <option value="template">📋 模板生成</option>
            <option value="batch">📦 批量生成</option>
            <option value="edit">✏️ 以图改图</option>
            <option value="style_transfer">🎭 风格迁移</option>
            <option value="inpaint">🖌️ 局部重绘</option>
            <option value="adapt">📐 尺寸适配</option>
          </select>
          <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">▼</div>
        </div>
      </div>

      <!-- 标签搜索 -->
      <div class="space-y-2">
        <label class="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">过滤标签</label>
        <div class="relative group">
          <span class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500">🏷️</span>
          <input 
            type="text" 
            v-model="localFilters.tags" 
            placeholder="例如: 日常, 系列"
            class="w-full pl-10 pr-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
            @change="applyFilters"
          />
        </div>
      </div>

      <!-- 排序模式 -->
      <div class="space-y-2">
        <label class="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">展示排序</label>
        <div class="relative">
          <select 
            v-model="localFilters.sort_by" 
            class="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
            @change="applyFilters"
          >
            <option value="created_at_desc">🕒 最新优先</option>
            <option value="created_at_asc">🕒 最早优先</option>
          </select>
          <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">▼</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, watch } from 'vue'

const props = defineProps({
  filters: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['update:filters', 'search'])

const localFilters = reactive({
  keyword: props.filters.keyword || '',
  only_mine: props.filters.only_mine ?? true,
  is_favorite: props.filters.is_favorite || false,
  is_template: props.filters.is_template || false,
  mode: props.filters.mode || '',
  tags: props.filters.tags || '',
  sort_by: props.filters.sort_by || 'created_at_desc'
})

// 父级若强制更新 filters，这里同步
watch(() => props.filters, (newVal) => {
  Object.assign(localFilters, newVal)
}, { deep: true })

function applyFilters() {
  emit('update:filters', { ...localFilters })
  emit('search')
}
</script>

<style scoped>
/* 移除原生 select 箭头在 IE 下的展示 */
select::-ms-expand {
  display: none;
}
</style>
