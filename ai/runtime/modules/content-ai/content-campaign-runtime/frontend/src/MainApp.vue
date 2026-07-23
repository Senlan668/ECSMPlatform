<template>
  <!-- 登录/注册页面 -->
  <AuthPage 
    v-if="!isLoggedIn" 
    @login-success="onLoginSuccess" 
  />

  <!-- 主应用布局 (Stitch Framework) -->
  <div v-else class="bg-slate-50 text-slate-900 flex h-screen overflow-hidden w-full">
    <!-- 左侧侧边栏 -->
    <AppSidebar
      v-model="sidebarOpen"
      :activePage="activePage"
      :can-manage-users="canManageUsers"
      :loading="loadingThreads"
      :threadList="threadList"
      :currentThreadId="currentThreadId"
      @update:activePage="handleNavigate"
      @new-workflow="handleNewWorkflow"
      @switch-thread="handleSwitchThread"
      @delete-thread="handleDeleteThread"
      @refresh-list="fetchThreadList"
    />

    <!-- 右侧主内容区域 -->
    <main class="flex-1 flex flex-col min-w-0 overflow-hidden relative">
      <!-- 头部导航 -->
      <AppHeader 
        :currentUsername="currentUsername"
        @logout="handleLogout"
        @open-search="isSearchOpen = true"
      />

      <!-- Dashboard 容器 -->
      <div class="flex-1 min-h-0 overflow-y-auto p-0 scroll-smooth">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component 
              :is="Component"
              ref="workflowRef"
              @new-workflow="handleNewWorkflow"
              @refresh-threads="fetchThreadList"
              @thread-changed="onThreadChanged"
              @start-workflow="handleStartWorkflowFromCalendar"
              @navigate="handleNavigate"
              @logout="handleLogout"
              @profile-updated="handleProfileUpdated"
            />
          </transition>
        </router-view>
      </div>
    </main>

    <!-- 全局搜索弹窗 -->
    <SearchModal 
      :is-open="isSearchOpen"
      @close="isSearchOpen = false"
      @switch-thread="handleSwitchThread"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

// 导入页面组件 (注意：由于使用了嵌套路由，这里不再需要直接引入所有页面组件，除非是用于 ref 的类型定义，但 JS 中不需要)
import AuthPage from './components/layout/AuthPage.vue'
import AppSidebar from './components/layout/AppSidebar.vue'
import AppHeader from './components/layout/AppHeader.vue'
import SearchModal from './components/common/SearchModal.vue'

import {
  logout,
  isLoggedIn as checkLoggedIn,
  getCurrentUser,
  getAllThreads,
  deleteThread
} from './api.js'

const route = useRoute()
const router = useRouter()

// ============== 页面导航 (基于路由) ==============
const activePage = computed(() => {
  return route.name || 'workflow'
})

const workflowRef = ref(null)

function handleNavigate(pageName) {
  router.push({ name: pageName })
}

// ============== 认证状态 ==============
const isLoggedIn = ref(false)
const currentUsername = ref('')
const currentUser = ref(null)
const canManageUsers = computed(() => Boolean(currentUser.value?.is_admin))

function handleProfileUpdated(newProfile) {
  if (newProfile && newProfile.nickname) {
    currentUsername.value = newProfile.nickname
  }
}

// 检查登录状态
async function checkAuth() {
  if (checkLoggedIn()) {
    try {
      const user = await getCurrentUser()
      currentUser.value = user
      currentUsername.value = user.username
      isLoggedIn.value = true
    } catch (e) {
      currentUser.value = null
      isLoggedIn.value = false
    }
  }
}

function onLoginSuccess(username) {
  currentUsername.value = username
  isLoggedIn.value = true
  checkAuth()
}

// 登出
function handleLogout() {
  logout()
  isLoggedIn.value = false
  currentUsername.value = ''
  currentUser.value = null
  threadList.value = []
  if (workflowRef.value && workflowRef.value.resetWorkflow) {
    workflowRef.value.resetWorkflow()
  }
}

// 监听 401 事件
function onAuthLogout() {
  isLoggedIn.value = false
  currentUsername.value = ''
}

onMounted(() => {
  checkAuth()
  window.addEventListener('auth:logout', onAuthLogout)
  document.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('auth:logout', onAuthLogout)
  document.removeEventListener('keydown', handleGlobalKeydown)
})

// ============== 侧边栏与工作流状态 ==============
const sidebarOpen = ref(true)
const loadingThreads = ref(false)
const threadList = ref([])
const currentThreadId = ref('')
const isSearchOpen = ref(false)

// 全局 ⌘K 快捷键
function handleGlobalKeydown(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    isSearchOpen.value = !isSearchOpen.value
  }
}

// 登录后获取历史记录
watch(isLoggedIn, (newVal) => {
  if (newVal) {
    fetchThreadList()
  }
})

// 获取历史记录列表
async function fetchThreadList() {
  loadingThreads.value = true
  try {
    const result = await getAllThreads()
    threadList.value = result.threads || []
  } catch (error) {
    console.error('获取历史记录失败:', error)
  } finally {
    loadingThreads.value = false
  }
}

// 工作流组件事件处理
function handleNewWorkflow() {
  currentThreadId.value = ''
  if (workflowRef.value && workflowRef.value.resetWorkflow) {
    workflowRef.value.resetWorkflow()
  }
}

function onThreadChanged(threadId) {
  currentThreadId.value = threadId
}

function handleSwitchThread(targetThreadId) {
  if (targetThreadId === currentThreadId.value) return
  
  // 切换到工作流路由
  router.push({ name: 'workflow' })
  currentThreadId.value = targetThreadId
  
  // 延迟一下等待 workflow 组件可能被挂载
  setTimeout(() => {
    if (workflowRef.value && workflowRef.value.switchThread) {
      workflowRef.value.switchThread(targetThreadId)
    }
  }, 100)
}

async function handleDeleteThread(targetThreadId) {
  if (!confirm('确定要删除这条历史记录吗？')) return
  
  try {
    await deleteThread(targetThreadId)
    
    // 如果删除的是当前工作流，重置状态
    if (targetThreadId === currentThreadId.value) {
      handleNewWorkflow()
    }
    
    // 刷新列表
    await fetchThreadList()
  } catch (error) {
    alert(`删除失败: ${error.response?.data?.detail || error.message}`)
  }
}

// 接收来自日历的自动排期发文请求
function handleStartWorkflowFromCalendar(params) {
  // 切换到工作流页面
  router.push({ name: 'workflow' })
  currentThreadId.value = ''
  
  // 延迟保证 WorkflowPage 已挂载
  setTimeout(() => {
    if (workflowRef.value && workflowRef.value.startWithParams) {
      workflowRef.value.startWithParams(params)
    }
  }, 100)
}
</script>
