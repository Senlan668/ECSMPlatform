<template>
  <Transition name="toolbar">
    <div 
      v-if="selectedCount > 0" 
      class="w-full flex flex-col md:flex-row justify-between items-center gap-4 p-4 md:p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl backdrop-blur-xl animate-in slide-in-from-top-4 duration-300 pointer-events-auto"
    >
      <!-- 左侧：选中统计 -->
      <div class="flex items-center gap-6">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            <span class="font-black text-lg">{{ selectedCount }}</span>
          </div>
          <div class="flex flex-col">
            <span class="text-xs font-bold text-slate-500 uppercase tracking-widest">Selected Items</span>
            <span class="text-sm font-bold text-white">已选中素材</span>
          </div>
        </div>
        
        <div class="h-8 w-px bg-slate-800 hidden md:block"></div>

        <div class="flex items-center gap-2">
          <button 
            class="px-4 py-2 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-bold rounded-xl transition-all"
            @click="$emit('select-all')"
          >
            全选
          </button>
          <button 
            class="px-4 py-2 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-bold rounded-xl transition-all"
            @click="$emit('clear-selection')"
          >
            取消选择
          </button>
        </div>
      </div>

      <!-- 右侧：核心操作 -->
      <div class="flex items-center gap-3 w-full md:w-auto">
        <!-- 批量打标签区域 -->
        <div class="flex-1 md:flex-none flex items-center gap-2 bg-slate-800/50 p-1 rounded-2xl border border-slate-700/50">
          <input
            v-if="showTagInput"
            type="text"
            v-model.trim="tagInput"
            class="bg-transparent text-white text-sm px-4 py-2 outline-none w-32 md:w-48 placeholder-slate-500 font-medium"
            placeholder="输入新标签..."
            @keyup.enter="handleBatchTag"
            autofocus
          />
          <button 
            class="px-5 py-2.5 whitespace-nowrap bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/20 transition-all active:scale-95 flex items-center gap-2"
            @click="showTagInput ? handleBatchTag() : (showTagInput = true)"
          >
            <span>🏷️</span> {{ showTagInput ? '确认标记' : '批量标签' }}
          </button>
          <button 
            v-if="showTagInput"
            class="px-3 py-2 text-slate-400 hover:text-white text-xs font-bold transition-colors"
            @click="showTagInput = false"
          >
            取消
          </button>
        </div>

        <!-- 批量删除 -->
        <button 
          class="px-5 py-2.5 bg-red-500/10 hover:bg-red-500 border border-red-500/20 text-red-500 hover:text-white rounded-xl text-sm font-bold transition-all active:scale-95 flex items-center gap-2"
          @click="handleBatchDelete"
        >
          <span>🗑️</span> 批量删除
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  selectedCount: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['select-all', 'clear-selection', 'batch-delete', 'batch-tag'])

const showTagInput = ref(false)
const tagInput = ref('')

function handleBatchDelete() {
  // 注意：父组件也会弹 confirm，这里仅作初步过滤或统一逻辑
  emit('batch-delete')
}

function handleBatchTag() {
  if (!tagInput.value) return
  emit('batch-tag', [tagInput.value])
  tagInput.value = ''
  showTagInput.value = false
}
</script>

<style scoped>
.toolbar-enter-active,
.toolbar-leave-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.toolbar-enter-from,
.toolbar-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.95);
}
</style>
