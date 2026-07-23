import axios from 'axios'
import type { Session, Message, SearchResult, PaginatedResponse } from './types'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// 请求拦截器：自动带上 token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器：处理 401 退出登录
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      // Token 过期或无效，清除并派发事件（AuthContext 会监听）
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      window.dispatchEvent(new Event('auth:unauthorized'))
    }
    return Promise.reject(error)
  }
)

// 会话相关
export async function getSessions(params: {
  page?: number
  page_size?: number
  search?: string
  session_type?: 'all' | 'private' | 'chatroom'  // 新参数：会话类型
  exclude_chatroom?: boolean  // 是否排除群聊（默认true）
}): Promise<PaginatedResponse<Session>> {
  const { data } = await api.get('/chats/sessions', { params })
  return data
}

export async function getSession(sessionId: string): Promise<Session> {
  const { data } = await api.get(`/chats/sessions/${encodeURIComponent(sessionId)}`)
  return data
}

// 聊天历史
export async function getChatHistory(
  sessionId: string,
  params: {
    page?: number
    page_size?: number
    before_time?: number
    after_time?: number
    msg_type?: number
  }
): Promise<PaginatedResponse<Message>> {
  const { data } = await api.get(`/chats/history/${encodeURIComponent(sessionId)}`, { params })
  return data
}

// 消息上下文（搜索跳转定位用）
export async function getMessageContext(
  messageId: number,
  contextSize: number = 25
): Promise<{
  target_message_id: number
  session_id: string
  items: Message[]
  total: number
}> {
  const { data } = await api.get(`/chats/context/${messageId}`, {
    params: { context_size: contextSize }
  })
  return data
}

// 搜索相关
export async function searchMessages(params: {
  q: string
  page?: number
  page_size?: number
  session_id?: string
  start_time?: number
  end_time?: number
}): Promise<{
  items: SearchResult[]
  total: number
  query: string
  page: number
  page_size: number
  has_more: boolean
}> {
  const { data } = await api.get('/search/messages', { params })
  return data
}

export async function searchSessions(q: string, limit = 10): Promise<{
  session_id: string
  display_name: string
  is_chatroom: boolean
  message_count: number
}[]> {
  const { data } = await api.get('/search/sessions', { params: { q, limit } })
  return data
}

// 后台管理相关
export interface StagingConversation {
  id: number
  session_id: string
  original_text: string
  cleaned_text: string
  conversation_json: Array<{ role: string; content: string; sender_name?: string; msg_id: number; timestamp: number }>
  auto_question?: string
  auto_answer?: string
  human_question?: string
  human_answer?: string
  auto_category?: string
  human_category?: string
  auto_quality_score?: number
  auto_flags?: Record<string, any>
  human_notes?: string
  status: string
  start_time: number
  end_time: number
  source_message_ids: number[]
  created_at?: string
}

export interface AdminStats {
  raw_chats: {
    total: number
    pending: number
    approved: number
    rejected: number
  }
  sessions: {
    total: number
    processed: number
    unprocessed: number
  }
  staging_conversations: {
    total: number
    pending: number
    approved: number
    rejected: number
  }
}

export async function getAdminStats(): Promise<AdminStats> {
  const { data } = await api.get('/admin/stats')
  return data
}

export async function preprocessSessions(params: {
  session_ids?: string[]
  window_seconds?: number
  limit?: number
  process_all?: boolean
}): Promise<{ total_created: number; results: Array<{ session_id: string; created?: number; error?: string }>; processed: number; total: number; has_more: boolean }> {
  const timeout = params.process_all ? 300000 : 30000
  const { data } = await api.post('/admin/preprocess', params, { timeout })
  return data
}

export async function getStagingConversations(params: {
  status?: string
  session_id?: string
  category?: string
  min_quality?: number
  page?: number
  page_size?: number
}): Promise<{ total: number; page: number; page_size: number; items: StagingConversation[] }> {
  const { data } = await api.get('/admin/staging/list', { params })
  return data
}

export async function getStagingDetail(stagingId: number): Promise<{
  staging: StagingConversation
  original_messages: Array<{
    id: number
    sender_name?: string
    content: string
    clean_content?: string
    timestamp: number
    msg_type: number
    is_sender: boolean
    status: string
    auto_category?: string
  }>
}> {
  const { data } = await api.get(`/admin/staging/${stagingId}`)
  return data
}

export async function updateStaging(stagingId: number, params: {
  cleaned_text?: string
  human_question?: string
  human_answer?: string
  human_category?: string
  human_notes?: string
}): Promise<{ success: boolean; message: string }> {
  const { data } = await api.put(`/admin/staging/${stagingId}`, params)
  return data
}

export async function approveStaging(stagingId: number, category?: string): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post(`/admin/staging/${stagingId}/approve`, null, { params: { category } })
  return data
}

export async function rejectStaging(stagingId: number, notes?: string): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post(`/admin/staging/${stagingId}/reject`, null, { params: { notes } })
  return data
}

export async function batchActionStaging(params: {
  staging_ids: number[]
  action: 'approve' | 'reject' | 'delete'
  category?: string
  notes?: string
}): Promise<{ success: boolean; updated: number; deleted: number }> {
  const { data } = await api.post('/admin/staging/batch', params)
  return data
}

export async function mergeMessages(messageIds: number[]): Promise<{ success: boolean; staging_id: number; message: string }> {
  const { data } = await api.post('/admin/messages/merge', { message_ids: messageIds })
  return data
}

export async function bulkFilter(params: {
  keyword: string
  action: 'reject' | 'approve'
  session_ids?: string[]
}): Promise<{ success: boolean; updated: number; keyword: string }> {
  const { data } = await api.post('/admin/bulk-filter', params)
  return data
}

export async function publishStaging(stagingId: number): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post(`/admin/staging/${stagingId}/publish`)
  return data
}

export async function cleanOldData(): Promise<{ success: boolean; deleted_old_time: number; deleted_chatroom: number; total_deleted: number; message: string }> {
  const { data } = await api.post('/admin/clean-old-data')
  return data
}

// 知识库相关
export async function buildKnowledgeFromLabeled(clearExisting: boolean = true): Promise<{
  success: boolean
  message: string
  stats: {
    total_approved: number
    chunks_created: number
    deleted_old: number
  }
}> {
  const { data } = await api.post('/knowledge/build-from-labeled', null, {
    params: { clear_existing: clearExisting }
  })
  return data
}

export async function getKnowledgeStats(): Promise<{
  total_chunks: number
  total_sessions: number
  sessions_with_chunks: number
  avg_chunks_per_session: number
}> {
  const { data } = await api.get('/knowledge/stats')
  return data
}

// 已标注数据导出相关
export async function previewLabeledExport(config: {
  format?: string
  include_system_prompt?: boolean
  categories?: string[]
}, limit: number = 10): Promise<{
  preview: any[]
  statistics: {
    total: number
    previewed?: number
    by_category?: Record<string, number>
    message?: string
  }
  config: any
}> {
  const { data } = await api.post('/export/labeled/preview', config, {
    params: { limit }
  })
  return data
}

export async function exportLabeledDataset(config: {
  format?: string
  include_system_prompt?: boolean
  categories?: string[]
}): Promise<Blob> {
  const response = await api.post('/export/labeled/dataset', config, {
    responseType: 'blob'
  })
  return response.data
}


// ==================== 素材库相关 ====================

import type { Material } from './types'

/** 检查 TOS 配置状态 */
export async function getMaterialsStatus(): Promise<{ configured: boolean; message: string }> {
  const { data } = await api.get('/materials/status')
  return data
}

/** 获取素材列表 */
export async function getMaterials(params: {
  page?: number
  page_size?: number
  category?: string
  search?: string
  tag?: string
  folder_id?: number | null
  all_folders?: boolean
  unbound_only?: boolean
}): Promise<{ items: Material[]; total: number; page: number; page_size: number; has_more: boolean }> {
  const { data } = await api.get('/materials/list', { params })
  return data
}

/** 获取预签名上传 URL */
export async function getPresignedUploadUrl(params: {
  filename: string
  content_type: string
  category: string
}): Promise<{ upload_url: string; object_key: string; expires_in: number }> {
  const { data } = await api.get('/materials/upload/presigned-url', { params })
  return data
}

/** 前端直传 OSS 成功后，记录元数据到数据库 */
export async function recordMaterialUpload(payload: {
  filename: string
  stored_name: string
  file_size: number
  file_type: string
  category: string
  title?: string
  description?: string
  tags?: string[]
  uploaded_by?: string
  oss_key: string
  folder_id?: number | null
  student_id?: number | null
}): Promise<Material> {
  const { data } = await api.post('/materials/upload', payload)
  return data
}

/** 获取素材预览 URL */
export async function getMaterialPreviewUrl(materialId: number): Promise<{ url: string; filename: string; file_type: string; expires_in: number }> {
  const { data } = await api.get(`/materials/${materialId}/preview`)
  return data
}

/** 获取素材下载 URL（含下载计数） */
export async function getMaterialDownloadUrl(materialId: number): Promise<{ url: string; filename: string; file_type: string; expires_in: number }> {
  const { data } = await api.get(`/materials/${materialId}/download`)
  return data
}

/** 更新素材信息 */
export async function updateMaterial(materialId: number, payload: {
  filename?: string
  title?: string
  description?: string
  remark?: string
  tags?: string[]
  category?: string
}): Promise<Material> {
  const { data } = await api.put(`/materials/${materialId}`, payload)
  return data
}

/** 移动素材到文件夹或根目录 */
export async function moveMaterial(materialId: number, folderId: number | null): Promise<Material> {
  const { data } = await api.put(`/materials/${materialId}/move`, { folder_id: folderId })
  return data
}

/** 删除素材 */
export async function deleteMaterial(materialId: number): Promise<{ message: string; id: number }> {
  const { data } = await api.delete(`/materials/${materialId}`)
  return data
}

/** 一键打码（返回新生成的素材记录） */
export async function maskMaterial(materialId: number): Promise<Material> {
  const { data } = await api.post(`/materials/${materialId}/mask`)
  return data
}

/** 手动打码：传入笔刷绘制的 mask 图片 (PNG Blob) */
export async function manualMaskMaterial(materialId: number, maskBlob: Blob): Promise<Material> {
  const formData = new FormData()
  formData.append('mask', maskBlob, 'mask.png')
  const { data } = await api.post(`/materials/${materialId}/mask/manual`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  })
  return data
}

export async function getMaterialStats(): Promise<{
  total: number
  course_count: number
  report_count: number
  total_size_bytes: number
  total_downloads: number
  tos_configured: boolean
}> {
  const { data } = await api.get('/materials/stats/summary')
  return data
}

/** 获取所有已使用的标签及计数 */
export async function getMaterialTags(category?: string): Promise<{ name: string; count: number }[]> {
  const params: Record<string, any> = {}
  if (category) params.category = category
  const { data } = await api.get('/materials/tags', { params })
  return data
}

/** 批量添加/移除标签 */
export async function batchUpdateTags(payload: {
  material_ids: number[]
  add_tags?: string[]
  remove_tags?: string[]
}): Promise<{ updated: number; message: string }> {
  const { data } = await api.post('/materials/batch-tag', payload)
  return data
}

/** 代理上传：通过后端中转上传文件到 TOS（绕过 CORS） */
export async function proxyUploadMaterial(
  file: File,
  category: string = 'course',
  title?: string,
  folderId?: number | null,
  studentId?: number | null,
): Promise<Material> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('category', category)
  if (title) formData.append('title', title)
  if (folderId != null) formData.append('folder_id', String(folderId))
  if (studentId != null) formData.append('student_id', String(studentId))
  const { data } = await api.post('/materials/upload/proxy', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000, // 大文件给 2 分钟
  })
  return data
}

/** 预览素材导出为 RAG 知识库的统计信息 */
export async function previewMaterialsRag(category: string = 'report'): Promise<{
  total_materials: number
  tagged_materials: number
  untagged_materials: number
  total_tags: number
  total_rows: number
  tag_stats: { tag: string; material_count: number; question_count: number; sample_questions: string[] }[]
}> {
  const { data } = await api.get('/materials/export/rag/preview', { params: { category } })
  return data
}

/** 下载素材导出的 RAG 知识库 CSV（同时上传到 TOS） */
export async function exportMaterialsRag(category: string = 'report', maxPerTag: number = 5): Promise<{ blob: Blob; tosKey: string }> {
  const response = await api.get('/materials/export/rag', {
    params: { category, max_per_tag: maxPerTag, upload_tos: true },
    responseType: 'blob',
  })
  const tosKey = response.headers['x-tos-key'] || ''
  return { blob: response.data, tosKey }
}

// ==================== 文件夹管理 ====================

export interface FolderData {
  id: number
  name: string
  category: string
  parent_folder_id: number | null
  file_count: number
  subfolder_count: number
  created_at: string
}

/** 获取文件夹列表 */
export async function getFolders(category?: string, parentFolderId?: number | null): Promise<FolderData[]> {
  const params: Record<string, any> = {}
  if (category) params.category = category
  if (parentFolderId != null) params.parent_folder_id = parentFolderId
  const { data } = await api.get('/materials/folders/list', { params })
  return data
}

/** 创建文件夹 */
export async function createFolder(name: string, category: string = 'report', parentFolderId?: number | null): Promise<FolderData> {
  const payload: Record<string, any> = { name, category }
  if (parentFolderId != null) payload.parent_folder_id = parentFolderId
  const { data } = await api.post('/materials/folder', payload)
  return data
}

/** 重命名文件夹 */
export async function renameFolder(folderId: number, name: string): Promise<FolderData> {
  const { data } = await api.put(`/materials/folder/${folderId}`, { name })
  return data
}

/** 删除文件夹（级联删除内部文件） */
export async function deleteFolder(folderId: number): Promise<{ message: string; folder_id: number; deleted_files: number }> {
  const { data } = await api.delete(`/materials/folder/${folderId}`)
  return data
}

// ==================== 学生管理 ====================

export interface StudentData {
  id: number
  name: string
  channel: string
  job_title: string | null
  pre_salary: string | null
  post_salary: string | null
  bday: string | null
  city: string | null
  education: string | null
  graduation_cohort: string | null
  enroll_date: string | null
  graduation_date: string | null
  phone: string | null
  douyin_order: string | null
  class_name: string | null
  main_report_material_id: number | null
  main_report_material: {
    id: number
    filename: string
    title: string | null
    file_type: string | null
    category: string | null
    oss_key: string | null
    created_at: string | null
  } | null
  report_materials: {
    id: number
    filename: string
    title: string | null
    file_type: string | null
    category: string | null
    oss_key: string | null
    is_primary: boolean
    created_at: string | null
  }[]
  status: string
  created_at: string
  updated_at: string | null
}

export interface StudentListResponse {
  items: StudentData[]
  total: number
  page: number
  page_size: number
  has_more: boolean
}

export async function getStudents(params: {
  page?: number
  page_size?: number
  search?: string
  class_name?: string
  status?: string
  channel?: string
}): Promise<StudentListResponse> {
  const { data } = await api.get('/students/list', { params })
  return data
}

export async function getStudent(id: number): Promise<StudentData> {
  const { data } = await api.get(`/students/${id}`)
  return data
}

export async function createStudent(payload: Partial<StudentData>): Promise<StudentData> {
  const { data } = await api.post('/students/', payload)
  return data
}

export async function updateStudent(id: number, payload: Partial<StudentData>): Promise<StudentData> {
  const { data } = await api.put(`/students/${id}`, payload)
  return data
}

export async function bindStudentMainReport(studentId: number, materialId: number): Promise<StudentData> {
  const { data } = await api.put(`/students/${studentId}/main-report`, { material_id: materialId })
  return data
}

export async function unbindStudentMainReport(studentId: number): Promise<StudentData> {
  const { data } = await api.delete(`/students/${studentId}/main-report`)
  return data
}

export async function addStudentReport(studentId: number, materialId: number, isPrimary: boolean = false): Promise<StudentData> {
  const { data } = await api.post(`/students/${studentId}/reports`, { material_id: materialId, is_primary: isPrimary })
  return data
}

export async function removeStudentReport(studentId: number, materialId: number): Promise<StudentData> {
  const { data } = await api.delete(`/students/${studentId}/reports/${materialId}`)
  return data
}

export async function setStudentPrimaryReport(studentId: number, materialId: number): Promise<StudentData> {
  const { data } = await api.put(`/students/${studentId}/reports/${materialId}/primary`)
  return data
}

export async function deleteStudent(id: number): Promise<void> {
  await api.delete(`/students/${id}`)
}

/** AI 图片识别导入：上传图片，返回识别结果供确认 */
export async function aiImportStudents(file: File): Promise<{
  students: Partial<StudentData>[]
  count: number
  raw_text: string
}> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post('/students/import/ai', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000, // AI 识别可能需要较长时间
  })
  return data
}

/** 批量导入学生（确认后入库） */
export async function importStudents(students: Partial<StudentData>[]): Promise<{
  detail: string
  count: number
}> {
  const { data } = await api.post('/students/import', students)
  return data
}

// ==================== 知识提炼（Extractor） ====================

export interface KnowledgeArticleData {
  id: number
  scene: string
  scene_category: string | null
  customer_says: string | null
  recommended_response: string | null
  key_points: string[] | null
  source_chunk_id: number | null
  source_session_id: string | null
  source_type: string | null
  confidence: number
  is_verified: boolean
  created_at: string | null
}

export interface ExtractorStats {
  total_articles: number
  verified_articles: number
  unverified_articles: number
  avg_confidence: number
  by_category: Record<string, number>
}

/** 触发知识提炼（后台异步执行） */
export async function triggerExtraction(source: string = 'both'): Promise<{
  message: string
  source: string
  status: string
}> {
  const { data } = await api.post('/extractor/extract', { source })
  return data
}

/** 获取提炼的知识条目列表 */
export async function getArticles(params: {
  category?: string
  verified?: boolean
  skip?: number
  limit?: number
}): Promise<KnowledgeArticleData[]> {
  const { data } = await api.get('/extractor/articles', { params })
  return data
}

/** 更新知识条目 */
export async function updateArticle(articleId: number, payload: {
  scene?: string
  scene_category?: string
  customer_says?: string
  recommended_response?: string
  key_points?: string[]
  is_verified?: boolean
}): Promise<KnowledgeArticleData> {
  const { data } = await api.put(`/extractor/articles/${articleId}`, payload)
  return data
}

/** 删除知识条目 */
export async function deleteArticle(articleId: number): Promise<{ message: string }> {
  const { data } = await api.delete(`/extractor/articles/${articleId}`)
  return data
}

/** 获取提炼统计信息 */
export async function getExtractorStats(): Promise<ExtractorStats> {
  const { data } = await api.get('/extractor/stats')
  return data
}

// ==================== AI 考核 ====================

export interface QuizQuestion {
  id: number
  question: string
  reference_answer: string
  category: string
  difficulty: string
}

export interface QuizData {
  id: number
  title: string
  category: string
  question_count: number
  questions: QuizQuestion[]
  status: string
  attempt_count?: number
  created_at: string | null
}

export interface QuizAttemptData {
  id: number
  quiz_id: number
  quiz_title: string | null
  quiz_category?: string | null
  questions?: QuizQuestion[]
  user_answers: { question_id: number; answer: string }[] | null
  ai_evaluation: { question_id: number; score: number; feedback: string; is_reasonable: boolean }[] | null
  ai_total_score: number | null
  human_score: number | null
  human_feedback: string | null
  status: string
  created_at: string | null
  submitted_at: string | null
  graded_at: string | null
}

export async function generateQuiz(params: {
  category?: string
  count?: number
  title?: string
}): Promise<{ id: number; title: string; category: string; question_count: number; questions: QuizQuestion[] }> {
  const { data } = await api.post('/quiz/generate', params, { timeout: 60000 })
  return data
}

export async function getQuizList(params?: {
  category?: string
  skip?: number
  limit?: number
}): Promise<{ total: number; items: QuizData[] }> {
  const { data } = await api.get('/quiz/list', { params })
  return data
}

export async function getQuiz(quizId: number): Promise<QuizData> {
  const { data } = await api.get(`/quiz/${quizId}`)
  return data
}

export async function deleteQuiz(quizId: number): Promise<{ message: string }> {
  const { data } = await api.delete(`/quiz/${quizId}`)
  return data
}

export async function startQuizAttempt(quizId: number): Promise<{ attempt_id: number }> {
  const { data } = await api.post(`/quiz/${quizId}/start`)
  return data
}

export async function submitQuizAnswers(attemptId: number, answers: { question_id: number; answer: string }[]): Promise<{ message: string; attempt_id: number }> {
  const { data } = await api.post(`/quiz/attempt/${attemptId}/submit`, { answers })
  return data
}

export async function aiGradeAttempt(attemptId: number): Promise<{
  attempt_id: number
  evaluations: { question_id: number; score: number; feedback: string; is_reasonable: boolean }[]
  ai_total_score: number
}> {
  const { data } = await api.post(`/quiz/attempt/${attemptId}/ai-grade`, null, { timeout: 60000 })
  return data
}

export async function humanReviewAttempt(attemptId: number, params: {
  human_score: number
  human_feedback: string
}): Promise<{ attempt_id: number; human_score: number }> {
  const { data } = await api.put(`/quiz/attempt/${attemptId}/human-review`, params)
  return data
}

export async function getQuizAttempt(attemptId: number): Promise<QuizAttemptData> {
  const { data } = await api.get(`/quiz/attempt/${attemptId}`)
  return data
}

export async function getQuizAttempts(params?: {
  quiz_id?: number
  status?: string
  skip?: number
  limit?: number
}): Promise<{ total: number; items: QuizAttemptData[] }> {
  const { data } = await api.get('/quiz/attempts/list', { params })
  return data
}

export default api
