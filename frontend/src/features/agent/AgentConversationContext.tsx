import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useBusinessApi } from '../../lib/businessApi'
import type { AgentConversation, AgentMode } from './types'

export const MAX_STORED_CONVERSATIONS = 30

interface ConversationStore {
  key: string
  activeId: string
  conversations: AgentConversation[]
}

interface AgentConversationContextValue {
  activeConversation: AgentConversation | undefined
  conversations: AgentConversation[]
  createNewConversation: (mode?: AgentMode) => void
  deleteConversation: (id: string) => void
  selectConversation: (id: string) => void
  setStreamingConversationId: Dispatch<SetStateAction<string | null>>
  streamingConversationId: string | null
  updateConversation: (id: string, updater: (conversation: AgentConversation) => AgentConversation) => void
}

const AgentConversationContext = createContext<AgentConversationContextValue | null>(null)

function createConversation(mode: AgentMode = 'chat'): AgentConversation {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: '新对话',
    mode,
    messages: [],
    createdAt: now,
    updatedAt: now,
  }
}

function loadStore(key: string): ConversationStore {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const value = JSON.parse(raw) as Partial<ConversationStore>
      if (Array.isArray(value.conversations) && value.conversations.length > 0) {
        const conversations = value.conversations
          .slice(0, MAX_STORED_CONVERSATIONS)
          .map(conversation => ({
            ...conversation,
            messages: conversation.messages.map(message => message.status === 'streaming'
              ? { ...message, status: 'stopped' as const }
              : message),
          }))
        const activeId = conversations.some(item => item.id === value.activeId)
          ? value.activeId as string
          : conversations[0].id
        return { key, activeId, conversations }
      }
    }
  } catch {
    // A malformed local draft should not prevent the authenticated layout from opening.
  }
  const conversation = createConversation()
  return { key, activeId: conversation.id, conversations: [conversation] }
}

export function AgentConversationProvider({ children }: { children: ReactNode }) {
  const { activeTenant } = useAuth()
  const request = useBusinessApi()
  const storageKey = `aiplatform-agent-conversations:${activeTenant?.id || 'default'}`
  const [store, setStore] = useState<ConversationStore>(() => loadStore(storageKey))
  const [streamingConversationId, setStreamingConversationId] = useState<string | null>(null)

  useEffect(() => {
    if (store.key === storageKey) return
    setStore(loadStore(storageKey))
    setStreamingConversationId(null)
  }, [storageKey, store.key])

  useEffect(() => {
    if (store.key !== storageKey) return
    const timeout = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          ...store,
          conversations: store.conversations.slice(0, MAX_STORED_CONVERSATIONS),
        }))
      } catch {
        // Storage quota failures must not interrupt the active conversation.
      }
    }, 200)
    return () => window.clearTimeout(timeout)
  }, [storageKey, store])

  const activeConversation = useMemo(
    () => store.conversations.find(item => item.id === store.activeId) || store.conversations[0],
    [store],
  )
  const conversations = useMemo(
    () => [...store.conversations].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [store.conversations],
  )

  const updateConversation = useCallback((
    id: string,
    updater: (conversation: AgentConversation) => AgentConversation,
  ) => {
    setStore(current => current.key !== storageKey ? current : {
      ...current,
      conversations: current.conversations.map(item => item.id === id ? updater(item) : item),
    })
  }, [storageKey])

  const createNewConversation = useCallback((mode: AgentMode = 'chat') => {
    const conversation = createConversation(mode)
    setStore(current => ({
      key: storageKey,
      activeId: conversation.id,
      conversations: [conversation, ...current.conversations].slice(0, MAX_STORED_CONVERSATIONS),
    }))
  }, [storageKey])

  const selectConversation = useCallback((id: string) => {
    setStore(current => current.conversations.some(item => item.id === id)
      ? { ...current, activeId: id }
      : current)
  }, [])

  const deleteConversation = useCallback((id: string) => {
    void request(`/api/v1/agent/conversations/${id}`, { method: 'DELETE' }).catch(() => undefined)
    setStore(current => {
      const remaining = current.conversations.filter(item => item.id !== id)
      if (remaining.length > 0) {
        return {
          ...current,
          activeId: current.activeId === id ? remaining[0].id : current.activeId,
          conversations: remaining,
        }
      }
      const replacement = createConversation()
      return { key: storageKey, activeId: replacement.id, conversations: [replacement] }
    })
  }, [request, storageKey])

  const value = useMemo<AgentConversationContextValue>(() => ({
    activeConversation,
    conversations,
    createNewConversation,
    deleteConversation,
    selectConversation,
    setStreamingConversationId,
    streamingConversationId,
    updateConversation,
  }), [
    activeConversation,
    conversations,
    createNewConversation,
    deleteConversation,
    selectConversation,
    streamingConversationId,
    updateConversation,
  ])

  return <AgentConversationContext.Provider value={value}>{children}</AgentConversationContext.Provider>
}

export function useAgentConversations() {
  const context = useContext(AgentConversationContext)
  if (!context) throw new Error('useAgentConversations must be used within AgentConversationProvider')
  return context
}
