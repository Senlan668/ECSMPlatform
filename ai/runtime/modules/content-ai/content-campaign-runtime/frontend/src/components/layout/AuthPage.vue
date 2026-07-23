<template>
  <div class="bg-slate-50 min-h-screen flex items-center justify-center p-4 relative z-0">
    <!-- Background Decorative Elements -->
    <div class="fixed top-0 left-0 -z-10 w-full h-full overflow-hidden pointer-events-none opacity-40">
      <div class="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full"></div>
      <div class="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-blue-600/5 blur-[120px] rounded-full"></div>
    </div>

    <div class="w-full max-w-[440px] flex flex-col items-center">
      <!-- Logo Section -->
      <div class="flex items-center gap-3 mb-8">
        <div class="w-12 h-12 flex items-center justify-center shrink-0">
          <img src="/logo.png" alt="Logo" class="w-full h-full object-contain" />
        </div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900">内容运营助手</h1>
      </div>

      <!-- Login Card -->
      <div class="w-full bg-white rounded-xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8">
        <div class="mb-8">
          <h2 class="text-2xl font-bold text-slate-900">欢迎回来</h2>
          <p class="text-slate-500 mt-2">请登录您的账号以继续管理内容</p>
        </div>

        <form class="space-y-5" @submit.prevent="handleAuth">
          <!-- Username Input -->
          <div class="flex flex-col gap-2">
            <label class="text-sm font-semibold text-slate-700" for="username">用户名</label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">👤</span>
              <input 
                id="username"
                v-model="authForm.username" 
                type="text" 
                class="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 focus:bg-white outline-none transition-all text-slate-900 placeholder:text-slate-400"
                placeholder="在此输入用户名"
                required 
                minlength="3"
              />
            </div>
          </div>

          <!-- Password Input -->
          <div class="flex flex-col gap-2">
            <div class="flex justify-between items-center">
              <label class="text-sm font-semibold text-slate-700" for="password">密码</label>
              <span class="text-xs text-slate-400">账号由管理员创建</span>
            </div>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔒</span>
              <input 
                id="password"
                v-model="authForm.password" 
                type="password" 
                class="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 focus:bg-white outline-none transition-all text-slate-900 placeholder:text-slate-400"
                placeholder="输入您的密码"
                required 
                minlength="6"
              />
            </div>
          </div>

          <!-- Error Alert -->
          <div v-if="authError" class="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-medium">
            ⚠️ {{ authError }}
          </div>

          <!-- Submit Button -->
          <button 
            type="submit" 
            class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed mt-2"
            :disabled="authLoading"
          >
            <span>{{ authLoading ? '登录中...' : '立即登录' }}</span>
            <span v-if="!authLoading" class="group-hover:translate-x-1 transition-transform">→</span>
          </button>
        </form>
        


      </div>

      <p class="mt-8 text-slate-500 text-sm">如需账号或重置密码，请联系管理员</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { login, getCurrentUser } from '../../api.js'

const emit = defineEmits(['login-success'])

const authLoading = ref(false)
const authError = ref('')
const authForm = ref({
  username: '',
  password: ''
})

async function handleAuth() {
  authError.value = ''
  authLoading.value = true
  
  try {
    await login(authForm.value.username, authForm.value.password)
    const user = await getCurrentUser()
    emit('login-success', user.username)
  } catch (e) {
    const status = e.response?.status
    const detail = e.response?.data?.detail
    if (detail && typeof detail === 'string') {
      authError.value = detail
    } else if (status === 401) {
      authError.value = '用户名或密码错误'
    } else if (status === 409) {
      authError.value = '该用户名已被注册，请换一个试试'
    } else if (status === 422) {
      authError.value = '请检查输入格式（用户名至少3位，密码至少6位）'
    } else if (status === 502 || status === 503) {
      authError.value = '服务器暂时不可用，请稍后再试'
    } else if (status === 500) {
      authError.value = '服务器内部错误，请联系管理员'
    } else if (!navigator.onLine) {
      authError.value = '网络连接已断开，请检查网络'
    } else if (e.code === 'ERR_NETWORK') {
      authError.value = '无法连接到服务器，请检查网络或稍后重试'
    } else {
      authError.value = '操作失败，请稍后重试'
    }
  } finally {
    authLoading.value = false
  }
}


</script>
