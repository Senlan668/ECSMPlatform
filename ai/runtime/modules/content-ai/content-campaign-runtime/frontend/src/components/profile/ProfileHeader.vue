<template>
  <div class="bg-white p-8 md:p-10 rounded-[2.5rem] shadow-xl shadow-slate-200/50 flex flex-col md:flex-row items-center md:items-start gap-10 relative overflow-hidden group">
    <!-- 背景装饰纹理 -->
    <div class="absolute -top-24 -right-24 w-64 h-64 bg-blue-50 rounded-full blur-3xl opacity-60 group-hover:bg-blue-100 transition-colors duration-700 pointer-events-none"></div>

    <!-- 左侧：头像磁贴 -->
    <div class="relative shrink-0">
      <div 
        class="w-32 h-32 md:w-36 md:h-36 rounded-[2rem] overflow-hidden cursor-pointer shadow-lg shadow-blue-100 relative group/avatar active:scale-95 transition-all"
        @click="triggerUpload"
      >
        <img v-if="profile.avatar_url" :src="profile.avatar_url" alt="Avatar" class="w-full h-full object-cover" />
        <div v-else class="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-5xl text-white font-black italic">
          {{ firstLetter }}
        </div>
        
        <!-- Hover 蒙层 (磨砂效果) -->
        <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity duration-300">
          <div class="flex flex-col items-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
            <span class="text-[10px] text-white font-bold tracking-widest uppercase">更换头像</span>
          </div>
        </div>
      </div>
      <input type="file" ref="fileInput" class="hidden" accept="image/*" @change="handleFileChange" />
    </div>

    <!-- 右侧：信息与编辑区 -->
    <div class="flex-1 w-full space-y-6">
      <div v-if="!isEditing" class="animate-in fade-in slide-in-from-left-4 duration-300">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="space-y-1">
            <div class="flex items-center gap-3">
              <h2 class="text-3xl font-black text-slate-800 tracking-tight">{{ profile.nickname || profile.username }}</h2>
              <span class="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold text-slate-400">@{{ profile.username }}</span>
            </div>
            <p class="text-slate-500 text-sm leading-relaxed max-w-lg italic">
              {{ profile.bio || '此创作者尚未留下任何 AI 生成宣言...' }}
            </p>
          </div>
          <button 
            @click="startEdit"
            class="px-5 py-2 bg-slate-50 text-slate-500 font-bold rounded-xl border border-slate-100 hover:bg-white hover:text-blue-600 hover:border-blue-200 transition-all active:scale-95 flex items-center gap-2 text-sm shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            编辑资料
          </button>
        </div>
        
        <div class="mt-6 flex items-center gap-6">
          <div class="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
            加入时间: {{ formatDate(profile.created_at) }}
          </div>
          <div class="flex items-center gap-2 text-[10px] font-bold text-blue-500 uppercase tracking-widest">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
            Stitch 特选创作者
          </div>
        </div>
      </div>

      <!-- 编辑模式 -->
      <div v-else class="animate-in fade-in zoom-in duration-300 space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-1.5 text-left">
            <label class="text-[10px] font-black text-slate-400 uppercase ml-1">个人昵称</label>
            <input 
              type="text" 
              v-model="editForm.nickname" 
              class="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl focus:bg-white focus:border-blue-500 transition-all outline-none text-sm placeholder:text-slate-300"
              placeholder="请输入您的创作代号..."
            />
          </div>
          <div class="space-y-1.5 text-left">
            <label class="text-[10px] font-black text-slate-400 uppercase ml-1">个性宣言 (Bio)</label>
            <input 
              type="text" 
              v-model="editForm.bio" 
              class="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl focus:bg-white focus:border-blue-500 transition-all outline-none text-sm placeholder:text-slate-300"
              placeholder="一句话介绍您的创作风格..."
            />
          </div>
        </div>
        
        <div class="flex items-center gap-3">
          <button 
            @click="saveProfile"
            class="px-8 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95 text-sm"
          >
            保存更改
          </button>
          <button 
            @click="cancelEdit"
            class="px-8 py-2.5 text-slate-400 font-bold hover:text-slate-700 transition-colors text-sm"
          >
            放弃修改
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  profile: {
    type: Object,
    required: true,
    default: () => ({ username: 'Guest' })
  }
})

const emit = defineEmits(['update-profile', 'upload-avatar'])

const isEditing = ref(false)
const fileInput = ref(null)

const editForm = ref({
  nickname: '',
  bio: ''
})

const firstLetter = computed(() => {
  const name = props.profile.nickname || props.profile.username || 'U'
  return name.charAt(0).toUpperCase()
})

function startEdit() {
  editForm.value = {
    nickname: props.profile.nickname || '',
    bio: props.profile.bio || ''
  }
  isEditing.value = true
}

function triggerUpload() {
  fileInput.value.click()
}

function handleFileChange(event) {
  const file = event.target.files[0]
  if (!file) return
  if (file.size > 2 * 1024 * 1024) {
    alert('头像图片不能超过 2MB')
    return
  }
  
  const reader = new FileReader()
  reader.onload = (e) => {
    const base64Str = e.target.result.split(',')[1]
    emit('upload-avatar', { 
      logo_base64: base64Str,
      content_type: file.type
    })
  }
  reader.readAsDataURL(file)
}

function saveProfile() {
  emit('update-profile', { ...editForm.value })
  isEditing.value = false
}

function cancelEdit() {
  isEditing.value = false
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return `${d.getFullYear()}年${String(d.getMonth()+1).padStart(2,'0')}月${String(d.getDate()).padStart(2,'0')}日`
}
</script>
