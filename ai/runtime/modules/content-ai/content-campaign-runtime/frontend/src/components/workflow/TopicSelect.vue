<template>
  <div class="p-6 md:p-8 h-full flex flex-col">
    <div class="flex items-center gap-3 mb-6">
      <span class="text-blue-600 text-xl font-medium">✨</span>
      <h3 class="text-lg font-bold text-slate-800 tracking-tight">请选择一个选题</h3>
    </div>

    <!-- 流式生成中：显示实时内容 -->
    <div v-if="loading && streamingText" class="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6">
      <div class="text-xs font-bold text-blue-600 mb-2 uppercase tracking-wide">AI 正在发散思维...</div>
      <div class="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap font-mono">
        {{ streamingText }}
        <span class="inline-block w-2 bg-blue-500 animate-pulse ml-1">&nbsp;</span>
      </div>
    </div>

    <!-- 加载中但还没有内容 -->
    <div v-else-if="loading && topics.length === 0 && !streamingText" class="flex-1 flex flex-col items-center justify-center text-slate-400 min-h-[200px]">
      <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
      <p class="text-sm font-medium">AI 正在生成选题...</p>
    </div>

    <!-- 已生成选题列表 -->
    <div v-else class="flex-1 flex flex-col gap-3 mb-6">
      <div 
        v-for="(topic, index) in topics" 
        :key="index"
        class="group p-4 rounded-xl border-2 transition-all cursor-pointer flex gap-3 items-start"
        :class="modelValue === topic ? 'border-blue-600 bg-blue-50/50 shadow-md shadow-blue-600/10' : 'border-slate-100 bg-white hover:border-blue-300 hover:bg-slate-50'"
        @click="$emit('update:modelValue', topic)"
      >
        <div class="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold transition-colors"
             :class="modelValue === topic ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500 group-hover:bg-blue-200 group-hover:text-blue-600'">
          {{ index + 1 }}
        </div>
        <div class="text-sm font-medium leading-relaxed transition-colors" :class="modelValue === topic ? 'text-blue-900' : 'text-slate-700 group-hover:text-slate-900'">
          {{ topic }}
        </div>
      </div>
      
      <div v-if="loading && topics.length > 0" class="flex items-center gap-3 p-4 opacity-60">
        <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-400"></div>
        <span class="text-xs text-slate-500 font-medium">正在思考更多方向...</span>
      </div>
    </div>

    <div class="flex items-center gap-4 mt-auto pt-4 border-t border-slate-100">
      <button 
        class="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-bold py-2.5 px-8 rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2"
        :disabled="!modelValue || loading"
        @click="$emit('confirm')"
      >
        确认选取该主题
      </button>
      <button class="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2.5 px-6 rounded-xl transition-all" @click="$emit('reset')">
        重置工作流
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * TopicSelect - 步骤1：选择选题
 * 展示 AI 生成的选题列表，支持选择和确认
 */
defineProps({
  /** 是否加载中 */
  loading: { type: Boolean, default: false },
  /** 生成的选题列表 */
  topics: { type: Array, default: () => [] },
  /** 流式生成中的实时文本 */
  streamingText: { type: String, default: '' },
  /** 当前选中的选题 (v-model) */
  modelValue: { type: String, default: '' }
})

defineEmits(['update:modelValue', 'confirm', 'reset'])
</script>
