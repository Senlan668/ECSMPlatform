<template>
  <div class="poster-panel inpaint-panel">
    <div class="card">
      <div class="card-title">圈出区域，通过文字指示修改或智能擦除内容</div>

      <!-- 图片上传区 -->
      <ImageUploader
        v-if="!form.imageBase64"
        :modelValue="form.imageBase64"
        @update:modelValue="handleUpload"
      />

      <!-- 画布编辑区 (含模式切换与提示词) -->
      <div v-else class="inpaint-editor-section">
        <div class="editor-header">
          <button class="btn btn-small btn-outline" @click="resetImage">换一张图</button>
        </div>

        <CanvasEditor
          :imageUrl="form.imageBase64"
          @maskGenerated="handleMaskGenerated"
        />

        <!-- 模式切换 -->
        <div class="form-group edit-mode-switch mt-4">
          <label class="radio-label">
            <input type="radio" value="inpaint" v-model="form.editMode" />
            🖌️ 定向替换 (圈选后输入文字替换)
          </label>
          <label class="radio-label ml-4">
            <input type="radio" value="erase" v-model="form.editMode" />
            🧹 智能消除 (AI 自动脑补背景消除选中区域)
          </label>
        </div>

        <!-- Inpaint 提示词输入 -->
        <div class="form-group" v-if="form.editMode === 'inpaint'">
          <label>想要替换成什么？ <span class="label-hint">（必填）</span></label>
          <input
            v-model="form.prompt"
            class="input"
            placeholder="例如：一条金毛犬 / 一束玫瑰花 / 换成蓝天..."
          />
        </div>

        <!-- 生成按钮 -->
        <button
          class="btn btn-primary poster-generate-btn mt-4"
          :disabled="!isValid || generating"
          @click="handleGenerate"
        >
          {{ generating ? '🎨 处理中...' : (form.editMode === 'erase' ? '🧹 智能消除计算中' : '🚀 局部重绘') }}
        </button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import ImageUploader from './ImageUploader.vue'
import CanvasEditor from './CanvasEditor.vue'

const props = defineProps({
  aspectRatios: { type: Array, default: () => [] },
  generating: { type: Boolean, default: false }
})

const emit = defineEmits(['generate'])

const form = ref({
  imageBase64: null,
  maskBase64: null,
  editMode: 'inpaint', // 'inpaint' | 'erase'
  prompt: '',
})

const isValid = computed(() => {
  if (!form.value.imageBase64) return false
  if (!form.value.maskBase64) return false

  if (form.value.editMode === 'inpaint') {
    return form.value.prompt.trim() !== ''
  }
  return true // erase 模式不需要 prompt
})

function handleUpload(base64Data) {
  form.value.imageBase64 = base64Data
  form.value.maskBase64 = null
  form.value.prompt = ''
}

function resetImage() {
  form.value.imageBase64 = null
  form.value.maskBase64 = null
  form.value.prompt = ''
}

function handleMaskGenerated(maskDataUrl) {
  form.value.maskBase64 = maskDataUrl
}

function handleGenerate() {
  if (!isValid.value || props.generating) return
  emit('generate', { ...form.value })
}
</script>

<style scoped>
.inpaint-panel .card-title {
  margin-bottom: 24px;
}
.editor-header {
  display: flex;
  justify-content: flex-end;
}
.edit-mode-switch {
  display: flex;
  align-items: center;
  background: var(--bg-color-secondary);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}
.radio-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 500;
}
.ml-4 {
  margin-left: 20px;
}
</style>
