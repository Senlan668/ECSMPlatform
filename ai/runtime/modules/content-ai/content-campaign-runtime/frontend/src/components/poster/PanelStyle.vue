<template>
  <div class="poster-panel">
    <div class="card">
      <div class="card-title">上传原图进行风格迁移</div>

      <!-- 图片上传 -->
      <ImageUploader v-model="form.imageBase64" />

      <!-- 风格标签选择 (仅限单选，为API匹配) 或者多选，视需要而定 -->
      <div class="form-group" style="margin-top: 20px;">
        <label>目标风格 <span class="label-hint">（可多选）</span></label>
        <div class="style-tag-grid" v-if="styleTags.length > 0">
          <button
            v-for="tag in styleTags"
            :key="tag.name"
            class="style-tag-btn"
            :class="{ selected: form.selectedStyles.includes(tag.name) }"
            :style="getTagStyle(tag)"
            @click="toggleStyle(tag.name)"
          >
            <span class="tag-icon">{{ tag.icon }}</span>
            <span class="tag-name">{{ tag.name }}</span>
          </button>
        </div>
        <div v-else class="loading-small">
          <div class="loading-spinner-small"></div>
          <span>加载目标风格...</span>
        </div>
      </div>

      <!-- 迁移强度 -->
      <div class="form-group">
        <label>迁移强度</label>
        <div class="strength-selector">
          <button
            v-for="opt in strengthOptions"
            :key="opt.value"
            class="strength-btn"
            :class="{ active: form.strength === opt.value }"
            @click="form.strength = opt.value"
          >
            <div class="strength-title">{{ opt.label }}</div>
            <div class="strength-desc">{{ opt.desc }}</div>
          </button>
        </div>
      </div>

      <!-- 尺寸选择 -->
      <div class="form-group">
        <label>输出尺寸</label>
        <RatioSelector v-model="form.aspectRatio" :ratios="aspectRatios" />
      </div>

      <!-- 生成按钮 -->
      <button
        class="btn btn-primary poster-generate-btn"
        :disabled="!isValid || generating"
        @click="handleGenerate"
      >
        {{ generating ? '🎨 迁移中...' : '🎭 执行风格迁移' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import ImageUploader from './ImageUploader.vue'
import RatioSelector from './RatioSelector.vue'

const props = defineProps({
  styleTags: { type: Array, default: () => [] },
  aspectRatios: { type: Array, default: () => [] },
  generating: { type: Boolean, default: false }
})

const emit = defineEmits(['generate'])

const strengthOptions = [
  { value: 'light', label: '轻度', desc: '保留较多原图细节' },
  { value: 'medium', label: '中度', desc: '平衡风格与原图' },
  { value: 'strong', label: '深度', desc: '强烈应用新风格' },
]

const form = ref({
  imageBase64: '',
  selectedStyles: [],
  strength: 'medium',
  aspectRatio: '3:4',
})

const isValid = computed(() => {
  return form.value.imageBase64 && form.value.selectedStyles.length > 0
})

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
