import axios from 'axios'

// 生产环境从 .env.production 读取 VITE_API_BASE_URL
// 开发环境走 Vite 代理（baseURL 为空时走相对路径）
const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

const api = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  timeout: 120000 // 2分钟超时，因为 AI 生成需要时间
})

// ============== 认证相关 ==============

// 获取 token
export function getToken() {
  return localStorage.getItem('token')
}

// 设置 token
export function setToken(token) {
  localStorage.setItem('token', token)
}

// 移除 token
export function removeToken() {
  localStorage.removeItem('token')
}

// 检查是否已登录
export function isLoggedIn() {
  return !!getToken()
}

// 请求拦截器 - 自动添加 token
api.interceptors.request.use(
  config => {
    const token = getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  error => Promise.reject(error)
)

// 响应拦截器 - 401 时触发登出
api.interceptors.response.use(
  response => response,
  error => {
    const inactiveAccount = error.response?.status === 403
      && error.response?.data?.detail === '账号已停用，请联系管理员'
    if (error.response?.status === 401 || inactiveAccount) {
      removeToken()
      // 触发自定义事件通知前端需要登录
      window.dispatchEvent(new CustomEvent('auth:logout'))
    }
    return Promise.reject(error)
  }
)

// 用户登录
export async function login(username, password) {
  const res = await api.post('/auth/login', { username, password })
  if (res.data.access_token) {
    setToken(res.data.access_token)
  }
  return res.data
}

// 获取当前用户信息
export async function getCurrentUser() {
  const res = await api.get('/auth/me')
  return res.data
}

// 登出
export function logout() {
  removeToken()
}

// 启动工作流
export async function startWorkflow(topicDirection) {
  const res = await api.post('/workflow/start', {
    topic_direction: topicDirection
  })
  return res.data
}

// 获取工作流状态
export async function getWorkflowState(threadId) {
  const res = await api.get(`/workflow/state/${threadId}`)
  return res.data
}

// 恢复工作流 - 选择选题
export async function selectTopic(threadId, selectedTopic) {
  const res = await api.post(`/workflow/resume/${threadId}`, {
    action: 'select_topic',
    data: { selected_topic: selectedTopic }
  })
  return res.data
}

// 恢复工作流 - 审核通过
export async function approveArticle(threadId) {
  const res = await api.post(`/workflow/resume/${threadId}`, {
    action: 'approve'
  })
  return res.data
}

// 恢复工作流 - 审核驳回
export async function rejectArticle(threadId, feedback) {
  const res = await api.post(`/workflow/resume/${threadId}`, {
    action: 'reject',
    data: { feedback }
  })
  return res.data
}

// 获取工作流历史
export async function getWorkflowHistory(threadId) {
  const res = await api.get(`/workflow/history/${threadId}`)
  return res.data
}

// 获取所有工作流线程列表
export async function getAllThreads() {
  const res = await api.get('/workflow/threads')
  return res.data
}

// 删除工作流线程
export async function deleteThread(threadId) {
  const res = await api.delete(`/workflow/threads/${threadId}`)
  return res.data
}

// ============== 流式 API（仅用于文章生成场景） ==============
// 选题阶段和审核通过请使用普通接口 startWorkflow / approveArticle

/**
 * 流式启动工作流 - 选题阶段使用非流式结构化输出，包装成回调形式
 * @param {string} topicDirection - 主题方向
 * @param {Object} callbacks - 回调函数对象
 * @param {string} streamMode - 流模式（此场景下忽略，使用普通 API）
 */
export async function streamStartWorkflow(topicDirection, callbacks, streamMode = 'updates') {
  try {
    // 先生成一个临时 thread_id 用于初始化回调
    callbacks.onInit?.({ thread_id: 'loading...' })
    callbacks.onStart?.({ stream_mode: streamMode })

    // 调用普通 API
    const res = await api.post('/workflow/start', {
      topic_direction: topicDirection
    })
    const data = res.data

    // 模拟流式事件回调
    callbacks.onInit?.({ thread_id: data.thread_id })

    // 节点结束事件
    callbacks.onNodeEnd?.({
      node: 'plan_topics',
      metrics: data.node_metrics?.[0] || null
    })

    // 更新事件
    callbacks.onUpdate?.('topic_selection', {
      generated_topics: data.generated_topics,
      node_metrics: data.node_metrics
    })

    // 完成事件
    callbacks.onDone?.({
      status: data.status,
      interrupt_info: data.interrupt_info,
      values: {
        generated_topics: data.generated_topics,
        node_metrics: data.node_metrics
      }
    })

  } catch (error) {
    callbacks.onError?.(error.response?.data?.detail || error.message)
  }
}

/**
 * 流式审核通过 - 使用非流式 API，包装成回调形式
 * @param {string} threadId - 线程ID
 * @param {Object} callbacks - 回调函数对象
 * @param {string} streamMode - 流模式（此场景下忽略，使用普通 API）
 */
export async function streamApproveArticle(threadId, callbacks, streamMode = 'updates') {
  try {
    callbacks.onResume?.({ thread_id: threadId, action: 'approve' })
    callbacks.onStart?.({ stream_mode: streamMode })

    // 调用普通 API
    const res = await api.post(`/workflow/resume/${threadId}`, {
      action: 'approve'
    })
    const data = res.data

    // 更新事件 - 视觉要点
    if (data.result?.visual_points) {
      callbacks.onUpdate?.('extract_visuals', {
        visual_points: data.result.visual_points,
        node_metrics: data.node_metrics
      })
    }

    // 更新事件 - 图片
    if (data.result?.image_urls) {
      callbacks.onUpdate?.('generate_images', {
        image_urls: data.result.image_urls,
        node_metrics: data.node_metrics
      })
    }

    // 完成事件
    callbacks.onDone?.({
      status: data.status,
      is_completed: data.is_completed,
      interrupt_info: data.interrupt_info,
      values: {
        article_content: data.result?.article_content || '',
        visual_points: data.result?.visual_points || [],
        image_urls: data.result?.image_urls || [],
        node_metrics: data.node_metrics
      }
    })

  } catch (error) {
    callbacks.onError?.(error.response?.data?.detail || error.message)
  }
}

/**
 * SSE 事件处理器 - 用于文章生成的流式输出
 * @param {Response} response - fetch 响应对象
 * @param {Object} callbacks - 回调函数对象
 * @param {Function} callbacks.onStart - 开始事件
 * @param {Function} callbacks.onLlmStart - LLM 开始生成
 * @param {Function} callbacks.onLlmToken - LLM token 事件 (content) - 文章逐字输出
 * @param {Function} callbacks.onLlmEnd - LLM 生成完成，包含 token 统计
 * @param {Function} callbacks.onDone - 完成事件 (finalState)
 * @param {Function} callbacks.onError - 错误事件 (message)
 */
async function handleSSEStream(response, callbacks) {
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6))
          const { type, data } = event

          switch (type) {
            case 'start':
              callbacks.onStart?.(data)
              break
            case 'resume':
              callbacks.onResume?.(data)
              break
            case 'llm_start':
              callbacks.onLlmStart?.(data)
              break
            case 'llm_token':
              callbacks.onLlmToken?.(data.content)
              break
            case 'llm_end':
              callbacks.onLlmEnd?.(data)
              break
            case 'done':
              callbacks.onDone?.(data)
              break
            case 'error':
              callbacks.onError?.(data.message)
              break
          }
        } catch (e) {
          console.error('解析SSE数据失败:', e, line)
        }
      }
    }
  }
}

/**
 * 流式选择选题 - 选题后流式生成文章
 * @param {string} threadId - 线程ID
 * @param {string} selectedTopic - 选中的选题
 * @param {Object} callbacks - 回调函数对象
 */
export function streamSelectTopic(threadId, selectedTopic, callbacks) {
  const token = getToken()
  return fetch(`${API_BASE}/api/v1/workflow/stream/resume/${threadId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      action: 'select_topic',
      data: { selected_topic: selectedTopic }
    })
  }).then(response => handleSSEStream(response, callbacks))
}

/**
 * 流式驳回重写 - 驳回后流式重新生成文章
 * @param {string} threadId - 线程ID
 * @param {string} feedback - 修改意见
 * @param {Object} callbacks - 回调函数对象
 */
export function streamRejectArticle(threadId, feedback, callbacks) {
  const token = getToken()
  return fetch(`${API_BASE}/api/v1/workflow/stream/resume/${threadId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      action: 'reject',
      data: { feedback: feedback || '' }
    })
  }).then(response => handleSSEStream(response, callbacks))
}

// ============== 海报生成 API ==============

/**
 * 自定义生成海报（提交后台任务，避免长时间同步请求误判超时）
 * @param {Object} data - { prompt, style_tags?, aspect_ratio?, color_tone?, reference_images? }
 */
export async function generateCustomPoster(data) {
  const res = await api.post('/poster/batch/single/custom', data)
  return { ...res.data, mode: 'batch', display_mode: 'single', single_label: '自定义创意' }
}

/**
 * 仅生成提示词（不生成图片），供 Nano Banana Pro 等外部工具使用
 * @param {Object} data - { prompt, style_tags?, aspect_ratio?, color_tone? }
 */
export async function generatePromptOnly(data) {
  const res = await api.post('/poster/generate-prompt', data)
  return res.data
}

/**
 * 模板生成海报（提交后台任务，避免长时间同步请求误判失败）
 * @param {Object} data - { template_id, params, style_tag?, color_option?, aspect_ratio? }
 */
export async function generateTemplatePoster(data) {
  const params = data.params || {}
  const title = Object.values(params)
    .map(value => String(value || '').trim())
    .find(Boolean) || '模板任务'

  const res = await api.post('/poster/batch/template', {
    template_id: data.template_id,
    items: [{ title, params }],
    style_tag: data.style_tag,
    color_option: data.color_option,
    aspect_ratio: data.aspect_ratio,
  })
  return { ...res.data, mode: 'batch', display_mode: 'single' }
}

/**
 * 获取海报模板列表
 */
export async function getPosterTemplates() {
  const res = await api.get('/poster/templates')
  return res.data
}

/**
 * 获取风格标签列表
 */
export async function getPosterStyles() {
  const res = await api.get('/poster/style-tags')
  return res.data
}

/**
 * 获取支持的尺寸比例
 */
export async function getPosterAspectRatios() {
  const res = await api.get('/poster/aspect-ratios')
  return res.data
}

/**
 * 以图改图（提交后台任务，避免长时间同步请求误判超时）
 * @param {Object} data - { image_base64, edit_prompt, aspect_ratio? }
 */
export async function generateEditPoster(data) {
  const res = await api.post('/poster/batch/single/edit', data)
  return { ...res.data, mode: 'batch', display_mode: 'single', single_label: '智能改图' }
}

/**
 * 风格迁移
 * @param {Object} data - { image_base64, style_tags, strength?, aspect_ratio? }
 */
export async function generateStyleTransfer(data) {
  const res = await api.post('/poster/generate/style-transfer', data)
  return res.data
}

// ============== 批量生成 API ==============

/**
 * 批量生成海报 (支持系列风格一致性)
 * @param {Object} data - { mode, aspect_ratio, color_tone, style_tags?, template_index?, series_mode, items }
 */
export async function generateBatchPoster(data) {
  const res = await api.post('/poster/batch/generate', data)
  return res.data
}

/**
 * 创建模板批量生成任务（后端串行队列）
 * @param {Object} data - { template_id, items, style_tag?, color_option?, aspect_ratio? }
 */
export async function createTemplateBatchTask(data) {
  const res = await api.post('/poster/batch/template', data)
  return res.data
}

/**
 * 向模板批量生成任务追加条目
 * @param {string} taskId - 任务 ID
 * @param {Object} data - { template_id, items, style_tag?, color_option?, aspect_ratio? }
 */
export async function appendTemplateBatchItems(taskId, data) {
  const res = await api.post(`/poster/batch/${taskId}/template-items`, data)
  return res.data
}

/**
 * 查询批量任务进度
 * @param {string} taskId - 任务 ID
 */
export async function getBatchStatus(taskId) {
  const res = await api.get(`/poster/batch/${taskId}/status`)
  return res.data
}

/**
 * 重试批量任务中的失败项
 * @param {string} taskId - 任务 ID
 */
export async function retryBatchTask(taskId) {
  const res = await api.post(`/poster/batch/${taskId}/retry`)
  return res.data
}

/**
 * 获取批量下载链接
 * @param {string} taskId - 任务 ID
 */
export function getBatchDownloadUrl(taskId) {
  return `${API_BASE}/api/v1/poster/batch/${taskId}/download`
}

// ============== 局部重绘 & 尺寸适配 (Phase 4) ==============

/**
 * 局部重绘 (Inpaint)
 * @param {Object} data - { image_base64, mask_base64, inpaint_prompt, aspect_ratio? }
 */
export async function generateInpaintPoster(data) {
  const res = await api.post('/poster/inpaint', data)
  return res.data
}

/**
 * 智能擦除 (Erase)
 * @param {Object} data - { image_base64, mask_base64 }
 */
export async function generateErasePoster(data) {
  const res = await api.post('/poster/erase', data)
  return res.data
}

/**
 * 尺寸适配/扩图 (Adapt)
 * @param {Object} data - { image_base64, source_ratio, target_ratio, strategy }
 */
export async function generateAdaptPoster(data) {
  const res = await api.post('/poster/adapt', data)
  return res.data
}

/**
 * 全平台导出 (Export All)
 * @param {Object} data - { image_base64, source_ratio }
 */
export async function generateExportAll(data) {
  const res = await api.post('/poster/export-all', data)
  return res.data
}

/**
 * 将生成的喜报同步到销售系统并关联学员
 * @param {Object} data - { image_url, query?, student_id?, title? }
 */
export async function syncPosterToSalesSystem(data) {
  const res = await api.post('/poster/sales-sync', data)
  return res.data
}

// ============== 作品库 / 素材中心 API ==============

/**
 * 分页获取作品列表
 * @param {Object} params - { mode?, is_favorite?, is_template?, tags?, keyword?, date_from?, date_to?, sort_by?, order?, page?, page_size? }
 */
export async function getGalleryList(params = {}) {
  const res = await api.get('/gallery/list', { params })
  return res.data
}

/**
 * 获取作品详情
 * @param {string} id - 作品 UUID
 */
export async function getGalleryDetail(id) {
  const res = await api.get(`/gallery/${id}`)
  return res.data
}

/**
 * 更新作品信息（标题、标签）
 * @param {string} id - 作品 UUID
 * @param {Object} data - { title?, tags? }
 */
export async function updateGalleryWork(id, data) {
  const res = await api.put(`/gallery/${id}`, data)
  return res.data
}

/**
 * 重命名作品
 * @param {string} id - 作品 UUID
 * @param {string} newTitle - 新标题（1-200 字符）
 */
export async function renameGalleryWork(id, newTitle) {
  const res = await api.patch(`/gallery/${id}/rename`, { new_title: newTitle })
  return res.data
}

/**
 * 删除作品
 * @param {string} id - 作品 UUID
 */
export async function deleteGalleryWork(id) {
  const res = await api.delete(`/gallery/${id}`)
  return res.data
}

/**
 * 切换收藏状态
 * @param {string} id - 作品 UUID
 */
export async function toggleFavorite(id) {
  const res = await api.post(`/gallery/${id}/favorite`)
  return res.data
}

/**
 * 存为个人模板
 * @param {string} id - 作品 UUID
 */
export async function saveAsTemplate(id) {
  const res = await api.post(`/gallery/${id}/save-as-template`)
  return res.data
}

/**
 * 搜索作品
 * @param {Object} params - { keyword, page?, page_size? }
 */
export async function searchGallery(params) {
  const res = await api.get('/gallery/search', { params })
  return res.data
}

/**
 * 获取筛选项（所有标签和模式枚举）
 */
export async function getGalleryFilters() {
  const res = await api.get('/gallery/filters')
  return res.data
}

/**
 * 批量删除作品
 * @param {string[]} ids - 作品 UUID 数组
 */
export async function batchDeleteWorks(ids) {
  const res = await api.post('/gallery/batch-delete', { ids })
  return res.data
}

/**
 * 批量打标签
 * @param {string[]} ids - 作品 UUID 数组
 * @param {string[]} tags - 标签列表
 */
export async function batchTagWorks(ids, tags) {
  const res = await api.post('/gallery/batch-tag', { ids, tags })
  return res.data
}

// ============== 品牌包 API (Brand Kit) ==============

export async function getBrandKit() {
  const res = await api.get('/brand/me')
  return res.data
}

export async function saveBrandKit(data) {
  const res = await api.put('/brand/me', data)
  return res.data
}

export async function resetBrandKit() {
  const res = await api.delete('/brand/me')
  return res.data
}

export async function uploadBrandLogo(logoBase64, contentType = 'image/png') {
  const res = await api.post('/brand/me/logo', {
    logo_base64: logoBase64,
    content_type: contentType,
  })
  return res.data
}

// ============== 模板中心 API (Template Center) ==============

export async function getTemplatesList(params = {}) {
  const res = await api.get('/templates/list', { params })
  return res.data
}

export async function saveTemplate(data) {
  const url = data.id ? `/templates/${data.id}` : '/templates/create'
  const method = data.id ? 'put' : 'post'
  const res = await api[method](url, data)
  return res.data
}

export async function deleteTemplate(id) {
  const res = await api.delete(`/templates/${id}`)
  return res.data
}

export async function duplicateTemplate(id) {
  const res = await api.post(`/templates/${id}/duplicate`)
  return res.data
}

export async function publishTemplate(id) {
  const res = await api.post(`/templates/${id}/publish`)
  return res.data
}

export async function deactivatePublicTemplate(id) {
  const res = await api.post(`/templates/${id}/deactivate`)
  return res.data
}

export async function restorePublicTemplate(id) {
  const res = await api.post(`/templates/${id}/restore`)
  return res.data
}

// ============== 后台人员管理 API ==============

export async function getAdminUsers(params = {}) {
  const res = await api.get('/admin/users', { params })
  return res.data
}

export async function createAdminUser(data) {
  const res = await api.post('/admin/users', data)
  return res.data
}

export async function setAdminUserRole(userId, isAdmin) {
  const res = await api.put(`/admin/users/${userId}/admin`, { is_admin: isAdmin })
  return res.data
}

export async function setAdminUserStatus(userId, isActive) {
  const res = await api.put(`/admin/users/${userId}/status`, { is_active: isActive })
  return res.data
}

export async function resetAdminUserPassword(userId, password) {
  await api.put(`/admin/users/${userId}/password`, { password })
}

// ============== 个人中心 API (Profile) ==============
// 注意：以下为包含部分 Mock 的桩代码以支持前端独立开发

export async function getProfile() {
  const res = await api.get('/auth/me')
  // 补全由于 User 模型不够全缺失的 mock 数据
  return {
    ...res.data,
    avatar_url: '',
    nickname: res.data.username,
    bio: '这里是用来存放非常酷的个人简介的地方。',
    created_at: '2025-01-01T12:00:00Z'
  }
}

export async function updateProfile(data) {
  // Mock Update
  await new Promise(r => setTimeout(r, 500))
  return { id: 'mock-id', username: data.nickname, ...data }
}

export async function uploadAvatar(fileData) {
  // Mock Upload
  await new Promise(r => setTimeout(r, 800))
  // 返回一个随机构图当作头像
  return { avatar_url: `https://api.dicebear.com/7.x/initials/svg?seed=${Math.random()}` }
}

export async function changePassword(data) {
  // Mock Password Change
  await new Promise(r => setTimeout(r, 600))
  if (data.old_password === 'mock_wrong') throw new Error("旧密码错误")
  return { success: true }
}

export async function getProfileStats() {
  // Mock 统计聚合
  await new Promise(r => setTimeout(r, 700))
  return {
    total_works: 128,
    total_favorites: 15,
    total_templates: 4,
    storage_used_bytes: 52 * 1024 * 1024,
    mode_distribution: {
      custom: 45,
      template: 35,
      edit: 20,
      batch: 28
    },
    recent_trend: [
      { date: '2026-03-03', count: 5 },
      { date: '2026-03-04', count: 12 },
      { date: '2026-03-05', count: 8 },
      { date: '2026-03-06', count: 24 },
      { date: '2026-03-07', count: 18 },
      { date: '2026-03-08', count: 32 },
      { date: '2026-03-09', count: 15 }
    ]
  }
}

export async function getPreferences() {
  const res = await api.get('/profile/preferences')
  return res.data
}

export async function updatePreferences(data) {
  const res = await api.put('/profile/preferences', data)
  return res.data
}

// ============== 公共图片模型 API ==============

export async function getImageModels(includeInactive = false) {
  const res = await api.get('/image-models/list', {
    params: { include_inactive: includeInactive },
  })
  return res.data
}

export async function createImageModel(data) {
  const res = await api.post('/image-models/create', data)
  return res.data
}

export async function updateImageModel(id, data) {
  const res = await api.put(`/image-models/${id}`, data)
  return res.data
}

export async function deleteImageModel(id) {
  const res = await api.delete(`/image-models/${id}`)
  return res.data
}

export async function setDefaultImageModel(id) {
  const res = await api.post(`/image-models/${id}/set-default`)
  return res.data
}

// ============== 多平台适配 API (Platform Adapter) ==============

/**
 * 获取所有支持的平台规则
 */
export async function getPlatformRules() {
  const res = await api.get('/platform/rules')
  return res.data
}

/**
 * 单平台改写
 * @param {Object} data - { platform_id, source_article, source_title?, source_thread_id?, include_tags? }
 */
export async function adaptSinglePlatform(data) {
  // LLM 改写长文可能较慢，单平台 5 分钟超时
  const res = await api.post('/platform/adapt', data, { timeout: 300000 })
  return res.data
}

/**
 * 一键全平台并发改写
 * @param {Object} data - { source_article, source_title?, source_thread_id?, platform_ids? }
 */
export async function adaptAllPlatforms(data) {
  // 全平台并发改写，5 个平台同时生成，给 8 分钟超时
  const res = await api.post('/platform/adapt-all', data, { timeout: 480000 })
  return res.data
}

/**
 * 获取某工作流的所有改写版本
 * @param {string} threadId - 工作流 ID
 * @param {string} platform - (可选) 平台过滤
 */
export async function getPlatformVariantsByThread(threadId, platform) {
  const params = platform ? { platform } : {}
  const res = await api.get(`/platform/variants/${threadId}`, { params })
  return res.data
}

/**
 * 获取改写版本详情
 * @param {string} variantId - 改写版本 ID
 */
export async function getPlatformVariant(variantId) {
  const res = await api.get(`/platform/variant/${variantId}`)
  return res.data
}

/**
 * 更新改写版本（用户手动编辑）
 * @param {string} variantId - 改写版本 ID
 * @param {Object} data - { adapted_content?, suggested_title?, suggested_tags? }
 */
export async function updatePlatformVariant(variantId, data) {
  const res = await api.put(`/platform/variant/${variantId}`, data)
  return res.data
}

/**
 * 删除改写版本
 * @param {string} variantId - 改写版本 ID
 */
export async function deletePlatformVariant(variantId) {
  const res = await api.delete(`/platform/variant/${variantId}`)
  return res.data
}

// ============== 内容日历 API ==============

// 获取按月查询的日历内容条目
export async function getCalendarEvents(year, month, status = null) {
  const params = { year, month }
  if (status) params.status = status
  const response = await api.get('/calendar/events', { params })
  return response.data
}

// 创建日历条目
export async function createCalendarEvent(data) {
  const response = await api.post('/calendar/events', data)
  return response.data
}

// 更新日历条目
export async function updateCalendarEvent(eventId, data) {
  const response = await api.put(`/calendar/events/${eventId}`, data)
  return response.data
}

// 删除日历条目
export async function deleteCalendarEvent(eventId) {
  const response = await api.delete(`/calendar/events/${eventId}`)
  return response.data
}

// AI 生成月度排期计划
export async function generateCalendarPlan(data) {
  const response = await api.post('/calendar/generate-plan', data)
  return response.data
}

// 获取排期计划列表
export async function getCalendarPlans() {
  const response = await api.get('/calendar/plans')
  return response.data
}

// 获取指定月份的节日热点
export async function getMonthHotspots(month) {
  const response = await api.get('/calendar/hotspots', { params: { month } })
  return response.data
}

// 获取近期即将到来的热点
export async function getUpcomingHotspots(month, day, days = 14) {
  const response = await api.get('/calendar/hotspots/upcoming', { params: { month, day, days } })
  return response.data
}

// 将日历条目推送到工作流创作
export async function createContentFromEvent(eventId) {
  const response = await api.post(`/calendar/events/${eventId}/create-content`)
  return response.data
}

// ============== 提示词库 API (Prompt Library) ==============

/**
 * 获取提示词列表
 * @param {Object} params - { scope?: 'mine'|'public'|'all', category?, keyword? }
 */
export async function getPromptList(params = {}) {
  const res = await api.get('/prompts/list', { params })
  return res.data
}

/**
 * 创建/收藏提示词
 * @param {Object} data - { title, content, category?, tags?, source_mode? }
 */
export async function createPrompt(data) {
  const res = await api.post('/prompts/create', data)
  return res.data
}

/**
 * 编辑提示词
 * @param {string} id - 提示词 UUID
 * @param {Object} data - { title?, content?, category?, tags?, source_mode? }
 */
export async function updatePrompt(id, data) {
  const res = await api.put(`/prompts/${id}`, data)
  return res.data
}

/**
 * 删除提示词
 * @param {string} id - 提示词 UUID
 */
export async function deletePrompt(id) {
  const res = await api.delete(`/prompts/${id}`)
  return res.data
}

/**
 * 记录引用次数 +1
 * @param {string} id - 提示词 UUID
 */
export async function usePrompt(id) {
  const res = await api.post(`/prompts/${id}/use`)
  return res.data
}

/**
 * 发布为公共提示词
 * @param {string} id - 提示词 UUID
 */
export async function publishPrompt(id) {
  const res = await api.post(`/prompts/${id}/publish`)
  return res.data
}

/**
 * Fork 公共提示词到个人库
 * @param {string} id - 提示词 UUID
 */
export async function forkPrompt(id) {
  const res = await api.post(`/prompts/${id}/fork`)
  return res.data
}

// ============== 视频生成 API ==============

export async function generateVideo(data) {
  const response = await api.post('/video/generate', data)
  return response.data
}

export async function getVideoList(limit = 20) {
  const response = await api.get('/video/list', { params: { limit } })
  return response.data
}

export async function getVideoStatus(taskId) {
  const response = await api.get(`/video/status/${taskId}`)
  return response.data
}

export async function previewVideoScript(data) {
  const response = await api.post('/video/script/preview', data)
  return response.data
}

export function getVideoDownloadUrl(taskId) {
  return `${API_BASE}/api/v1/video/download/${taskId}`
}

export async function getVoiceOptions() {
  const response = await api.get('/video/voices')
  return response.data
}

export async function deleteVideoTask(taskId) {
  const response = await api.delete(`/video/${taskId}`)
  return response.data
}
