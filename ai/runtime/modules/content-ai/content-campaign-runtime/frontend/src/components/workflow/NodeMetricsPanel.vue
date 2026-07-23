<template>
  <div v-if="nodeMetrics.length > 0" class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-4">
    <div class="flex items-center gap-2 mb-1">
      <span class="text-blue-500 text-lg">📊</span>
      <h4 class="font-bold text-slate-700">节点执行指标</h4>
    </div>
    
    <!-- 汇总统计 -->
    <div class="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
      <div class="flex flex-col items-center">
        <span class="text-xs text-slate-400 mb-1">总耗时</span>
        <span class="font-bold text-slate-700 font-mono">{{ totalDuration }}</span>
      </div>
      <div class="flex flex-col items-center border-x border-slate-200">
        <span class="text-xs text-slate-400 mb-1">总Tokens</span>
        <span class="font-bold text-blue-600 font-mono">{{ totalTokens.toLocaleString() }}</span>
      </div>
      <div class="flex flex-col items-center">
        <span class="text-xs text-slate-400 mb-1">执行节点</span>
        <span class="font-bold text-slate-700 font-mono">{{ nodeMetrics.length }}</span>
      </div>
    </div>
    
    <!-- 各节点详情 -->
    <div class="flex flex-col gap-3 max-h-[300px] overflow-y-auto no-scrollbar pr-1">
      <div v-for="(metric, index) in nodeMetrics" :key="index" class="p-3 bg-white border border-slate-100 shadow-sm rounded-xl">
        <div class="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
          <span class="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{{ getNodeDisplayName(metric.node_name) }}</span>
          <span class="text-xs text-emerald-600 font-mono">{{ formatDuration(metric.duration_ms) }}</span>
        </div>
        <div class="grid grid-cols-2 gap-y-2 text-[11px] text-slate-500 font-mono">
          <div class="flex justify-between"><span>输入:</span> <span class="text-slate-700">{{ metric.input_tokens || 0 }}</span></div>
          <div class="flex justify-between pl-2 border-l border-slate-100"><span>输出:</span> <span class="text-slate-700">{{ metric.output_tokens || 0 }}</span></div>
          <div class="col-span-2 flex justify-between bg-slate-50 p-1 rounded"><span>总计:</span> <span class="font-bold text-blue-600">{{ metric.total_tokens || 0 }}</span></div>
          <div v-if="metric.model" class="col-span-2 flex justify-between mt-1"><span>模型:</span> <span class="text-slate-400 truncate w-24 text-right" :title="metric.model">{{ metric.model }}</span></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

/**
 * NodeMetricsPanel - 节点执行指标面板
 * 展示工作流各节点的耗时和 Token 使用统计
 */
const props = defineProps({
  /** 节点指标数据数组 */
  nodeMetrics: { type: Array, default: () => [] }
})

/** 计算总耗时 */
const totalDuration = computed(() => {
  const total = props.nodeMetrics.reduce((sum, m) => sum + (m.duration_ms || 0), 0)
  return formatDuration(total)
})

/** 计算总 Token 数 */
const totalTokens = computed(() => {
  return props.nodeMetrics.reduce((sum, m) => sum + (m.total_tokens || 0), 0)
})

/** 格式化耗时为可读字符串 */
function formatDuration(ms) {
  if (!ms) return '0ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

/** 获取节点中文显示名称 */
function getNodeDisplayName(nodeName) {
  const nameMap = {
    'plan_topics': '选题规划',
    'write_draft': '文章写作',
    'extract_visuals': '提取配图要点',
    'generate_images': '生成配图'
  }
  return nameMap[nodeName] || nodeName
}
</script>
