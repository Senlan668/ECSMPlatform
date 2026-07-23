<template>
  <div class="content-editor">
    <div class="header-tools">
      <span class="word-count" :class="{ 'error': !isWordCountValid }">
        字数：{{ currentWordCount }} / {{ targetRange }}
      </span>
      <div v-if="!isWordCountValid" class="warning-text">
        ⚠️ 建议字数在 {{ minWords }}~{{ maxWords }} 之间
      </div>
    </div>
    
    <textarea 
      class="editor-textarea custom-scrollbar"
      v-model="internalContent"
      @input="debouncedUpdate"
      placeholder="平台改写内容..."
    ></textarea>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  minWords: { type: Number, default: 0 },
  maxWords: { type: Number, default: 9999 }
})

const emit = defineEmits(['update:modelValue', 'change'])

const internalContent = ref(props.modelValue)

// 字数统计
const currentWordCount = computed(() => {
  return internalContent.value ? internalContent.value.length : 0
})

const targetRange = computed(() => {
  return `${props.minWords}~${props.maxWords}`
})

const isWordCountValid = computed(() => {
  const count = currentWordCount.value
  return count >= props.minWords && count <= props.maxWords
})

// 防抖更新以减少 API 编辑请求频率
let timeoutId = null
function debouncedUpdate() {
  emit('update:modelValue', internalContent.value)
  
  if (timeoutId) clearTimeout(timeoutId)
  timeoutId = setTimeout(() => {
    emit('change', internalContent.value)
  }, 800)
}

watch(() => props.modelValue, (newVal) => {
  if (newVal !== internalContent.value) {
    internalContent.value = newVal
  }
})
</script>

<style scoped>
.content-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.header-tools {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
}

.word-count {
  color: #666;
}

.word-count.error {
  color: #fa8c16;
}

.warning-text {
  color: #fa8c16;
}

.editor-textarea {
  flex: 1;
  width: 100%;
  min-height: 280px;
  padding: 16px;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  background: #fafafa;
  font-family: inherit;
  font-size: 15px;
  line-height: 1.6;
  resize: none;
  transition: all 0.3s;
  box-sizing: border-box;
}

.editor-textarea:focus {
  outline: none;
  border-color: #1890ff;
  background: white;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.1);
}

/* 隐藏滚动条但可滚 */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #bfbfbf;
  border-radius: 3px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
</style>
