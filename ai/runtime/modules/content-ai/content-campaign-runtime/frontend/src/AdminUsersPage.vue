<template>
  <div class="min-h-full bg-slate-50/50 px-5 py-6 md:px-8 md:py-8">
    <div class="mx-auto max-w-7xl space-y-5">
      <header class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">人员管理</h1>
          <p class="mt-1 text-sm text-slate-500">创建账号并管理用户的角色与可用状态</p>
        </div>
        <button
          class="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          @click="openCreateDialog"
        >
          + 新增用户
        </button>
      </header>

      <form class="flex flex-wrap items-center gap-3" @submit.prevent="submitSearch">
        <div class="relative min-w-[240px] flex-1 md:max-w-sm">
          <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
          <input
            v-model="keywordInput"
            class="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            placeholder="搜索用户名"
          />
        </div>
        <select v-model="roleFilter" class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-500">
          <option value="all">全部角色</option>
          <option value="admin">管理员</option>
          <option value="user">普通用户</option>
        </select>
        <select v-model="statusFilter" class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-500">
          <option value="all">全部状态</option>
          <option value="active">正常</option>
          <option value="inactive">已停用</option>
        </select>
        <button class="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="submit">搜索</button>
        <button
          type="button"
          title="刷新列表"
          class="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-blue-600"
          :disabled="loading"
          @click="loadUsers"
        >
          ↻
        </button>
      </form>

      <div v-if="errorMessage" class="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <span>{{ errorMessage }}</span>
        <button class="font-semibold hover:underline" @click="loadUsers">重试</button>
      </div>

      <section class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full min-w-[820px] border-collapse text-left">
            <thead class="bg-slate-50 text-xs font-semibold text-slate-500">
              <tr>
                <th class="px-5 py-3">用户</th>
                <th class="px-5 py-3">角色</th>
                <th class="px-5 py-3">状态</th>
                <th class="px-5 py-3">创建时间</th>
                <th class="px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-sm">
              <tr v-if="loading && users.length === 0">
                <td colspan="5" class="px-5 py-16 text-center text-slate-400">正在加载用户...</td>
              </tr>
              <tr v-else-if="users.length === 0">
                <td colspan="5" class="px-5 py-16 text-center text-slate-400">没有符合条件的用户</td>
              </tr>
              <tr v-for="user in users" v-else :key="user.id" class="hover:bg-slate-50/70">
                <td class="px-5 py-4">
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-slate-800">{{ user.username }}</span>
                    <span v-if="user.id === currentUserId" class="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-600">当前用户</span>
                  </div>
                  <div v-if="user.nickname" class="mt-1 text-xs text-slate-400">{{ user.nickname }}</div>
                </td>
                <td class="px-5 py-4">
                  <span class="rounded-md px-2 py-1 text-xs font-medium" :class="user.is_admin ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'">
                    {{ user.is_admin ? '管理员' : '普通用户' }}
                  </span>
                </td>
                <td class="px-5 py-4">
                  <span class="inline-flex items-center gap-1.5 text-xs font-medium" :class="user.is_active ? 'text-emerald-700' : 'text-slate-500'">
                    <span class="h-1.5 w-1.5 rounded-full" :class="user.is_active ? 'bg-emerald-500' : 'bg-slate-400'"></span>
                    {{ user.is_active ? '正常' : '已停用' }}
                  </span>
                </td>
                <td class="px-5 py-4 text-slate-500">{{ formatDate(user.created_at) }}</td>
                <td class="relative px-5 py-4 text-right">
                  <button
                    class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    :disabled="updatingId === user.id"
                    @click="toggleActionMenu(user.id)"
                    @blur="closeActionMenuLater"
                  >
                    {{ updatingId === user.id ? '处理中' : '更多' }}
                  </button>
                  <div v-if="actionMenuId === user.id" class="absolute right-5 top-12 z-20 w-36 rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg">
                    <button class="block w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" @mousedown.prevent="openPasswordDialog(user)">重置密码</button>
                    <button
                      class="block w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                      :disabled="user.id === currentUserId && user.is_admin"
                      @mousedown.prevent="openConfirm('role', user)"
                    >
                      {{ user.is_admin ? '取消管理员' : '设为管理员' }}
                    </button>
                    <button
                      class="block w-full px-3 py-2 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                      :class="user.is_active ? 'text-red-600' : 'text-emerald-700'"
                      :disabled="user.id === currentUserId && user.is_active"
                      @mousedown.prevent="openConfirm('status', user)"
                    >
                      {{ user.is_active ? '停用账号' : '启用账号' }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
          <div class="flex items-center gap-2">
            <span>共 {{ total }} 人</span>
            <select v-model.number="pageSize" class="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs">
              <option :value="20">20 条/页</option>
              <option :value="50">50 条/页</option>
              <option :value="100">100 条/页</option>
            </select>
          </div>
          <div class="flex items-center gap-2">
            <button class="rounded-md border border-slate-200 px-3 py-1.5 disabled:opacity-40" :disabled="page <= 1 || loading" @click="changePage(page - 1)">上一页</button>
            <span>第 {{ page }} / {{ totalPages || 1 }} 页</span>
            <button class="rounded-md border border-slate-200 px-3 py-1.5 disabled:opacity-40" :disabled="page >= totalPages || loading" @click="changePage(page + 1)">下一页</button>
          </div>
        </footer>
      </section>
    </div>

    <Transition name="fade">
      <div v-if="successMessage" class="fixed right-6 top-6 z-[2100] rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 shadow-lg">
        {{ successMessage }}
      </div>
    </Transition>

    <!-- 新增用户：遮罩和 Esc 均不绑定关闭事件 -->
    <div v-if="createDialogOpen" class="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-900/45 backdrop-blur-sm"></div>
      <form class="relative w-full max-w-lg rounded-lg bg-white shadow-2xl" @submit.prevent="submitCreateUser">
        <div class="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 class="text-lg font-bold text-slate-900">新增用户</h2>
          <button type="button" title="关闭" class="text-xl text-slate-400 hover:text-slate-700" @click="closeCreateDialog">×</button>
        </div>
        <div class="space-y-4 px-6 py-5">
          <label class="block text-sm font-medium text-slate-700">
            用户名
            <input v-model.trim="createForm.username" class="mt-2 w-full rounded-lg border px-3 py-2.5 outline-none focus:border-blue-500" :class="createErrors.username ? 'border-red-400' : 'border-slate-200'" minlength="3" maxlength="50" required />
            <span v-if="createErrors.username" class="mt-1 block text-xs text-red-600">{{ createErrors.username }}</span>
          </label>
          <label class="block text-sm font-medium text-slate-700">
            初始密码
            <input v-model="createForm.password" type="password" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-blue-500" minlength="6" maxlength="100" required />
          </label>
          <label class="block text-sm font-medium text-slate-700">
            确认密码
            <input v-model="createForm.confirmPassword" type="password" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-blue-500" minlength="6" maxlength="100" required />
          </label>
          <label class="flex items-center gap-2 text-sm text-slate-700">
            <input v-model="createForm.isAdmin" type="checkbox" class="h-4 w-4 accent-blue-600" />
            设为管理员
          </label>
          <p v-if="createErrors.form" class="text-sm text-red-600">{{ createErrors.form }}</p>
        </div>
        <div class="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button type="button" class="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200" @click="closeCreateDialog">取消</button>
          <button type="submit" class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50" :disabled="dialogSubmitting">{{ dialogSubmitting ? '创建中...' : '创建账号' }}</button>
        </div>
      </form>
    </div>

    <div v-if="passwordDialogOpen" class="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-900/45 backdrop-blur-sm"></div>
      <form class="relative w-full max-w-md rounded-lg bg-white shadow-2xl" @submit.prevent="submitPasswordReset">
        <div class="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 class="text-lg font-bold text-slate-900">重置 {{ selectedUser?.username }} 的密码</h2>
          <button type="button" title="关闭" class="text-xl text-slate-400 hover:text-slate-700" @click="closePasswordDialog">×</button>
        </div>
        <div class="space-y-4 px-6 py-5">
          <input v-model="passwordForm.password" type="password" placeholder="新密码（6 至 100 位）" class="w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-blue-500" required minlength="6" maxlength="100" />
          <input v-model="passwordForm.confirmPassword" type="password" placeholder="确认新密码" class="w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-blue-500" required minlength="6" maxlength="100" />
          <p v-if="passwordError" class="text-sm text-red-600">{{ passwordError }}</p>
        </div>
        <div class="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button type="button" class="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200" @click="closePasswordDialog">取消</button>
          <button type="submit" class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" :disabled="dialogSubmitting">确认重置</button>
        </div>
      </form>
    </div>

    <div v-if="confirmDialogOpen" class="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-900/45 backdrop-blur-sm"></div>
      <div class="relative w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
        <h2 class="text-lg font-bold text-slate-900">{{ confirmTitle }}</h2>
        <p class="mt-3 text-sm leading-6 text-slate-600">{{ confirmMessage }}</p>
        <p v-if="confirmError" class="mt-3 text-sm text-red-600">{{ confirmError }}</p>
        <div class="mt-6 flex justify-end gap-3">
          <button class="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100" @click="closeConfirmDialog">取消</button>
          <button class="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" :class="confirmAction?.type === 'status' && confirmAction.user.is_active ? 'bg-red-600' : 'bg-blue-600'" :disabled="dialogSubmitting" @click="submitConfirmedAction">确认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import {
  createAdminUser,
  getAdminUsers,
  getCurrentUser,
  resetAdminUserPassword,
  setAdminUserRole,
  setAdminUserStatus,
} from './api.js'

const users = ref([])
const loading = ref(false)
const updatingId = ref('')
const errorMessage = ref('')
const successMessage = ref('')
const currentUserId = ref('')
const keywordInput = ref('')
const keyword = ref('')
const roleFilter = ref('all')
const statusFilter = ref('all')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const totalPages = ref(0)
const actionMenuId = ref('')
const createDialogOpen = ref(false)
const passwordDialogOpen = ref(false)
const confirmDialogOpen = ref(false)
const dialogSubmitting = ref(false)
const selectedUser = ref(null)
const confirmAction = ref(null)
const confirmError = ref('')
const passwordError = ref('')

const createForm = ref({ username: '', password: '', confirmPassword: '', isAdmin: false })
const createErrors = ref({ username: '', form: '' })
const passwordForm = ref({ password: '', confirmPassword: '' })

const confirmTitle = computed(() => {
  if (!confirmAction.value) return ''
  if (confirmAction.value.type === 'role') return confirmAction.value.user.is_admin ? '取消管理员权限' : '授予管理员权限'
  return confirmAction.value.user.is_active ? '停用账号' : '启用账号'
})

const confirmMessage = computed(() => {
  if (!confirmAction.value) return ''
  const user = confirmAction.value.user
  if (confirmAction.value.type === 'role') {
    return user.is_admin
      ? `取消 ${user.username} 的管理员权限后，该用户将不能访问系统管理功能。`
      : `确认将 ${user.username} 设为管理员？该用户将获得全站管理能力。`
  }
  return user.is_active
    ? `停用 ${user.username} 后，该用户将无法登录或调用受保护接口，已有数据不会删除。`
    : `确认重新启用 ${user.username} 的账号？`
})

onMounted(async () => {
  try {
    currentUserId.value = (await getCurrentUser()).id
  } catch (error) {
    console.error('获取当前用户失败:', error)
  }
  await loadUsers()
})

watch([roleFilter, statusFilter, pageSize], () => {
  page.value = 1
  loadUsers()
})

async function loadUsers() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await getAdminUsers({
      keyword: keyword.value,
      role: roleFilter.value,
      status: statusFilter.value,
      page: page.value,
      page_size: pageSize.value,
    })
    users.value = result.items || []
    total.value = result.total || 0
    totalPages.value = result.total_pages || 0
  } catch (error) {
    errorMessage.value = getErrorMessage(error, '加载用户失败')
  } finally {
    loading.value = false
  }
}

function submitSearch() {
  keyword.value = keywordInput.value.trim()
  page.value = 1
  loadUsers()
}

function changePage(nextPage) {
  page.value = nextPage
  loadUsers()
}

function toggleActionMenu(userId) {
  actionMenuId.value = actionMenuId.value === userId ? '' : userId
}

function closeActionMenuLater() {
  setTimeout(() => { actionMenuId.value = '' }, 150)
}

function openCreateDialog() {
  createForm.value = { username: '', password: '', confirmPassword: '', isAdmin: false }
  createErrors.value = { username: '', form: '' }
  createDialogOpen.value = true
}

function closeCreateDialog() {
  if (!dialogSubmitting.value) createDialogOpen.value = false
}

async function submitCreateUser() {
  createErrors.value = { username: '', form: '' }
  if (createForm.value.password !== createForm.value.confirmPassword) {
    createErrors.value.form = '两次输入的密码不一致'
    return
  }
  dialogSubmitting.value = true
  try {
    await createAdminUser({
      username: createForm.value.username,
      password: createForm.value.password,
      is_admin: createForm.value.isAdmin,
    })
    createDialogOpen.value = false
    showSuccess('用户创建成功')
    await loadUsers()
  } catch (error) {
    const message = getErrorMessage(error, '创建用户失败')
    if (error.response?.status === 409) createErrors.value.username = message
    else createErrors.value.form = message
  } finally {
    dialogSubmitting.value = false
  }
}

function openPasswordDialog(user) {
  actionMenuId.value = ''
  selectedUser.value = user
  passwordForm.value = { password: '', confirmPassword: '' }
  passwordError.value = ''
  passwordDialogOpen.value = true
}

function closePasswordDialog() {
  if (!dialogSubmitting.value) passwordDialogOpen.value = false
}

async function submitPasswordReset() {
  passwordError.value = ''
  if (passwordForm.value.password !== passwordForm.value.confirmPassword) {
    passwordError.value = '两次输入的密码不一致'
    return
  }
  dialogSubmitting.value = true
  updatingId.value = selectedUser.value.id
  try {
    await resetAdminUserPassword(selectedUser.value.id, passwordForm.value.password)
    passwordDialogOpen.value = false
    showSuccess(`已重置 ${selectedUser.value.username} 的密码`)
  } catch (error) {
    passwordError.value = getErrorMessage(error, '重置密码失败')
  } finally {
    dialogSubmitting.value = false
    updatingId.value = ''
  }
}

function openConfirm(type, user) {
  actionMenuId.value = ''
  confirmError.value = ''
  confirmAction.value = { type, user }
  confirmDialogOpen.value = true
}

function closeConfirmDialog() {
  if (!dialogSubmitting.value) confirmDialogOpen.value = false
}

async function submitConfirmedAction() {
  const { type, user } = confirmAction.value
  dialogSubmitting.value = true
  updatingId.value = user.id
  confirmError.value = ''
  try {
    if (type === 'role') await setAdminUserRole(user.id, !user.is_admin)
    else await setAdminUserStatus(user.id, !user.is_active)
    confirmDialogOpen.value = false
    showSuccess('操作成功')
    await loadUsers()
  } catch (error) {
    confirmError.value = getErrorMessage(error, '操作失败')
  } finally {
    dialogSubmitting.value = false
    updatingId.value = ''
  }
}

function showSuccess(message) {
  successMessage.value = message
  setTimeout(() => { successMessage.value = '' }, 3000)
}

function getErrorMessage(error, fallback) {
  return error.response?.data?.detail || error.message || fallback
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
