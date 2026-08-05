export type AgentMode = 'chat' | 'file' | 'pptx' | 'deep'

export interface AgentReference {
  title: string
  url: string
  snippet?: string
}

export interface AgentMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  references?: AgentReference[]
  recommendations?: string[]
  status?: 'streaming' | 'complete' | 'stopped' | 'error'
  error?: string
  createdAt: string
}

export interface AgentFile {
  id: string
  name: string
  size: number
}

export interface AgentConversation {
  id: string
  title: string
  mode: AgentMode
  messages: AgentMessage[]
  file?: AgentFile
  createdAt: string
  updatedAt: string
}

export interface AgentStreamEvent {
  type: 'thinking' | 'text' | 'reference' | 'recommend' | 'error' | string
  content?: unknown
  data?: unknown
  count?: number
}

export interface AgentRuntimeHealth {
  status: string
  service: string
  capabilities: string[]
  modelConfigured: boolean
  searchConfigured: boolean
}
