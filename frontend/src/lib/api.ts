import type {
  AIMessageMetadata,
  AgentConversation,
  AgentConversationDetail,
  AgentMode,
  PrdWorkflowResult,
  SessionDetail,
  SessionSummary,
} from '../types'
import { createSseStream, jsonRequest, requestJson } from './http'


export interface CreateSessionInput {
  title: string
  mode: 'upload' | 'topic'
  source_material: string
  source_type?: string
  uploaded_file_name?: string
  topic_query?: string
}


export function createSession(data: CreateSessionInput) {
  return requestJson<{ id: string }>('/api/sessions', jsonRequest('POST', data))
}


export function getSession(sessionId: string) {
  return requestJson<SessionDetail>(`/api/sessions/${sessionId}`)
}


export function listSessions(status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  return requestJson<SessionSummary[]>(`/api/sessions${query}`)
}


export function deleteSession(sessionId: string) {
  return requestJson<{ ok: boolean }>(`/api/sessions/${sessionId}`, jsonRequest('DELETE'))
}


interface ChatStreamHandlers {
  onToken: (text: string) => void
  onMetadata: (metadata: AIMessageMetadata) => void
  onComplete: () => void
  onError: (error: Error) => void
}


export function createChatStream(
  sessionId: string,
  message: string,
  messageAlreadySaved: boolean,
  handlers: ChatStreamHandlers,
): AbortController {
  return createSseStream<{
    type: 'token' | 'done' | 'error'
    text?: string
    metadata?: AIMessageMetadata
  }>({
    path: '/api/chat',
    body: {
      session_id: sessionId,
      message,
      message_already_saved: messageAlreadySaved,
    },
    onEvent: event => {
      if (event.type === 'token') handlers.onToken(event.text || '')
      else if (event.type === 'done') {
        if (event.metadata) handlers.onMetadata(event.metadata)
        handlers.onComplete()
      } else {
        handlers.onError(new Error(event.text || '生成失败'))
      }
    },
    onError: handlers.onError,
  })
}


export function createReviewSession(sessionId: string, initialMessage: string) {
  return requestJson<SessionSummary>('/api/review/sessions', jsonRequest('POST', {
    session_id: sessionId,
    initial_message: initialMessage,
  }))
}


export function getDueReviews() {
  return requestJson<SessionSummary[]>('/api/review/due')
}


export function getReviewQueueCount() {
  return requestJson<{ count: number }>('/api/review/queue-count')
}


export function createAgentConversation(mode: AgentMode) {
  return requestJson<AgentConversation>('/api/agent/conversations', jsonRequest('POST', { mode }))
}


export function listAgentConversations() {
  return requestJson<AgentConversation[]>('/api/agent/conversations')
}


export function getAgentConversation(conversationId: string) {
  return requestJson<AgentConversationDetail>(`/api/agent/conversations/${conversationId}`)
}


export function deleteAgentConversation(conversationId: string) {
  return requestJson<{ ok: boolean }>(`/api/agent/conversations/${conversationId}`, jsonRequest('DELETE'))
}


interface AgentStreamHandlers {
  onToken: (text: string) => void
  onComplete: (text: string) => void
  onError: (error: Error) => void
}


export function createAgentChatStream(
  conversationId: string,
  message: string,
  handlers: AgentStreamHandlers,
) {
  return createSseStream<{
    type: 'token' | 'done' | 'error'
    text?: string
    metadata?: { clean_text?: string }
  }>({
    path: '/api/agent/chat',
    body: { conversation_id: conversationId, message },
    onEvent: event => {
      if (event.type === 'token') handlers.onToken(event.text || '')
      else if (event.type === 'done') handlers.onComplete(event.metadata?.clean_text || '')
      else handlers.onError(new Error(event.text || '生成失败'))
    },
    onError: handlers.onError,
  })
}


export function generatePrdTestcases(prdMarkdown: string) {
  return requestJson<PrdWorkflowResult>('/api/prd-testcases/generate', jsonRequest('POST', { prdMarkdown }))
}
