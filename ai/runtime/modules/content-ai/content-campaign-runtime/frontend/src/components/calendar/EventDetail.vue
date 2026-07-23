<template>
  <div class="modal-overlay" v-if="modelValue">
    <div class="modal-content">
      <div class="modal-header">
        <h3>{{ isEdit ? '编辑内容安排' : '添加内容安排' }}</h3>
        <button class="btn-close" @click="$emit('update:modelValue', false)">×</button>
      </div>
      
      <div class="modal-body">
        <div class="form-group">
          <label>内容标题 *</label>
          <input type="text" v-model="formData.title" placeholder="输入内容标题" />
        </div>
        
        <div class="form-row">
          <div class="form-group half">
            <label>计划日期 *</label>
            <input type="date" v-model="formData.scheduled_date" />
          </div>
          <div class="form-group half">
            <label>发布时间</label>
            <input type="time" v-model="formData.scheduled_time" />
          </div>
        </div>
        
        <div class="form-group">
          <label>四象限类型</label>
          <select v-model="formData.content_type">
            <option value="education">📚 教育干货</option>
            <option value="grass">🛍️ 种草推荐</option>
            <option value="interaction">💬 互动话题</option>
            <option value="brand_story">✨ 品牌故事</option>
          </select>
        </div>
        
        <div class="form-group">
          <label>目标平台</label>
          <div class="platform-checkboxes">
            <label v-for="p in platforms" :key="p.id">
              <input type="checkbox" :value="p.id" v-model="formData.platform" />
              {{ p.icon }} {{ p.name }}
            </label>
          </div>
        </div>

        <div class="form-group">
          <label>内容简要备注</label>
          <textarea v-model="formData.description" rows="3" placeholder="添加备注或大纲思路..."></textarea>
        </div>
      </div>
      
      <div class="modal-footer">
        <button class="btn btn-danger" v-if="isEdit" @click="$emit('delete', formData.id)" style="margin-right: auto;">删除</button>
        <button 
          class="btn btn-success" 
          v-if="isEdit && (!formData.status || formData.status === 'draft' || formData.status === 'scheduled')" 
          @click="handleCreateContent"
          style="margin-right: auto; background: #67c23a; color: white; border: none;"
        >
          🚀 一键推送创作
        </button>
        <button class="btn" @click="$emit('update:modelValue', false)">取消</button>
        <button class="btn btn-primary" @click="handleSave">保存</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: Boolean,
  event: {
    type: Object,
    default: () => null
  }
})

const emit = defineEmits(['update:modelValue', 'save', 'delete', 'create-content'])

const isEdit = ref(false)
const formData = ref({})

const platforms = [
  { id: 'xiaohongshu', name: '小红书', icon: '📕' },
  { id: 'douyin', name: '抖音', icon: '🎵' },
  { id: 'wechat', name: '公众号', icon: '📱' },
  { id: 'bilibili', name: 'B站', icon: '📺' },
  { id: 'weibo', name: '微博', icon: '🐦' }
]

watch(() => props.modelValue, (val) => {
  if (val) {
    if (props.event) {
      isEdit.value = true
      formData.value = { ...props.event }
      if (!formData.value.platform) formData.value.platform = []
    } else {
      isEdit.value = false
      formData.value = {
        title: '',
        scheduled_date: new Date().toISOString().split('T')[0],
        scheduled_time: '12:00',
        content_type: 'education',
        platform: ['xiaohongshu'],
        description: ''
      }
    }
  }
})

function handleSave() {
  if (!formData.value.title) {
    alert('请输入内容标题')
    return
  }
  emit('save', formData.value)
}

function handleCreateContent() {
  if (!formData.value.id) return
  emit('create-content', formData.value.id)
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-content {
  background: white;
  width: 500px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
.modal-header {
  padding: 15px 20px;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.modal-header h3 { margin: 0; font-size: 16px; }
.btn-close { background: none; border: none; font-size: 20px; cursor: pointer; color: #909399; }
.modal-body {
  padding: 20px;
  max-height: 70vh;
  overflow-y: auto;
}
.form-group { margin-bottom: 15px; }
.form-row { display: flex; gap: 15px; }
.half { flex: 1; }
label { display: block; margin-bottom: 6px; font-weight: 500; font-size: 14px; color: #606266; }
input[type="text"], input[type="date"], input[type="time"], select, textarea {
  width: 100%; padding: 8px 12px; border: 1px solid #dcdfe6; border-radius: 4px; box-sizing: border-box;
}
.platform-checkboxes {
  display: flex; gap: 15px; flex-wrap: wrap;
}
.platform-checkboxes label {
  display: flex; align-items: center; gap: 4px; font-weight: normal; cursor: pointer;
}
.modal-footer {
  padding: 15px 20px;
  border-top: 1px solid #ebeef5;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.btn-danger { background: #f56c6c; color: white; border: none; }
</style>
