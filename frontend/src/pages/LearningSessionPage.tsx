import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import ChatTranscript from '../components/ChatTranscript'
import CompletionNotice from '../components/CompletionNotice'
import RecallOverlay from '../components/RecallOverlay'
import Spinner from '../components/Spinner'
import VoiceComposer from '../components/VoiceComposer'
import { SessionProvider, useSession } from '../contexts/SessionContext'
import type { LocationState } from '../types'

const STEP_NAMES = ['', '检测精讲', '刻意练习', '长效巩固']


function LearningSessionContent() {
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
  const prevStepRef = useRef(0)
  const initialMessageSentRef = useRef(false)

  const currentStep = session?.current_step ?? 0
  const isComplete = session?.status === 'completed'
  const overlayVisible = currentStep === 2 && !isStreaming && initialized && readyForRecall
  const routeState = (location.state || {}) as LocationState

  useEffect(() => {
    if (!sessionId) return
    setInitialized(false)
    setReadyForRecall(false)
    prevStepRef.current = 0
    initialMessageSentRef.current = false
    loadSession(sessionId).then(() => setInitialized(true))
  }, [loadSession, sessionId])

  useEffect(() => {
    if (!initialized) return
    const previousStep = prevStepRef.current
    prevStepRef.current = currentStep
    if (currentStep === 2 && previousStep === 1) setReadyForRecall(true)
  }, [currentStep, initialized])

  useEffect(() => {
    const initialMessage = routeState.initialMessage
    if (
      !initialized ||
      !session ||
      messages.length > 0 ||
      !initialMessage ||
      initialMessageSentRef.current
    ) return

    initialMessageSentRef.current = true
    sendMessage(initialMessage)
    navigate(location.pathname, {
      replace: true,
      state: { returnTo: routeState.returnTo },
    })
  }, [
    initialized,
    location.pathname,
    messages.length,
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
    if (currentStep === 2 && !readyForRecall) {
      setReadyForRecall(true)
      if (!input.trim()) return
    }
    if (!input.trim()) return
    const content = input
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
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-base text-accent font-medium">{STEP_NAMES[currentStep] || STEP_NAMES[1]}</span>
            <div className="flex items-center gap-2">
              {[1, 2, 3].map(step => (
                <div key={step} className={`rounded-full transition-all duration-500 ${
                  step < currentStep ? 'w-2 h-2 bg-accent/40' :
                  step === currentStep ? 'w-2.5 h-2.5 bg-accent' :
                  'w-2 h-2 bg-border'
                }`} />
              ))}
            </div>
          </div>
        )}
      </div>

      <ChatTranscript
        messages={messages}
        isStreaming={isStreaming}
        streamedText={streamedText}
        error={error}
        completion={isComplete && !isStreaming ? (
          <CompletionNotice
            text={returnToReview ? '复习完成，已安排下次复习' : '学习完成，已自动安排下次复习'}
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
            placeholder={currentStep === 2 && !readyForRecall ? '读完反馈后按 Enter 继续练习' : '请输入...'}
          />
        </div>
      )}
    </div>
  )
}


export default function LearningSessionPage() {
  return <SessionProvider><LearningSessionContent /></SessionProvider>
}
