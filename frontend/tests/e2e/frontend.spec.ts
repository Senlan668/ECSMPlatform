import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { unzipSync } from 'fflate'

async function signIn(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '商媒智营' })).toBeVisible()
  await page.getByLabel('账号').fill('admin')
  await page.getByLabel('密码').fill('123')
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL('/')
}

async function createBrowserTestVideo(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 180
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas unavailable')
    context.fillStyle = '#202020'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#ffffff'
    context.font = '24px sans-serif'
    context.fillText('AI media test', 60, 95)

    const audioContext = new AudioContext()
    await audioContext.resume()
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    const destination = audioContext.createMediaStreamDestination()
    gain.gain.value = 0.08
    oscillator.frequency.value = 440
    oscillator.connect(gain).connect(destination)

    const canvasStream = canvas.captureStream(12)
    const canvasTrack = canvasStream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack
    const stream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ])
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : 'video/webm'
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 250_000 })
    const chunks: Blob[] = []
    recorder.ondataavailable = event => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    const stopped = new Promise<void>(resolve => { recorder.onstop = () => resolve() })

    let frame = 0
    const timer = window.setInterval(() => {
      context.fillStyle = frame % 2 === 0 ? '#202020' : '#f4f4f4'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = frame % 2 === 0 ? '#ffffff' : '#202020'
      context.font = '24px sans-serif'
      context.fillText(`AI media test ${frame}`, 35, 95)
      canvasTrack.requestFrame?.()
      frame += 1
    }, 80)
    recorder.start(200)
    oscillator.start()
    await new Promise(resolve => window.setTimeout(resolve, 2200))
    recorder.requestData()
    await new Promise(resolve => window.setTimeout(resolve, 300))
    recorder.stop()
    oscillator.stop()
    window.clearInterval(timer)
    await stopped
    stream.getTracks().forEach(track => track.stop())
    await audioContext.close()

    const bytes = new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer())
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
    }
    return btoa(binary)
  })
  return Buffer.from(base64, 'base64')
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

test('用户菜单提供租户切换，模型服务中心可从项目导航进入', async ({ page, isMobile }, testInfo) => {
  const uniqueSuffix = `${testInfo.project.name}-${Date.now()}`
  const modelName = `内容生成模型-${uniqueSuffix}`
  const keyName = `内容服务-${uniqueSuffix}`
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
  await page.getByLabel('模型名称').fill(modelName)
  await page.getByLabel('供应商').fill('OpenAI')
  await page.getByLabel('模型标识').fill('gpt-5')
  await page.getByRole('button', { name: '保存模型' }).click()
  const modelRow = page.locator('section[aria-label="模型列表"] > div').last().locator('> div').filter({ hasText: modelName })
  await expect(modelRow.getByText(modelName, { exact: true })).toBeVisible()
  await modelRow.getByRole('button', { name: `启动 ${modelName}` }).click()
  await expect(modelRow.getByText('已启动', { exact: true })).toBeVisible()

  await page.getByRole('tab', { name: 'API Key' }).click()
  await page.getByRole('button', { name: '创建 API Key' }).click()
  await page.getByLabel('密钥名称').fill(keyName)
  await page.getByRole('button', { name: '保存 API Key' }).click()
  await expect(page.getByRole('dialog', { name: '保存 API Key' })).toBeVisible()
})

test('注册创建独立租户并自动进入平台', async ({ page, isMobile }, testInfo) => {
  const username = `operator-${testInfo.project.name}-${Date.now()}`
  await page.goto('/register')
  await page.getByLabel('租户名称').fill('新品牌矩阵')
  await page.getByLabel('账号').fill(username)
  await page.getByLabel('密码').fill('new-password')
  await page.getByRole('button', { name: '创建租户' }).click()
  await expect(page).toHaveURL('/')
  if (isMobile) await page.getByRole('button', { name: '打开侧边栏' }).click()
  await page.getByRole('button', { name: '打开用户菜单' }).click()
  await expect(page.getByRole('menu', { name: '用户菜单' }).getByRole('button', { name: /新品牌矩阵/ })).toBeVisible()
})

test('直播切片可在浏览器真实提取音频并导出 ZIP', async ({ page, isMobile }) => {
  test.setTimeout(180_000)
  test.skip(isMobile, 'FFmpeg 运行能力在 desktop 项目验收，移动端只验收响应式页面')
  await signIn(page)
  await page.goto('/projects/content-assets')
  await page.getByRole('tab', { name: '直播切片' }).click()
  const fileName = `browser-media-${Date.now()}.webm`
  const video = await createBrowserTestVideo(page)
  expect(video.byteLength).toBeGreaterThan(1000)
  await page.getByLabel('选择本地视频').setInputFiles({
    name: fileName,
    mimeType: 'video/webm',
    buffer: video,
  })
  await page.getByRole('button', { name: '登记源视频' }).click()
  const taskRow = page.locator('article').filter({ hasText: fileName })
  await expect(taskRow.getByText(fileName, { exact: true })).toBeVisible()

  await page.getByRole('button', { name: `提取 ${fileName} 音频` }).click()
  await expect(taskRow.getByText('音频已就绪', { exact: true })).toBeVisible({ timeout: 120_000 })

  await page.getByRole('button', { name: `为 ${fileName} 添加片段` }).click()
  await page.getByLabel('片段标题').fill('浏览器真实切片')
  await page.getByLabel('片段开始时间').fill('00:00')
  await page.getByLabel('片段结束时间').fill('00:01')
  await page.getByRole('button', { name: '保存片段' }).click()
  await expect(taskRow.getByText('浏览器真实切片', { exact: true })).toBeVisible()

  const downloadPromise = page.waitForEvent('download', { timeout: 120_000 })
  await page.getByRole('button', { name: `导出 ${fileName} 切片` }).click()
  const download = await Promise.race([
    downloadPromise,
    page.getByRole('alert').waitFor({ state: 'visible', timeout: 120_000 }).then(async () => {
      throw new Error(await page.getByRole('alert').innerText())
    }),
  ])
  expect(download.suggestedFilename()).toBe(`${fileName.replace(/\.webm$/, '')}_AI切片.zip`)
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()
  const archive = unzipSync(await readFile(downloadPath!))
  const entries = Object.entries(archive)
  expect(entries).toHaveLength(1)
  expect(entries[0][0]).toMatch(/01_浏览器真实切片\.mp4$/)
  expect(entries[0][1].byteLength).toBeGreaterThan(1000)
})

test('内容运营可完成简报、选题、草稿和人工审核闭环', async ({ page }, testInfo) => {
  const briefTitle = `通勤背包首发-${testInfo.project.name}-${Date.now()}`
  await signIn(page)
  await page.goto('/projects/content-operations')
  await page.getByRole('button', { name: '创建运营简报' }).click()
  await page.getByLabel('简报名称').fill(briefTitle)
  await page.getByLabel('商品或主题').fill('轻量通勤背包')
  await page.getByRole('button', { name: '保存并进入工作流' }).click()
  await page.getByRole('button', { name: '生成演示选题' }).click()
  await page.getByRole('button', { name: /购买前最值得确认/ }).click()
  await page.getByRole('button', { name: '生成演示草稿' }).click()
  await expect(page.getByText('内容版本 v1', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '审核通过' }).click()
  await expect(page.getByText('内容版本已通过', { exact: true })).toBeVisible()

  await page.getByRole('tab', { name: '运营日历' }).click()
  await page.getByLabel('已审核内容').selectOption({ label: briefTitle })
  await page.getByRole('button', { name: '加入日历' }).click()
  await expect(page.getByRole('button', { name: `准备 ${briefTitle}` })).toBeVisible()
})

test('客服在 AI 依赖缺失时明确降级到人工接管', async ({ page }) => {
  await signIn(page)
  await page.goto('/projects/customer-service')
  await page.getByRole('button', { name: '新建会话' }).click()
  await page.getByLabel('模拟客户消息').fill('这个商品支持七天无理由吗？')
  await page.getByRole('button', { name: '发送客户消息' }).click()
  await expect(page.getByText(/自动回答未执行/)).toBeVisible()
  await expect(page.getByText('人工接管', { exact: true }).first()).toBeVisible()
  await page.getByRole('textbox', { name: '人工回复', exact: true }).fill('我先为您核对商品与订单规则。')
  await page.getByRole('button', { name: '发送人工回复' }).click()
  await expect(page.getByText('我先为您核对商品与订单规则。', { exact: true })).toBeVisible()
})

test('销售知识八个工作台可访问且保持响应式布局', async ({ page }, testInfo) => {
  await signIn(page)
  await page.goto('/projects/customer-service')
  await page.getByRole('tab', { name: '销售知识' }).click()
  await expect(page.getByTestId('sales-knowledge-workspace')).toBeVisible()
  await expect(page.getByRole('heading', { name: '微信数据导入' })).toBeVisible()

  const views = [
    ['清洗审核', '会话清洗'],
    ['知识问答', '知识索引'],
    ['素材库', '素材入库'],
    ['学员档案', '学员档案'],
    ['训练语料', '自定义训练语料'],
    ['销售测评', 'AI 出题'],
    ['数据导出', '训练数据导出'],
  ] as const
  for (const [tab, heading] of views) {
    await page.getByRole('tab', { name: tab, exact: true }).click()
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible()
  }

  const hasGlobalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  expect(hasGlobalOverflow).toBe(false)
  await page.screenshot({ path: testInfo.outputPath('sales-knowledge.png'), fullPage: false })
})

test('销售知识数据库从浏览器经 Java 网关导入 Python 运行时', async ({ page, isMobile }) => {
  test.skip(isMobile, 'multipart 运行链路在 desktop 验收，移动端已覆盖响应式工作台')
  const fixtureRoot = resolve(process.cwd(), '..', '.runtime', 'sales-knowledge-e2e')
  const contactsPath = resolve(fixtureRoot, 'MicroMsg.db')
  const messagesPath = resolve(fixtureRoot, 'MSG0.db')
  test.skip(!existsSync(contactsPath) || !existsSync(messagesPath), '需要本地合成微信 SQLite 验收夹具')

  const runtimeRequests: string[] = []
  page.on('request', request => {
    if (request.url().includes(':8102')) runtimeRequests.push(request.url())
  })
  await signIn(page)
  await page.goto('/projects/customer-service')
  await page.getByRole('tab', { name: '销售知识' }).click()
  await page.locator('#wechat-databases').setInputFiles([contactsPath, messagesPath])
  await page.getByRole('button', { name: '开始导入' }).click()
  await expect(page.getByText(/微信数据库导入完成/)).toBeVisible({ timeout: 60_000 })
  expect(runtimeRequests).toEqual([])
})

test('实时语音先登记授权并在云配置缺失时明确失败', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'RTC 麦克风与云运行时链路在 desktop 项目验收')
  await context.grantPermissions(['microphone'], { origin: 'http://localhost:5173' })
  await signIn(page)
  await page.goto('/projects/customer-service')
  await page.getByRole('tab', { name: '实时语音' }).click()
  await page.getByRole('button', { name: '新建语音会话' }).click()

  const dialog = page.getByRole('dialog', { name: '开始实时语音' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '确认并接入' })).toBeDisabled()
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: '确认并接入' }).click()

  await expect(page.getByRole('alert')).toContainText(/RTC 凭证签发失败|Voice runtime is not configured/, { timeout: 30_000 })
  await expect(page.getByText('运行失败', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('授权已登记', { exact: true })).toBeVisible()
})

test('模型服务中心可管理 Prompt 与 MCP 工具元数据', async ({ page }, testInfo) => {
  const uniqueSuffix = `${testInfo.project.name}-${Date.now()}`
  const promptName = `客服受控问答-${uniqueSuffix}`
  const toolName = `内部订单只读工具-${uniqueSuffix}`
  await signIn(page)
  await page.goto('/projects/ai-governance')
  await page.getByRole('tab', { name: 'Prompt' }).click()
  await page.getByRole('button', { name: '创建 Prompt' }).click()
  await page.getByLabel('Prompt 名称').fill(promptName)
  await page.getByLabel('Prompt 模板').fill('请仅基于 {{evidence}} 回答 {{question}}')
  await page.getByRole('button', { name: '保存 Prompt' }).click()
  const promptRow = page.locator('section[aria-label="Prompt 版本列表"] > div').last().locator('> div').filter({ hasText: promptName })
  await expect(promptRow.getByText(promptName, { exact: true })).toBeVisible()
  await promptRow.getByRole('button', { name: `启用 ${promptName}` }).click()
  await expect(promptRow.getByText('已启用', { exact: true })).toBeVisible()

  await page.getByRole('tab', { name: '工具服务' }).click()
  await page.getByRole('button', { name: '添加工具服务' }).click()
  await page.getByLabel('工具服务名称').fill(toolName)
  await page.getByLabel('工具服务端点').fill('http://orders.internal/api')
  await page.getByRole('button', { name: '保存工具服务' }).click()
  await expect(page.getByText(toolName, { exact: true })).toBeVisible()
})
