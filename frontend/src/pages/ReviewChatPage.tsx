import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import ChatTranscript from '../components/ChatTranscript'
import CompletionNotice from '../components/CompletionNotice'
import RecallOverlay from '../components/RecallOverlay'
import Spinner from '../components/Spinner'
import VoiceComposer from '../components/VoiceComposer'
import { SessionProvider, useSession } from '../contexts/SessionContext'
import type { AIMessageMetadata, LocationState } from '../types'

const READY_PATTERN = /^(我)?(已经)?(准备好(了)?|开始(吧)?|继续(吧)?|再来(一次)?|来吧|可以了|好了|来|ok|ready|嗯|好|可以|来了)[!！。.]?$/i


function ReviewChatContent() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const {
    session,
    messages,
    isStreaming,
    streamedText,
    error,
    loadSession,
    sendMessage,
    cancelStream,
  } = useSession()
  const [input, setInput] = useState('')
  const [recallText, setRecallText] = useState('')
  const [initialized, setInitialized] = useState(false)
  const [readyForRecall, setReadyForRecall] = useState(false)
  const initialMessageSentRef = useRef(false)
  const routeState = (location.state || {}) as LocationState

  const isComplete = session?.status === 'completed' || session?.status === 'archived'
  const lastAssistant = [...messages].reverse().find(message => message.role === 'assistant')
  const lastMetadata = (lastAssistant?.metadata || {}) as AIMessageMetadata
  const isWaitingForRecall = Boolean(
    lastAssistant &&
    !lastMetadata.recall_passed &&
    !isStreaming &&
    initialized,
  )
  const overlayVisible = isWaitingForRecall && readyForRecall && !isStreaming

  useEffect(() => {
    if (!sessionId) return
    setInitialized(false)
    setReadyForRecall(false)
    initialMessageSentRef.current = false
    loadSession(sessionId).then(() => setInitialized(true))
  }, [loadSession, sessionId])

  useEffect(() => {
    const initialMessage = routeState.initialMessage
    if (!initialized || !session || !initialMessage || initialMessageSentRef.current) return
    initialMessageSentRef.current = true
    sendMessage(initialMessage, { alreadySaved: true })
    navigate(location.pathname, {
      replace: true,
      state: { returnTo: routeState.returnTo },
    })
  }, [
    initialized,
    location.pathname,
    navigate,
    routeState.initialMessage,
    routeState.returnTo,
    sendMessage,
    session,
  ])

  const handleSend = () => {
    if (isStreaming) {
      cancelStream()
      return
    }
    const content = input.trim()
    if (!content) return
    if (isWaitingForRecall && READY_PATTERN.test(content)) {
      setReadyForRecall(true)
      setRecallText('')
      setInput('')
      return
    }
    setInput('')
    sendMessage(content)
  }

  if (!session) {
    return <div className="flex-1 flex items-center justify-center"><Spinner /></div>
  }

  const returnToReview = routeState.returnTo === 'review'

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-page relative">
      <div className="shrink-0 flex items-center pl-12 pr-4 md:px-5 py-3 border-b border-border/60 bg-surface/50">
        <div className="flex-1 flex flex-col items-center min-w-0">
          <h1 className="font-display text-base text-text font-medium truncate max-w-full">{session.title}</h1>
        </div>
        {!isComplete && (
          <span className="text-xs text-text-tertiary px-2.5 py-0.5 bg-accent/8 rounded-full shrink-0">复习中</span>
        )}
      </div>

      <ChatTranscript
        messages={messages}
        isStreaming={isStreaming}
        streamedText={streamedText}
        error={error}
        completion={isComplete && !isStreaming ? (
          <CompletionNotice
            text="复习完成！已按艾宾浩斯曲线安排下次复习"
            action={returnToReview ? '继续复习' : '返回首页'}
            onAction={() => navigate(returnToReview ? '/study/review/batch' : '/study')}
          />
        ) : undefined}
      />

      <RecallOverlay
        visible={overlayVisible}
        value={recallText}
        onChange={setRecallText}
        onSubmit={() => {
          if (!recallText.trim()) return
          const content = recallText
          setRecallText('')
          setReadyForRecall(false)
          sendMessage(content)
        }}
      />

      {!overlayVisible && !isComplete && (
        <div className="shrink-0 w-full max-w-3xl mx-auto px-6 pb-8">
          <VoiceComposer
            value={input}
            onChange={setInput}
            onSubmit={handleSend}
            placeholder={isWaitingForRecall
              ? '准备好了就回复“准备好了”，然后按 Enter 开始复现'
              : '输入你的回忆内容，或发送“忘了”获取帮助...'}
          />
        </div>
      )}
    </div>
  )
}


export default function ReviewChatPage() {
  return <SessionProvider><ReviewChatContent /></SessionProvider>
}
