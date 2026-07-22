import { useEffect, useRef, type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { MD } from './Markdown'
import type { Message } from '../types'

interface ChatTranscriptProps {
  messages: Message[]
  isStreaming: boolean
  streamedText: string
  error: string | null
  completion?: ReactNode
}


export default function ChatTranscript({
  messages,
  isStreaming,
  streamedText,
  error,
  completion,
}: ChatTranscriptProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamedText])

  return (
    <div className="flex-1 overflow-y-auto px-5 sm:px-10 lg:px-20 py-5 space-y-4">
      {messages.map(message => {
        const isUser = message.role === 'user'
        if (!isUser && !message.content.trim()) return null
        return (
          <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div className={isUser
              ? 'bg-accent/6 border border-border/60 rounded-2xl rounded-br-md px-4 py-2.5 max-w-[85%] sm:max-w-[70%] text-sm leading-relaxed text-text'
              : 'max-w-[90%] sm:max-w-[70%] text-sm leading-relaxed text-text'}>
              <ReactMarkdown components={MD}>{message.content}</ReactMarkdown>
            </div>
          </div>
        )
      })}

      {completion}

      {isStreaming && (
        <div className="flex justify-start">
          <div className="max-w-[90%] sm:max-w-[70%] text-sm leading-relaxed text-text">
            {streamedText
              ? <ReactMarkdown components={MD}>{streamedText}</ReactMarkdown>
              : <span className="text-text-tertiary">思考中...</span>}
            {streamedText && (
              <span className="inline-block w-1.5 h-4 bg-accent ml-0.5 align-text-bottom animate-pulse-soft" />
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="flex justify-center">
          <div className="bg-danger-muted border border-danger/20 rounded-xl px-3.5 py-2 flex items-center gap-2 text-xs text-danger">
            <AlertCircle size={14} />{error}
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  )
}
