import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createChatStream, getSession } from '../lib/api'
import { notifySessionsChanged } from '../lib/events'
import type { AIMessageMetadata, Message, SessionData } from '../types'

const MARKER_RE = /\[(?:STEP:\d|SESSION_COMPLETE|REVIEW_COMPLETE|MASTERY:\d{1,3}|RECALL_ROUND:\d|RECALL_PASS)\]\s*/g

function stripMarkers(text: string) {
  return text.replace(MARKER_RE, '').trim()
}

interface SendMessageOptions {
  alreadySaved?: boolean
}

interface SessionContextValue {
  session: SessionData | null
  messages: Message[]
  isStreaming: boolean
  streamedText: string
  error: string | null
  loadSession: (sessionId: string) => Promise<void>
  sendMessage: (content: string, options?: SendMessageOptions) => void
  cancelStream: () => void
}

const SessionContext = createContext<SessionContextValue | null>(null)


export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamedText, setStreamedText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const rawTextRef = useRef('')
  const cleanTextRef = useRef('')
  const metadataRef = useRef<AIMessageMetadata>({})
  const loadRequestRef = useRef(0)

  const resetStream = useCallback(() => {
    setIsStreaming(false)
    setStreamedText('')
    rawTextRef.current = ''
    cleanTextRef.current = ''
    metadataRef.current = {}
  }, [])

  const loadSession = useCallback(async (sessionId: string) => {
    const requestId = ++loadRequestRef.current
    const detail = await getSession(sessionId)
    if (requestId !== loadRequestRef.current) return
    const { messages: loadedMessages, ...loadedSession } = detail
    setSession(loadedSession)
    setMessages(loadedMessages)
  }, [])

  const sendMessage = useCallback((content: string, options?: SendMessageOptions) => {
    if (!session || !content.trim()) return
    setError(null)

    if (!options?.alreadySaved) {
      setMessages(current => [...current, {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        step: session.current_step,
        content_type: 'text',
        metadata: null,
        created_at: new Date().toISOString(),
      }])
    }

    setIsStreaming(true)
    setStreamedText('')
    rawTextRef.current = ''
    cleanTextRef.current = ''

    controllerRef.current = createChatStream(
      session.id,
      content,
      options?.alreadySaved ?? false,
      {
        onToken: token => {
          rawTextRef.current += token
          setStreamedText(stripMarkers(rawTextRef.current))
        },
        onMetadata: metadata => {
          metadataRef.current = metadata
          cleanTextRef.current = metadata.clean_text || stripMarkers(rawTextRef.current)
          setSession(current => {
            if (!current) return current
            const next = { ...current }
            if (metadata.session_complete) {
              next.status = current.mode === 'review' ? 'archived' : 'completed'
              next.current_step = 3
            } else if (metadata.step_transition && metadata.step_transition > 0) {
              next.current_step = metadata.step_transition
              next.status = 'active'
            }
            if (metadata.mastery_level != null) {
              next.mastery_level = metadata.mastery_level
              next.mastery_assessment = metadata.mastery_assessment ?? null
            }
            return next
          })
          notifySessionsChanged()
        },
        onComplete: () => {
          const finalText = cleanTextRef.current || stripMarkers(rawTextRef.current)
          if (finalText) {
            setMessages(current => [...current, {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: finalText,
              step: session.current_step,
              content_type: 'text',
              metadata: { ...metadataRef.current },
              created_at: new Date().toISOString(),
            }])
          }
          resetStream()
        },
        onError: streamError => {
          setError(streamError.message)
          resetStream()
        },
      },
    )
  }, [resetStream, session])

  const cancelStream = useCallback(() => {
    controllerRef.current?.abort()
    resetStream()
  }, [resetStream])

  useEffect(() => () => controllerRef.current?.abort(), [])

  return (
    <SessionContext.Provider value={{
      session,
      messages,
      isStreaming,
      streamedText,
      error,
      loadSession,
      sendMessage,
      cancelStream,
    }}>
      {children}
    </SessionContext.Provider>
  )
}


export function useSession() {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession must be used within SessionProvider')
  return context
}
