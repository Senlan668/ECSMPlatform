<template>
  <div class="tag-suggestion">
    <div class="tag-header">
      <span class="tag-title">🤖 AI 推荐标签</span>
      <button class="copy-all-btn" @click="copyAllTags">复制全部标签</button>
    </div>
    
    <div class="tags-container">
      <div 
        v-for="(tag, index) in tags" 
        :key="index"
        class="tag-pill"
        :class="{ selected: selectedTags.includes(tag) }"
        @click="toggleSelect(tag)"
      >
        {{ tag }}
      </div>
    </div>
    <div class="tag-hint">点击可选中/取消标签。当前已选中 {{ selectedTags.length }} 个。</div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  tags: { type: Array, default: () => [] },
  modelValue: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:modelValue', 'change', 'copy'])

// 内部选中状态，方便如果要做“选择性应用标签”功能的话使用
// 默认为全部选中
const selectedTags = ref([...props.modelValue])

watch(() => props.modelValue, (newVal) => {
  selectedTags.value = [...newVal]
})

function toggleSelect(tag) {
  const idx = selectedTags.value.indexOf(tag)
  if (idx > -1) {
    selectedTags.value.splice(idx, 1)
  } else {
    selectedTags.value.push(tag)
  }
  emit('update:modelValue', selectedTags.value)
  emit('change', selectedTags.value)
}

function copyAllTags() {
  const textToCopy = selectedTags.value.join(' ')
  navigator.clipboard.writeText(textToCopy).then(() => {
    emit('copy')
  })
}
</script>

<style scoped>
.tag-suggestion {
  background: #f0f7ff;
  border: 1px solid #bae0ff;
  border-radius: 8px;
  padding: 16px;
}

.tag-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.tag-title {
  font-size: 14px;
  font-weight: 600;
  color: #0958d9;
}

.copy-all-btn {
  background: transparent;
  border: 1px solid #69b1ff;
  color: #0958d9;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.copy-all-btn:hover {
  background: #e6f4ff;
  border-color: #1890ff;
}

.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.tag-pill {
  padding: 4px 12px;
  background: white;
  border: 1px solid #d9d9d9;
  border-radius: 16px;
  font-size: 13px;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;
}

.tag-pill:hover {
  border-color: #1890ff;
}

.tag-pill.selected {
  background: #1890ff;
  border-color: #1890ff;
  color: white;
}

.tag-hint {
  font-size: 12px;
  color: #999;
}
</style>
