import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const routerSource = readFileSync(new URL('../src/router.js', import.meta.url), 'utf8')
const sidebarSource = readFileSync(new URL('../src/components/layout/AppSidebar.vue', import.meta.url), 'utf8')
const mainAppSource = readFileSync(new URL('../src/MainApp.vue', import.meta.url), 'utf8')
const apiSource = readFileSync(new URL('../src/api.js', import.meta.url), 'utf8')
const adminPageSource = readFileSync(new URL('../src/AdminUsersPage.vue', import.meta.url), 'utf8')
const authPageSource = readFileSync(new URL('../src/components/layout/AuthPage.vue', import.meta.url), 'utf8')

test('admin user management page is routed and hidden from non-admin sidebar', () => {
  assert.match(routerSource, /AdminUsersPage/)
  assert.match(routerSource, /name:\s*'admin_users'/)
  assert.match(sidebarSource, /canManageUsers/)
  assert.match(sidebarSource, /人员管理/)
  assert.match(mainAppSource, /:can-manage-users="canManageUsers"/)
})

test('frontend api exposes admin user list and role update endpoints', () => {
  assert.match(apiSource, /getAdminUsers/)
  assert.match(apiSource, /setAdminUserRole/)
  assert.match(apiSource, /\/admin\/users/)
  assert.match(apiSource, /\/admin\/users\/\$\{userId\}\/admin/)
})

test('public registration is removed from the login experience', () => {
  assert.doesNotMatch(apiSource, /export async function register/)
  assert.doesNotMatch(authPageSource, /立即注册|注册新账号|isLoginMode|register/)
  assert.match(authPageSource, /await login/)
})

test('frontend api exposes the complete basic user lifecycle', () => {
  assert.match(apiSource, /getAdminUsers\(params/)
  assert.match(apiSource, /createAdminUser/)
  assert.match(apiSource, /setAdminUserStatus/)
  assert.match(apiSource, /resetAdminUserPassword/)
  assert.match(apiSource, /\/admin\/users\/\$\{userId\}\/status/)
  assert.match(apiSource, /\/admin\/users\/\$\{userId\}\/password/)
})

test('personnel management supports server filters pagination and row actions', () => {
  assert.match(adminPageSource, /keyword/)
  assert.match(adminPageSource, /roleFilter/)
  assert.match(adminPageSource, /statusFilter/)
  assert.match(adminPageSource, /pageSize/)
  assert.match(adminPageSource, /createAdminUser/)
  assert.match(adminPageSource, /resetAdminUserPassword/)
  assert.match(adminPageSource, /setAdminUserStatus/)
  assert.match(adminPageSource, /当前用户/)
  assert.match(adminPageSource, /更多/)
})

test('create user dialog preserves input on overlay clicks and escape', () => {
  assert.match(adminPageSource, /createDialogOpen/)
  assert.match(adminPageSource, /确认密码/)
  assert.match(adminPageSource, /closeCreateDialog/)
  assert.doesNotMatch(adminPageSource, /@click\.self="closeCreateDialog"/)
  assert.doesNotMatch(adminPageSource, /@keyup\.esc="closeCreateDialog"/)
})
