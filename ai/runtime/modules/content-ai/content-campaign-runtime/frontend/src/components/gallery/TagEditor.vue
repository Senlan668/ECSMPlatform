<template>
  <div class="tag-editor">
    <label v-if="label">{{ label }}</label>
    
    <!-- 已添加的标签列表 -->
    <div class="tags-list" v-if="modelValue && modelValue.length">
      <span class="tag-item" v-for="(tag, idx) in modelValue" :key="idx">
        {{ tag }}
        <button class="tag-remove-btn" @click="removeTag(idx)" title="移除标签">×</button>
      </span>
    </div>

    <!-- 输入新标签 -->
    <div class="tag-input-row">
      <input
        type="text"
        v-model.trim="newTag"
        class="input tag-input"
        :placeholder="placeholder"
        @keyup.enter="addTag"
        @keydown.tab.prevent="addTag"
      />
      <button class="btn btn-sm" @click="addTag" :disabled="!newTag">+ 添加</button>
    </div>

    <!-- 推荐标签 -->
    <div class="suggested-tags" v-if="suggestions.length">
      <span class="suggested-label">热门：</span>
      <button
        v-for="s in filteredSuggestions"
        :key="s"
        class="tag-suggestion"
        @click="addSuggestion(s)"
      >
        {{ s }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  label: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: '输入标签后回车添加'
  },
  suggestions: {
    type: Array,
    default: () => ['穿搭', '美食', '旅行', '家居', '数码', '知识', '系列封面', '日常']
  }
})

const emit = defineEmits(['update:modelValue'])

const newTag = ref('')

// 过滤掉已添加的推荐标签
const filteredSuggestions = computed(() => {
  return props.suggestions.filter(s => !(props.modelValue || []).includes(s))
})

function addTag() {
  if (!newTag.value) return
  const current = props.modelValue || []
  if (!current.includes(newTag.value)) {
    emit('update:modelValue', [...current, newTag.value])
  }
  newTag.value = ''
}

function addSuggestion(tag) {
  const current = props.modelValue || []
  if (!current.includes(tag)) {
    emit('update:modelValue', [...current, tag])
  }
}

function removeTag(index) {
  const updated = [...(props.modelValue || [])]
  updated.splice(index, 1)
  emit('update:modelValue', updated)
}
</script>

<style scoped>
.tag-editor label {
  display: block;
  font-size: 13px;
  color: #909399;
  margin-bottom: 8px;
  font-weight: 500;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.tag-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #ecf5ff;
  color: #409eff;
  padding: 4px 10px;
  border-radius: 16px;
  font-size: 13px;
}

.tag-remove-btn {
  background: none;
  border: none;
  color: #a0cfff;
  font-size: 14px;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
}

.tag-remove-btn:hover {
  color: #f56c6c;
}

.tag-input-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.tag-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
}

.tag-input:focus {
  border-color: #409eff;
}

.btn-sm {
  padding: 6px 14px;
  font-size: 13px;
  border-radius: 6px;
  cursor: pointer;
  background: #f0f2f5;
  border: 1px solid #dcdfe6;
  color: #606266;
}

.btn-sm:hover:not(:disabled) {
  background: #ecf5ff;
  border-color: #409eff;
  color: #409eff;
}

.btn-sm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.suggested-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.suggested-label {
  font-size: 12px;
  color: #c0c4cc;
}

.tag-suggestion {
  background: #f5f7fa;
  border: 1px dashed #dcdfe6;
  color: #909399;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.tag-suggestion:hover {
  background: #ecf5ff;
  border-color: #409eff;
  color: #409eff;
}
</style>
