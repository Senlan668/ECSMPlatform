<template>
  <div class="min-h-full bg-slate-50/40 p-6 md:p-10">
    <div class="max-w-7xl mx-auto">
      <!-- 页面头部 -->
      <div class="mb-10">
        <h2 class="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          <span class="p-2 bg-blue-600 rounded-2xl shadow-lg shadow-blue-200 text-white">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </span>
          个人中心 <span class="text-slate-400 font-light text-xl ml-1">Profile Dashboard</span>
        </h2>
        <p class="text-slate-500 mt-2 leading-relaxed">
          管理您的个人身份资产与创作偏好。在这里，您可以量身定制专属于您的 AI 创意工作空间。
        </p>
      </div>

      <div v-if="!pageLoading" class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <!-- 顶部个人资料卡片 -->
        <ProfileHeader 
          :profile="profile" 
          @update-profile="handleUpdateProfile"
          @upload-avatar="handleUploadAvatar"
        />
        
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- 创作统计仪表盘 (占据 2/3) -->
          <div class="lg:col-span-2">
            <StatsPanel :stats="stats" :loading="statsLoading" />
          </div>
          
          <!-- 快捷入口 (占据 1/3) -->
          <div class="lg:col-span-1">
            <QuickLinks @nav="handleNavigate" />
          </div>
        </div>
        
        <!-- 偏好与安全设置 -->
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <PreferenceForm :prefs="preferences" @update-prefs="handleUpdatePrefs" />
          <PasswordForm @change-password="handleChangePassword" />
        </div>
        
        <!-- 底部退出操作 -->
        <div class="pt-10 flex justify-center border-t border-slate-200">
          <button 
            @click="handleLogout"
            class="px-10 py-3 bg-white border border-red-100 text-red-500 font-bold rounded-2xl shadow-sm hover:bg-red-50 hover:border-red-200 hover:shadow-md transition-all active:scale-95 flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
            退出登录状态
          </button>
        </div>
      </div>
      
      <!-- 加载状态 -->
      <div v-else class="min-h-[500px] flex flex-col items-center justify-center space-y-4">
        <div class="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
        <p class="text-slate-400 font-medium animate-pulse">正在同步您的个人资产...</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

// API
import { 
  getProfile, updateProfile, uploadAvatar, changePassword,
  getProfileStats, getPreferences, updatePreferences
} from './api'

// 组件
import ProfileHeader from './components/profile/ProfileHeader.vue'
import StatsPanel from './components/profile/StatsPanel.vue'
import QuickLinks from './components/profile/QuickLinks.vue'
import PreferenceForm from './components/profile/PreferenceForm.vue'
import PasswordForm from './components/profile/PasswordForm.vue'

const emit = defineEmits(['navigate', 'logout', 'profile-updated'])

const pageLoading = ref(true)
const statsLoading = ref(true)

const profile = ref({})
const stats = ref({})
const preferences = ref({})

onMounted(async () => {
  await loadBaseProfile()
  loadStatsAndPrefs() // 异步并行加载
})

async function loadBaseProfile() {
  try {
    profile.value = await getProfile()
  } catch (e) {
    console.error('Failed to load profile', e)
  } finally {
    pageLoading.value = false
  }
}

async function loadStatsAndPrefs() {
  try {
    const [st, pr] = await Promise.all([
      getProfileStats(),
      getPreferences()
    ])
    stats.value = st
    preferences.value = pr
  } catch (e) {
    console.error('Failed to load stats/prefs', e)
  } finally {
    statsLoading.value = false
  }
}

async function handleUpdateProfile(data) {
  try {
    const res = await updateProfile(data)
    profile.value = res
    emit('profile-updated', res)
  } catch (e) {
    alert('更新资料失败: ' + e.message)
  }
}

async function handleUploadAvatar(fileData) {
  try {
    const res = await uploadAvatar(fileData)
    profile.value.avatar_url = res.avatar_url
    emit('profile-updated', profile.value)
  } catch (e) {
    alert('头像上传失败: ' + e.message)
  }
}

async function handleUpdatePrefs(data, callback) {
  try {
    const res = await updatePreferences(data)
    preferences.value = res
    callback(null)
  } catch (e) {
    callback(e.message)
  }
}

async function handleChangePassword(data, callback) {
  try {
    await changePassword(data)
    callback(null)
  } catch (e) {
    const msg = e.response?.data?.detail || e.message || '密码修改失败'
    callback(msg)
  }
}

function handleNavigate(page) {
  emit('navigate', page)
}

function handleLogout() {
  if (confirm('确定要退出登录吗？')) {
    emit('logout')
  }
}
</script>
