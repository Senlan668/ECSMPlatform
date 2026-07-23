<template>
  <div class="bg-white/60 backdrop-blur-sm p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200/60 transition-all">
    <div class="flex items-center gap-3 mb-6">
      <span class="text-blue-600 text-xl font-medium">📝</span>
      <h3 class="text-lg font-bold text-slate-800 tracking-tight">内容设置</h3>
    </div>
    <div class="flex flex-col gap-4">
      <label class="text-sm font-semibold text-slate-700">内容主题方向</label>
      <textarea 
        :value="modelValue" 
        @input="$emit('update:modelValue', $event.target.value)"
        class="w-full bg-slate-50/80 border border-slate-200 rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 focus:bg-white outline-none transition-all placeholder:text-slate-400" 
        placeholder="请输入内容主题方向，例如：AI技术在医疗领域的应用、未来城市的数字化转型..." 
        rows="6"
      ></textarea>
      
      <div class="flex flex-col sm:flex-row sm:items-center justify-between mt-2 gap-4">
        <!-- Optional tools that can be extended later -->
        <div class="flex items-center gap-4 text-slate-500">
          <button class="flex items-center gap-1.5 text-xs hover:text-blue-600 transition-colors cursor-not-allowed opacity-50" title="功能开发中">
            <span class="text-base">📎</span> 添加素材
          </button>
          <button class="flex items-center gap-1.5 text-xs hover:text-blue-600 transition-colors cursor-not-allowed opacity-50" title="功能开发中">
            <span class="text-base">🌐</span> 网页抓取
          </button>
        </div>
        
        <button 
          class="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-2.5 px-8 rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 group"
          :disabled="!modelValue.trim() || loading"
          @click="$emit('start')"
        >
          <span>{{ loading ? '解析生成中...' : '开始执行' }}</span>
          <span class="text-lg group-hover:-translate-y-1 group-hover:translate-x-1 transition-transform inline-block" v-if="!loading">🚀</span>
          <svg v-if="loading" class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * TopicInput - 步骤0：输入主题方向
 * 支持 v-model 双向绑定主题内容
 */
defineProps({
  /** 主题方向文本 (v-model) */
  modelValue: { type: String, required: true },
  /** 是否加载中 */
  loading: { type: Boolean, default: false }
})

defineEmits(['update:modelValue', 'start'])
</script>
