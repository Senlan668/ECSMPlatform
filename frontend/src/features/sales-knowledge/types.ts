export interface RuntimeCapabilities {
  service: string
  storage: { mode: 'tenant_sqlite'; ready: boolean }
  capabilities: {
    wechat_etl: boolean
    cleaning_and_labeling: boolean
    training_export: boolean
    student_management: boolean
    rag_search: boolean
    rag_answer: boolean
    object_storage: boolean
    vision_import: boolean
  }
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  has_more: boolean
}

export interface AdminStats {
  raw_chats: { total: number; pending: number; approved: number; rejected: number }
  sessions: { total: number; processed: number; unprocessed: number }
  staging_conversations: { total: number; pending: number; approved: number; rejected: number }
}

export interface ChatSession {
  id: number
  session_id: string
  display_name: string | null
  is_chatroom: boolean
  last_message: string | null
  last_time: number | null
  message_count: number
}

export interface ChatMessage {
  id: number
  session_id: string
  sender_name: string | null
  content: string | null
  msg_type: number
  is_sender: boolean
  timestamp: number
}

export interface StagingConversation {
  id: number
  session_id: string
  original_text: string
  cleaned_text: string
  auto_question?: string
  auto_answer?: string
  human_question?: string
  human_answer?: string
  auto_category?: string
  human_category?: string
  auto_quality_score?: number
  human_notes?: string
  status: string
  start_time: number
  end_time: number
  created_at?: string
}

export interface StagingList {
  total: number
  page: number
  page_size: number
  items: StagingConversation[]
}

export interface KnowledgeStats {
  total_chunks: number
  total_sessions: number
  sessions_with_chunks: number
  avg_chunks_per_session: number
}

export interface RagSource {
  type?: string
  id?: number
  scene?: string
  topic_summary?: string
  content_block?: string
  similarity?: number
}

export interface Material {
  id: number
  filename: string
  file_size: number
  file_type: string
  category: string
  title: string | null
  description: string | null
  remark: string | null
  tags: string[]
  download_count: number
  oss_key: string | null
  is_pre_masked: boolean
  folder_id: number | null
  created_at: string
}

export interface FolderRecord {
  id: number
  name: string
  category: string
  parent_folder_id: number | null
  file_count: number
  subfolder_count: number
  created_at: string
}

export interface Student {
  id: number
  name: string
  channel: string
  job_title: string | null
  pre_salary: string | null
  post_salary: string | null
  city: string | null
  education: string | null
  phone: string | null
  class_name: string | null
  main_report_material_id?: number | null
  report_materials?: Array<{ id: number; filename: string; title: string | null; is_primary: boolean }>
  status: string
  created_at: string
  updated_at: string | null
}

export interface StudentList extends Paginated<Student> {}

export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface CustomConversation {
  id: number
  conversation_json: ConversationTurn[]
  category: string
  quality: string
  system_prompt: string | null
  title: string | null
  description: string | null
  tags: string[] | null
  source: string
  created_by: string | null
  created_at: string
  updated_at: string
  is_active: boolean
}

export interface KnowledgeArticle {
  id: number
  scene: string
  scene_category: string | null
  customer_says: string | null
  recommended_response: string | null
  key_points: string[] | null
  source_type: string | null
  confidence: number
  is_verified: boolean
  created_at: string | null
}

export interface QuizQuestion {
  id: number
  question: string
  reference_answer: string
  category: string
  difficulty: string
}

export interface QuizRecord {
  id: number
  title: string
  category: string
  question_count: number
  questions?: QuizQuestion[]
  status: string
  attempt_count?: number
  created_at: string | null
}

export interface QuizAttempt {
  id: number
  quiz_id: number
  quiz_title: string | null
  ai_total_score: number | null
  human_score: number | null
  human_feedback?: string | null
  status: string
  created_at: string | null
}

export interface ExportFormat {
  id: string
  name: string
  description: string
  extension: string
}

export interface ExportOptions {
  formats: ExportFormat[]
  qualities: Array<{ id: string; name: string; description: string }>
  categories: Array<{ id: string; name: string; description: string }>
}
