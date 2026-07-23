<template>
  <div class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
    <div class="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
        <h3 class="text-lg font-bold text-slate-800">{{ isEdit ? '编辑提示词' : '收藏提示词' }}</h3>
        <button @click="$emit('close')" class="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200 transition-colors">
          ✕
        </button>
      </div>

      <!-- Body -->
      <div class="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-5">
        <!-- Title & Category -->
        <div class="grid grid-cols-3 gap-4">
          <div class="col-span-2 space-y-1.5">
            <label class="text-sm font-medium text-slate-700 block">标题 <span class="text-red-500">*</span></label>
            <input 
              v-model="form.title" 
              type="text" 
              placeholder="给这条提示词起个容易记的名字..."
              class="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              :class="{'border-red-300 bg-red-50': errors.title}"
            />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-slate-700 block">分类</label>
            <select 
              v-model="form.category"
              class="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all bg-white"
            >
              <option value="poster">🎨 海报生成</option>
              <option value="workflow">⚡ 内容工作流</option>
              <option value="other">🔧 其他</option>
            </select>
          </div>
        </div>

        <!-- Tags -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-slate-700 block">标签 (回车添加)</label>
          <div class="border border-slate-200 rounded-xl p-2 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all bg-white flex flex-wrap gap-2 items-center min-h-[42px]">
            <span v-for="(tag, index) in form.tags" :key="index" class="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-xs flex items-center gap-1 group">
              {{ tag }}
              <button @click="removeTag(index)" class="text-slate-400 hover:text-red-500 opacity-50 group-hover:opacity-100">✕</button>
            </span>
            <input 
              v-model="tagInput"
              @keydown.enter.prevent="addTag"
              @keydown.delete="handleTagDelete"
              type="text"
              placeholder="输入标签..."
              class="flex-1 min-w-[80px] bg-transparent outline-none text-sm text-slate-700 py-0.5"
            />
          </div>
        </div>

        <!-- Content -->
        <div class="space-y-1.5 flex-1 flex flex-col">
          <label class="text-sm font-medium text-slate-700 block">提示词内容 <span class="text-red-500">*</span></label>
          <textarea 
            v-model="form.content"
            rows="8"
            placeholder="在这里输入提示词正文..."
            class="w-full flex-1 px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none font-mono leading-relaxed"
            :class="{'border-red-300 bg-red-50': errors.content}"
          ></textarea>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-slate-100 flex items-center justify-between shrink-0 bg-white rounded-b-2xl">
        <div class="text-xs text-slate-400">
          <span v-if="form.is_public" class="text-green-600 flex items-center gap-1"><span>🌍</span> 这是一个公开的提示词</span>
          <span v-else class="flex items-center gap-1"><span>🔒</span> 仅自己可见</span>
        </div>
        <div class="flex items-center gap-3">
          <button @click="$emit('close')" class="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
            取消
          </button>
          <button 
            @click="handleSave" 
            :disabled="saving"
            class="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm shadow-blue-600/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div v-if="saving" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            <span>{{ saving ? '保存中...' : '💾 保存' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { createPrompt, updatePrompt } from '../../api'

const props = defineProps({
  prompt: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'saved'])

const isEdit = computed(() => !!props.prompt?.id)
const saving = ref(false)

const form = reactive({
  title: '',
  category: 'poster',
  tags: [],
  content: '',
  is_public: false
})

const errors = reactive({
  title: false,
  content: false
})

const tagInput = ref('')

onMounted(() => {
  if (props.prompt) {
    form.title = props.prompt.title || ''
    form.category = props.prompt.category || 'poster'
    form.tags = [...(props.prompt.tags || [])]
    form.content = props.prompt.content || ''
    form.is_public = props.prompt.is_public || false
  }
})

const addTag = () => {
  const val = tagInput.value.trim()
  if (val && !form.tags.includes(val) && form.tags.length < 10) {
    form.tags.push(val)
  }
  tagInput.value = ''
}

const removeTag = (index) => {
  form.tags.splice(index, 1)
}

const handleTagDelete = (e) => {
  if (tagInput.value === '' && form.tags.length > 0) {
    form.tags.pop()
  }
}

const validate = () => {
  let valid = true
  errors.title = false
  errors.content = false
  
  if (!form.title.trim()) {
    errors.title = true
    valid = false
  }
  if (!form.content.trim()) {
    errors.content = true
    valid = false
  }
  return valid
}

const handleSave = async () => {
  if (!validate()) return
  
  saving.value = true
  try {
    const payload = {
      title: form.title.trim(),
      category: form.category,
      tags: form.tags,
      content: form.content.trim()
    }
    
    if (isEdit.value) {
      await updatePrompt(props.prompt.id, payload)
    } else {
      await createPrompt(payload)
    }
    emit('saved')
  } catch (error) {
    console.error('保存失败:', error)
    alert('保存失败，请重试')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #e2e8f0;
  border-radius: 20px;
}
</style>
