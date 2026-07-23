<template>
  <div class="plan-generator-overlay" v-if="modelValue">
    <div class="plan-generator-drawer">
      <div class="drawer-header">
        <h3>🤖 AI 智能排期生成</h3>
        <button class="btn-close" @click="$emit('update:modelValue', false)" :disabled="loading">×</button>
      </div>
      <div class="drawer-body">
        <p>基于你的账号定位，自动生成 {{ year }}年{{ month }}月 的内容规划。</p>
        <div class="form-group">
          <label>账号定位描述 *</label>
          <textarea v-model="formData.brand_description" rows="3" placeholder="例如：25岁职场女性，记录下班后的自我提升和护肤心得" :disabled="loading"></textarea>
        </div>
        <div class="form-group">
          <label>所属行业 *</label>
          <input v-model="formData.industry" type="text" placeholder="例如：美妆护肤、职场成长" :disabled="loading" />
        </div>
        <div class="form-action">
          <button class="btn btn-primary btn-block" @click="handleGenerate" :disabled="loading">
            {{ loading ? '🪄 生成中 (约需1-2分钟)...' : '🪄 一键生成排期计划' }}
          </button>
        </div>
        
        <div v-if="loading" class="loading-tip">
          <p>AI 正在分析行业受众、匹配营销节点并进行内容矩阵排布...</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { generateCalendarPlan } from '../../api.js'

const props = defineProps({
  modelValue: Boolean,
  year: Number,
  month: Number
})

const emit = defineEmits(['update:modelValue', 'plan-generated'])

const loading = ref(false)
const formData = ref({
  brand_description: '',
  industry: ''
})

async function handleGenerate() {
  if (!formData.value.brand_description || !formData.value.industry) {
    alert('请填写账号定位和所属行业')
    return
  }

  loading.value = true
  try {
    const res = await generateCalendarPlan({
      brand_description: formData.value.brand_description,
      industry: formData.value.industry,
      year: props.year,
      month: props.month
    })
    
    alert(`生成成功！已为您排期 ${res.total} 条内容。`)
    emit('plan-generated')
    emit('update:modelValue', false) // 关闭面板
  } catch (error) {
    alert(`生成失败: ${error.response?.data?.detail || error.message}`)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.plan-generator-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}
.plan-generator-drawer {
  width: 400px;
  background: white;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.drawer-header {
  padding: 20px;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.drawer-header h3 {
  margin: 0;
  font-size: 18px;
}
.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #999;
}
.drawer-body {
  padding: 20px;
  flex: 1;
  overflow-y: auto;
}
.form-group {
  margin-bottom: 20px;
}
.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
}
.form-group input, .form-group textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
}
.btn-block {
  width: 100%;
  padding: 12px;
  font-size: 16px;
}
.btn-block:disabled {
  background: #a0cfff;
  cursor: not-allowed;
}
.loading-tip {
  margin-top: 15px;
  padding: 15px;
  background: #f0f9eb;
  color: #67c23a;
  border-radius: 4px;
  font-size: 13px;
  text-align: center;
}
</style>
