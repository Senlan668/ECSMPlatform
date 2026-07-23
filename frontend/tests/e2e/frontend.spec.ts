import { expect, test, type Page } from '@playwright/test'

async function signIn(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '商媒智营' })).toBeVisible()
  await page.getByLabel('账号').fill('admin')
  await page.getByLabel('密码').fill('123')
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL('/')
}

test('登录后展示八个项目并可进入项目工作区', async ({ page }) => {
  await signIn(page)

  await expect(page.getByRole('heading', { name: '平台架构总览' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '项目导航' })).toBeVisible()
  await expect(page.getByLabel('项目导航').getByRole('button', { name: '模型与服务' })).toBeVisible()
  await page.locator('section[aria-label="平台项目列表"]').getByRole('button', { name: /内容与营销运营/ }).click()
  await expect(page).toHaveURL('/projects/content-operations')
  await expect(page.getByRole('heading', { name: '内容与营销运营' })).toBeVisible()
})

test('八个项目入口均受登录保护且可访问', async ({ page }) => {
  await page.goto('/projects/identity-access')
  await expect(page).toHaveURL('/login')
  await signIn(page)

  const projectIds = ['identity-access', 'channel-integration', 'commerce-core', 'content-assets', 'content-operations', 'customer-service', 'analytics', 'ai-governance']
  for (const id of projectIds) {
    await page.goto(`/projects/${id}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  }
})

test('用户菜单提供租户切换，模型服务中心可从项目导航进入', async ({ page, isMobile }) => {
  await signIn(page)
  if (isMobile) await page.getByRole('button', { name: '打开侧边栏' }).click()
  await page.getByRole('button', { name: '打开用户菜单' }).click()
  await expect(page.getByRole('menu', { name: '用户菜单' })).toBeVisible()
  await page.getByRole('button', { name: /森蓝内容矩阵/ }).click()
  await expect(page.getByText('森蓝内容矩阵', { exact: true }).last()).toBeVisible()

  await page.getByLabel('项目导航').getByRole('button', { name: '模型与服务' }).click()
  await expect(page).toHaveURL('/projects/ai-governance')
  await expect(page.getByRole('heading', { name: 'AI 模型与服务中心' })).toBeVisible()

  await page.getByRole('button', { name: '添加模型' }).click()
  await page.getByLabel('模型名称').fill('内容生成模型')
  await page.getByLabel('供应商').fill('OpenAI')
  await page.getByLabel('模型标识').fill('gpt-5')
  await page.getByRole('button', { name: '保存模型' }).click()
  await expect(page.getByText('内容生成模型', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '启动 内容生成模型' }).click()
  await expect(page.getByText('已启动', { exact: true })).toBeVisible()

  await page.getByRole('tab', { name: 'API Key' }).click()
  await page.getByRole('button', { name: '创建 API Key' }).click()
  await page.getByLabel('密钥名称').fill('内容服务')
  await page.getByRole('button', { name: '保存 API Key' }).click()
  await expect(page.getByRole('dialog', { name: '保存 API Key' })).toBeVisible()
})

test('注册创建独立租户并自动进入平台', async ({ page, isMobile }) => {
  await page.goto('/register')
  await page.getByLabel('租户名称').fill('新品牌矩阵')
  await page.getByLabel('账号').fill('newoperator')
  await page.getByLabel('密码').fill('new-password')
  await page.getByRole('button', { name: '创建租户' }).click()
  await expect(page).toHaveURL('/')
  if (isMobile) await page.getByRole('button', { name: '打开侧边栏' }).click()
  await page.getByRole('button', { name: '打开用户菜单' }).click()
  await expect(page.getByRole('menu', { name: '用户菜单' }).getByRole('button', { name: /新品牌矩阵/ })).toBeVisible()
})
