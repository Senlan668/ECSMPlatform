<template>
  <div class="p-6 md:p-8 h-full flex flex-col gap-8">
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-3">
        <span class="text-blue-600 text-2xl">🎉</span>
        <h3 class="text-xl font-bold text-slate-800 tracking-tight">最终创作成果</h3>
      </div>
      <span class="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold border border-green-200">生成完成</span>
    </div>

    <!-- 图文混合布局 -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      
      <!-- 左列：配图与视觉 -->
      <div class="flex flex-col gap-6">
        <div v-if="imageUrls.length > 0" class="flex flex-col gap-3">
          <h4 class="text-sm font-bold text-slate-700 flex items-center gap-2"><span class="text-blue-500">🖼️</span> 生成配图</h4>
          <div class="grid grid-cols-2 gap-4">
            <div v-for="(url, index) in imageUrls" :key="index" class="aspect-[3/4] rounded-xl overflow-hidden shadow-sm border border-slate-200 bg-slate-50 relative group">
              <img :src="url" :alt="'配图 ' + (index + 1)" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            </div>
          </div>
        </div>
        
        <div v-if="visualPoints.length > 0" class="bg-blue-50/50 border border-blue-100 rounded-xl p-5">
          <h4 class="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2"><span>👁️</span> 视觉要点指示</h4>
          <ul class="space-y-2 text-sm text-blue-900/80">
            <li v-for="(point, index) in visualPoints" :key="index" class="flex items-start gap-2">
              <span class="text-blue-400 mt-0.5">•</span>
              <span>{{ point }}</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- 右列：文章正文 -->
      <div class="flex flex-col gap-3">
        <h4 class="text-sm font-bold text-slate-700 flex items-center gap-2"><span class="text-blue-500">📝</span> 最终文案</h4>
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-6 h-full min-h-[400px]">
          <div class="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{{ articleContent }}</div>
        </div>
      </div>
      
    </div>

    <!-- 底部操作区 -->
    <div class="flex items-center gap-4 mt-8 pt-6 border-t border-slate-100">
      <button 
        class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2" 
        @click="goToAdapt"
      >
        <span>分发至平台</span>
        <span class="text-lg">🚀</span>
      </button>
      <button 
        class="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 px-6 rounded-xl transition-all" 
        @click="$emit('reset')"
      >
        开始新的创作
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * WorkflowComplete - 步骤4：工作流完成
 * 展示最终文章、配图和视觉要点
 */
const props = defineProps({
  /** 最终文章内容 */
  articleContent: { type: String, default: '' },
  /** 生成的图片 URL 列表 */
  imageUrls: { type: Array, default: () => [] },
  /** 视觉要点列表 */
  visualPoints: { type: Array, default: () => [] },
  /** 当前工作流的 threadId，用于跳转适配页面拉取数据 */
  threadId: { type: String, default: '' }
})

defineEmits(['reset'])

import { useRouter } from 'vue-router'

const router = useRouter()

function goToAdapt() {
  if (props.threadId) {
    // 强制跳转至 platform 页面，这里打开新标签页不合适，走 router.push
    router.push(`/platform/${props.threadId}`)
  } else {
    alert('缺少 threadId，无法跳转')
  }
}
</script>
