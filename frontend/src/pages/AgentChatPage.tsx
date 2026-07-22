import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BrainCircuit, Bot, ClipboardCheck, GraduationCap, Square } from 'lucide-react'
import ChatTranscript from '../components/ChatTranscript'
import Spinner from '../components/Spinner'
import VoiceComposer from '../components/VoiceComposer'
import { createAgentChatStream, createAgentConversation, getAgentConversation } from '../lib/api'
import { notifyAgentConversationsChanged } from '../lib/events'
import type { AgentMode, Message } from '../types'

const suggestions = {
  general: ['帮我制定一个项目执行方案', '分析这段代码可能存在的问题', '把复杂概念解释得更清楚'],
  deep: ['比较三个方案并给出决策建议', '拆解这个问题的关键变量与风险', '设计一套可以验证结论的方法'],
}

const homeTools = [
  { key: 'deep', label: '深度思考', icon: BrainCircuit },
  { key: 'prd', label: 'PRD 测试', icon: ClipboardCheck },
  { key: 'study', label: '智能学习', icon: GraduationCap },
] as const

type HomeTool = typeof homeTools[number]['key']

const landingContent = {
  general: {
    title: '通用智能体',
    description: '与你一起理解问题、组织信息并完成具体工作',
    placeholder: '给智能体发送消息...',
    icon: Bot,
  },
  deep: {
    title: '深度思考',
    description: '结构化分析复杂问题，比较方案、风险与验证路径',
    placeholder: '描述需要深入分析的问题...',
    icon: BrainCircuit,
  },
  prd: {
    title: 'PRD 测试',
    description: '解析产品需求，生成可执行测试用例并检查功能覆盖',
    placeholder: '输入或粘贴产品需求...',
    icon: ClipboardCheck,
  },
  study: {
    title: '智能学习',
    description: '围绕一个主题开始检测、练习、回忆与间隔复习',
    placeholder: '输入想学习的内容...',
    icon: GraduationCap,
  },
} as const

export default function AgentChatPage({ mode }: { mode: AgentMode }) {
  const { conversationId } = useParams<{ conversationId: string }>()
  const navigate = useNavigate()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streamedText, setStreamedText] = useState('')
  const [loading, setLoading] = useState(Boolean(conversationId))
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTool, setSelectedTool] = useState<HomeTool | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const streamedRef = useRef('')
  const newlyCreatedIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (conversationId && newlyCreatedIdRef.current === conversationId) {
      newlyCreatedIdRef.current = null
      setLoading(false)
      return
    }
    controllerRef.current?.abort()
    setMessages([])
    setStreamedText('')
    setError(null)
    if (!conversationId) {
      setLoading(false)
      return
    }
    setLoading(true)
    getAgentConversation(conversationId).then(conversation => {
      setMessages(conversation.messages)
    }).catch(() => setError('无法加载此对话')).finally(() => setLoading(false))
  }, [conversationId])

  useEffect(() => () => controllerRef.current?.abort(), [])

  const send = useCallback(async (preset?: string, requestedMode: AgentMode = mode) => {
    const content = (preset ?? input).trim()
    if (!content || isStreaming) return
    setInput('')
    setError(null)
    let id = conversationId
    try {
      if (!id) {
        const conversation = await createAgentConversation(requestedMode)
        id = conversation.id
        newlyCreatedIdRef.current = id
        navigate(requestedMode === 'deep' ? `/deep-think/${id}` : `/agent/${id}`, { replace: true })
      }
      setMessages(current => [...current, {
        id: crypto.randomUUID(), role: 'user', content, step: 0,
        content_type: 'text', metadata: null, created_at: new Date().toISOString(),
      }])
      setIsStreaming(true)
      setStreamedText('')
      streamedRef.current = ''
      controllerRef.current = createAgentChatStream(id, content, {
        onToken: token => {
          streamedRef.current += token
          setStreamedText(streamedRef.current)
        },
        onComplete: text => {
          const finalText = text || streamedRef.current
          if (finalText) setMessages(current => [...current, {
            id: crypto.randomUUID(), role: 'assistant', content: finalText, step: 0,
            content_type: 'text', metadata: null, created_at: new Date().toISOString(),
          }])
          setStreamedText('')
          setIsStreaming(false)
          notifyAgentConversationsChanged()
        },
        onError: streamError => {
          setError(streamError.message)
          setStreamedText('')
          setIsStreaming(false)
        },
      })
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : '创建对话失败')
      setIsStreaming(false)
    }
  }, [conversationId, input, isStreaming, mode, navigate])

  const submit = useCallback(() => {
    const content = input.trim()
    if (!content || isStreaming) return
    if (!conversationId && mode === 'general') {
      if (selectedTool === 'prd') {
        navigate('/tools/prd-testcases', { state: { initialPrd: content } })
        return
      }
      if (selectedTool === 'study') {
        navigate('/study', { state: { draft: content } })
        return
      }
      if (selectedTool === 'deep') {
        send(undefined, 'deep')
        return
      }
    }
    send()
  }, [conversationId, input, isStreaming, mode, navigate, selectedTool, send])

  if (loading) return <div className="flex-1 flex items-center justify-center"><Spinner /></div>

  const landingKey = mode === 'deep' ? 'deep' : selectedTool || 'general'
  const landing = landingContent[landingKey]
  const LandingIcon = landing.icon
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-page">
      {messages.length === 0 && !isStreaming ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-11 h-11 flex items-center justify-center mb-5 text-accent">
            <LandingIcon size={27} strokeWidth={1.5} />
          </div>
          <h2 className="font-display text-2xl text-text font-medium mb-2">{landing.title}</h2>
          <p className="text-sm text-text-secondary max-w-md leading-relaxed">{landing.description}</p>
          {mode === 'deep' && <div className="mt-7 grid gap-2 w-full max-w-lg sm:grid-cols-3">
            {suggestions.deep.map(item => <button key={item} onClick={() => send(item)} className="min-h-20 text-left px-3.5 py-3 border border-border rounded-lg text-xs leading-relaxed text-text-secondary hover:text-text hover:bg-surface transition-colors">{item}</button>)}
          </div>}
        </div>
      ) : (
        <ChatTranscript messages={messages} isStreaming={isStreaming} streamedText={streamedText} error={error} />
      )}

      {messages.length === 0 && error && <p className="px-6 pb-2 text-xs text-danger text-center">{error}</p>}
      <div className="shrink-0 w-full max-w-3xl mx-auto px-5 sm:px-6 pb-6">
        {mode === 'general' && !conversationId && (
          <div className="flex items-center gap-1.5 mb-2 overflow-x-auto" role="navigation" aria-label="选择智能体">
            {homeTools.map(tool => (
              <button key={tool.key} onClick={() => setSelectedTool(current => current === tool.key ? null : tool.key)} aria-pressed={selectedTool === tool.key} className={`h-8 shrink-0 inline-flex items-center gap-1.5 px-2.5 rounded-md border text-xs transition-colors ${selectedTool === tool.key ? 'border-accent bg-accent text-page' : 'border-border bg-page text-text-secondary hover:text-text hover:bg-surface'}`}>
                <tool.icon size={13} />{tool.label}
              </button>
            ))}
          </div>
        )}
        <VoiceComposer value={input} onChange={setInput} onSubmit={submit} placeholder={landing.placeholder} disabled={isStreaming} autoFocus />
        {isStreaming && (
          <button onClick={() => { controllerRef.current?.abort(); setIsStreaming(false); setStreamedText('') }} className="mt-2 mx-auto flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text">
            <Square size={10} fill="currentColor" /> 停止生成
          </button>
        )}
      </div>
    </div>
  )
}
