<template>
  <div class="poster-panel adapt-panel">
    <div class="card">
      <div class="card-title">将图片智能适配为所需平台的专用尺寸比例</div>

      <!-- 图片上传区 -->
      <ImageUploader
        v-if="!form.imageBase64"
        :modelValue="form.imageBase64"
        @update:modelValue="handleUpload"
      />

      <div v-else class="adapt-editor-section">
        <div class="editor-header mb-4">
          <button class="btn btn-small btn-outline" @click="resetImage">换一张图</button>
        </div>

        <div class="adapt-preview-container mb-4">
            <img :src="form.imageBase64" class="source-preview-image" alt="待适配原图" />
        </div>

        <!-- 当前源图比例 -->
        <div class="form-group">
          <label>当前原图比例声明 <span class="label-hint">（请指定，以辅助 AI 判断）</span></label>
          <div class="radio-group-boxes">
            <label class="radio-box" :class="{active: form.sourceRatio === '3:4'}">
              <input type="radio" value="3:4" v-model="form.sourceRatio" /> 小红书 3:4
            </label>
            <label class="radio-box" :class="{active: form.sourceRatio === '1:1'}">
              <input type="radio" value="1:1" v-model="form.sourceRatio" /> 方图 1:1
            </label>
            <label class="radio-box" :class="{active: form.sourceRatio === '2.35:1'}">
              <input type="radio" value="2.35:1" v-model="form.sourceRatio" /> 公众号 2.35:1
            </label>
             <label class="radio-box" :class="{active: form.sourceRatio === '9:16'}">
              <input type="radio" value="9:16" v-model="form.sourceRatio" /> 竖屏 9:16
            </label>
          </div>
        </div>

        <!-- 目标比例 -->
        <div class="form-group" v-if="!isExportAll">
          <label>想要转换成哪个目标比例？</label>
          <RatioSelector v-model="form.targetRatio" :ratios="aspectRatios" />
        </div>

        <!-- 适配策略 -->
        <div class="form-group adapt-strategy-switch">
          <label>AI 适配策略</label>
          <div class="strategy-options">
            <label class="radio-label">
              <input type="radio" value="crop" v-model="form.strategy" />
              ✂️ 智能裁剪 (提取核心主体，丢弃边缘)
            </label>
            <label class="radio-label mt-2">
              <input type="radio" value="outpaint" v-model="form.strategy" />
              🌌 AI 扩图 (保留完整原图，自动脑补缺失边缘)
            </label>
          </div>
        </div>

        <!-- 扩图文字提示（当策略为 outpaint 时） -->
        <div class="form-group" v-if="form.strategy === 'outpaint'">
          <label>扩充边缘的内容提示 <span class="label-hint">（选填，协助 AI 更好脑补上下文）</span></label>
          <input
            v-model="form.outpaintPrompt"
            class="input"
            placeholder="例如：延伸星空背景 / 补全木质桌面 / 增加草地面积"
          />
        </div>

        <div class="adapt-actions mt-4">
          <button
            class="btn btn-primary poster-generate-btn mr-4"
            :disabled="generating || isSourceEqualTarget"
            @click="handleGenerateSingle"
          >
             {{ generating && !isExportAll ? '📐 转换处理中...' : '📐 单比例适配' }}
          </button>
           <button
            class="btn btn-primary btn-outline poster-generate-btn"
            :disabled="generating"
            @click="handleExportAll"
          >
             {{ generating && isExportAll ? '📦 全平台并发生成中...' : '📦 全平台套装导出 (同时适配 4 种尺寸)' }}
          </button>
        </div>
        <div v-if="isSourceEqualTarget" class="error-text text-sm mt-2">
           提示: 源比例与目标比例相同，请更换目标比例。
        </div>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import ImageUploader from './ImageUploader.vue'
import RatioSelector from './RatioSelector.vue'

const props = defineProps({
  aspectRatios: { type: Array, default: () => [] },
  generating: { type: Boolean, default: false }
})

const emit = defineEmits(['generate'])

const form = ref({
  imageBase64: null,
  sourceRatio: '3:4',
  targetRatio: '16:9',
  strategy: 'outpaint', // 'crop' | 'outpaint'
  outpaintPrompt: ''
})

const isExportAll = ref(false)

const isSourceEqualTarget = computed(() => {
  return !isExportAll.value && form.value.sourceRatio === form.value.targetRatio
})

function handleUpload(base64Data) {
  form.value.imageBase64 = base64Data
  form.value.outpaintPrompt = ''
  isExportAll.value = false
}

function resetImage() {
  form.value.imageBase64 = null
  isExportAll.value = false
}

function handleGenerateSingle() {
  if (props.generating || isSourceEqualTarget.value) return
  isExportAll.value = false
  emit('generate', { ...form.value, exportAll: false })
}

function handleExportAll() {
  if (props.generating) return
  isExportAll.value = true
  // 发起全平台套装任务
  emit('generate', { ...form.value, exportAll: true })
}
</script>

<style scoped>
.adapt-panel .card-title {
  margin-bottom: 24px;
}
.adapt-preview-container {
  display: flex;
  justify-content: center;
  background: #1e1e1e;
  padding: 12px;
  border-radius: 8px;
  box-shadow: inset 0 2px 8px rgba(0,0,0,0.2);
}
.source-preview-image {
  max-width: 100%;
  max-height: 250px;
  object-fit: contain;
  border-radius: 4px;
}
.editor-header {
  display: flex;
  justify-content: flex-end;
}
.mb-4 { margin-bottom: 16px; }
.mt-4 { margin-top: 16px; }
.mt-2 { margin-top: 8px; }
.mr-4 { margin-right: 16px; }

/* 放射组样式块（扁平方形选择块） */
.radio-group-boxes {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.radio-box {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  background: var(--bg-color-secondary);
  font-size: 13px;
  transition: all 0.2s;
}
.radio-box:hover {
  border-color: var(--primary-color);
}
.radio-box.active {
  background: rgba(85, 230, 165, 0.1);
  border-color: var(--primary-color);
  color: var(--primary-color);
  font-weight: 500;
}
.radio-box input[type="radio"] {
  display: none;
}

.adapt-strategy-switch {
  background: var(--bg-color-secondary);
  padding: 16px;
  border-radius: 8px;
  border: 1px dashed var(--border-color);
}
.strategy-options {
  display: flex;
  flex-direction: column;
}
.radio-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: bold;
}
.adapt-actions {
  display: flex;
}
.error-text {
  color: #f56c6c;
}
</style>
