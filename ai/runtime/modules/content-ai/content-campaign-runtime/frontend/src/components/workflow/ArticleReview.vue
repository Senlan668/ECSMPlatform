<template>
  <div class="p-6 md:p-8 h-full flex flex-col">
    <div class="flex items-center gap-3 mb-6">
      <span class="text-blue-600 text-xl font-medium">📖</span>
      <h3 class="text-lg font-bold text-slate-800 tracking-tight">审核文章草稿</h3>
    </div>

    <div v-if="loading && !articleContent" class="flex-1 flex flex-col items-center justify-center text-slate-400 min-h-[200px]">
      <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
      <p class="text-sm font-medium">AI 正在奋笔疾书中...</p>
    </div>

    <template v-else>
      <div class="flex-1 flex flex-col gap-6">
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-5 overflow-y-auto max-h-[500px]">
          <div class="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap min-h-[150px]">
            {{ articleContent }}
            <span v-if="loading" class="inline-block w-2 bg-blue-500 animate-pulse ml-1">&nbsp;</span>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-sm font-semibold text-slate-700 flex items-center gap-2">
             <span class="text-slate-400">✏️</span> 驳回反馈 <span class="text-xs text-slate-400 font-normal">(可选)</span>
          </label>
          <textarea 
            :value="feedback"
            @input="$emit('update:feedback', $event.target.value)"
            class="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all placeholder:text-slate-400 resize-none" 
            placeholder="如果内容不满意，请输入具体的修改意见，例如：'语气再幽默一点，多分段'..."
            rows="3"
            :disabled="loading"
          ></textarea>
        </div>
      </div>

      <div class="flex items-center gap-4 mt-6 pt-6 border-t border-slate-100">
        <button 
          class="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white font-bold py-2.5 px-8 rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
          :disabled="loading"
          @click="$emit('approve')"
        >
          <span>✅</span> 审核通过并生成配图
        </button>
        <button 
          class="bg-rose-50 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed text-rose-600 font-bold py-2.5 px-6 rounded-xl border border-rose-200 transition-all flex items-center gap-2"
          :disabled="loading"
          @click="$emit('reject')"
        >
          <span>🔄</span> 驳回重写
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
/**
 * ArticleReview - 步骤2：审核文章草稿
 * 展示 AI 生成的文章内容，支持通过或驳回重写
 */
defineProps({
  /** 是否加载中 */
  loading: { type: Boolean, default: false },
  /** 文章内容 */
  articleContent: { type: String, default: '' },
  /** 驳回反馈文本 */
  feedback: { type: String, default: '' }
})

defineEmits(['approve', 'reject', 'update:feedback'])
</script>
