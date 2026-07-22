import { expect, test, type Page, type Route } from '@playwright/test'

const originalSession = {
  id: 'learning-1',
  title: '测试知识',
  mode: 'topic',
  current_step: 3,
  status: 'completed',
  review_source_id: null,
  next_review: '2026-07-16T00:00:00Z',
  review_count: 0,
  created_at: '2026-07-15T00:00:00Z',
  updated_at: '2026-07-16T00:00:00Z',
}


function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}


async function mockReviewApi(page: Page) {
  let chatRound = 0
  await page.route('http://localhost:8000/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname

    if (path === '/api/review/queue-count') return json(route, { count: 1 })
    if (path === '/api/review/due') return json(route, [originalSession])
    if (path === '/api/agent/conversations') return json(route, [])
    if (path === '/api/sessions' && request.method() === 'GET') return json(route, [])
    if (path === '/api/review/sessions' && request.method() === 'POST') {
      return json(route, {
        ...originalSession,
        id: 'review-1',
        mode: 'review',
        current_step: 2,
        status: 'reviewing',
        review_source_id: originalSession.id,
      })
    }
    if (path === '/api/sessions/review-1') {
      return json(route, {
        ...originalSession,
        id: 'review-1',
        mode: 'review',
        current_step: 2,
        status: 'reviewing',
        source_material: '测试材料',
        content_type: 'concepts',
        messages: [{
          id: 'message-1',
          role: 'user',
          content: '忘记了',
          step: 2,
          content_type: 'text',
          metadata: null,
          created_at: '2026-07-16T00:00:00Z',
        }],
      })
    }
    if (path === '/api/chat' && request.method() === 'POST') {
      chatRound += 1
      const text = chatRound === 1
        ? '没关系，先看完整答案。准备好了吗？'
        : '第二轮还差一点。完整答案已经补齐，准备好后继续。'
      const eventStream = [
        `data: ${JSON.stringify({ type: 'token', text })}`,
        `data: ${JSON.stringify({
          type: 'done',
          metadata: {
            clean_text: text,
            recall_round: chatRound,
            recall_passed: false,
            session_complete: false,
            step_transition: 0,
          },
        })}`,
        '',
      ].join('\n\n')
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: eventStream,
      })
    }
    return json(route, { ok: true })
  })
}


test('复习首条输入自然衔接，并且每轮都能重新打开回忆遮挡层', async ({ page }, testInfo) => {
  await mockReviewApi(page)
  await page.goto('/review/batch')

  await expect(page.getByRole('heading', { name: '测试知识' })).toBeVisible()
  await page.getByLabel('请写出你记住的内容...').fill('忘记了')
  await page.getByLabel('请写出你记住的内容...').press('Enter')

  await expect(page).toHaveURL(/\/study\/review\/review-1$/)
  await expect(page.getByText('忘记了', { exact: true })).toBeVisible()
  await expect(page.getByText('没关系，先看完整答案。准备好了吗？')).toBeVisible()

  await page.getByLabel(/准备好了就回复/).fill('准备好了')
  await page.getByLabel(/准备好了就回复/).press('Enter')
  const firstOverlay = page.getByRole('dialog', { name: '完整复现' })
  await expect(firstOverlay).toBeVisible()

  await firstOverlay.getByLabel('回忆内容').fill('第二次回忆答案')
  await firstOverlay.getByLabel('回忆内容').press('Enter')
  await expect(page.getByText('第二轮还差一点。完整答案已经补齐，准备好后继续。')).toBeVisible()

  await page.getByLabel(/准备好了就回复/).fill('开始')
  await page.getByLabel(/准备好了就回复/).press('Enter')
  await expect(page.getByRole('dialog', { name: '完整复现' })).toBeVisible()
  await page.waitForTimeout(100)
  await page.screenshot({ path: testInfo.outputPath('review-loop.png') })
})


test('移动端侧栏以抽屉方式打开并在返回主页后关闭', async ({ page, isMobile }, testInfo) => {
  test.skip(!isMobile, '仅验证移动端布局')
  await mockReviewApi(page)
  await page.goto('/')

  await page.getByRole('button', { name: '打开侧边栏' }).click()
  await expect(page.getByLabel('主导航')).toBeInViewport()
  await page.getByRole('button', { name: '智能体平台首页' }).click()
  await expect(page.getByRole('button', { name: '打开侧边栏' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('mobile-home.png') })
})


async function mockPlatformApi(page: Page) {
  let conversations: Array<Record<string, unknown>> = []
  await page.route('http://localhost:8000/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/review/queue-count') return json(route, { count: 0 })
    if (path === '/api/sessions') return json(route, [])
    if (path === '/api/agent/conversations' && request.method() === 'GET') return json(route, conversations)
    if (path === '/api/agent/conversations' && request.method() === 'POST') {
      const body = request.postDataJSON() as { mode: 'general' | 'deep' }
      const conversation = {
        id: body.mode === 'deep' ? 'deep-1' : 'agent-1', title: '新对话', mode: body.mode,
        status: 'active', created_at: '2026-07-16T00:00:00Z', updated_at: '2026-07-16T00:00:00Z',
      }
      conversations = [conversation]
      return json(route, conversation)
    }
    if (path === '/api/agent/chat') {
      const body = request.postDataJSON() as { conversation_id: string; message: string }
      conversations = conversations.map(item => item.id === body.conversation_id ? { ...item, title: body.message } : item)
      const text = body.conversation_id === 'deep-1'
        ? '## 问题定义\n明确目标。\n\n## 建议\n采用可验证方案。'
        : '我已经接收到你的任务，并给出可执行的下一步。'
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [`data: ${JSON.stringify({ type: 'token', text })}`, `data: ${JSON.stringify({ type: 'done', metadata: { clean_text: text } })}`, ''].join('\n\n'),
      })
    }
    if (path === '/api/prd-testcases/generate') {
      return json(route, {
        title: '用户登录需求', mode: 'LITE',
        parsedPrd: { title: '用户登录需求', wordCount: 300, features: [{ id: 'F-1', name: '验证码登录', description: '验证码登录', acceptanceCriteria: [] }], constraints: [], acceptanceCriteria: [] },
        testUnits: [{ id: 'TU-F-1-1', featureId: 'F-1', name: '验证码登录', description: '验证码登录' }],
        testcases: [{ caseId: 'TC-001', title: '正确验证码登录', module: '验证码登录', priority: 'P0', precondition: '用户已注册', steps: ['输入手机号', '输入正确验证码'], expected: '登录成功', relatedBug: '', testType: '功能测试', source: 'F-1' }],
        reviewReport: { total: 1, highConfidencePass: 1, needHumanReview: 0, flaggedGaps: 0, findings: [], coverage: { featureTotal: 1, featureCovered: 1, featureCoverageText: '1/1 (100%)', bugTotal: 0, bugCovered: 0, bugCoverageText: '0/0 (100%)', boundaryAutoGenerated: 0 }, needHumanReviewItems: [], needSupplement: false },
        markdown: '# 用户登录需求\n\n## TC-001 正确验证码登录',
      })
    }
    return json(route, { ok: true })
  })
}


test('通用智能体创建持久会话并流式显示回复', async ({ page }, testInfo) => {
  await mockPlatformApi(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '通用智能体', level: 2 })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '选择智能体' })).toBeVisible()
  await expect(page.getByRole('button', { name: '深度思考' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'PRD 测试' })).toBeVisible()
  await expect(page.getByRole('button', { name: '智能学习' })).toBeVisible()
  await page.getByRole('button', { name: '深度思考' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: '深度思考', level: 2 })).toBeVisible()
  await expect(page.getByLabel('描述需要深入分析的问题...')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('home-selected-tab.png') })
  await page.getByRole('button', { name: '深度思考' }).click()
  await expect(page.getByRole('heading', { name: '通用智能体', level: 2 })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('home-agent-tabs.png') })
  await page.getByLabel('给智能体发送消息...').fill('帮我拆解项目')
  await page.getByLabel('给智能体发送消息...').press('Enter')
  await expect(page).toHaveURL(/\/agent\/agent-1$/)
  await expect(page.getByRole('main').getByText('帮我拆解项目', { exact: true })).toBeVisible()
  await expect(page.getByRole('main').getByText('我已经接收到你的任务，并给出可执行的下一步。')).toBeVisible()
})


test('深度思考与 PRD 工具可通过平台路由切换', async ({ page }, testInfo) => {
  await mockPlatformApi(page)
  await page.goto('/deep-think')
  await expect(page.getByText('结构化', { exact: true })).toBeVisible()
  await page.getByLabel('描述需要深入分析的问题...').fill('比较两个技术方案')
  await page.getByLabel('描述需要深入分析的问题...').press('Enter')
  await expect(page.getByRole('heading', { name: '问题定义' })).toBeVisible()

  await page.goto('/')
  await page.getByRole('button', { name: 'PRD 测试' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'PRD 测试', level: 2 })).toBeVisible()
  await page.getByLabel('输入或粘贴产品需求...').fill('用户登录需求：支持手机号验证码登录，验证码连续错误五次后锁定账号。')
  await page.getByLabel('输入或粘贴产品需求...').press('Enter')
  await expect(page).toHaveURL('/tools/prd-testcases')
  await page.getByRole('button', { name: '生成测试用例' }).click()
  await expect(page.getByText('TC-001', { exact: true })).toBeVisible()
  await expect(page.getByText('1/1 (100%)')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('prd-workflow.png'), fullPage: true })
})
