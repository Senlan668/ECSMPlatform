import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Bot,
  BrainCircuit,
  CircleAlert,
  ExternalLink,
  FileText,
  LoaderCircle,
  MessageCircle,
  Paperclip,
  Plus,
  Presentation,
  Send,
  Square,
  Telescope,
  X,
} from 'lucide-react'
import { consumeAgentStream, eventRecommendations, eventReferences, eventText } from '../features/agent/api'
import { useAgentConversations } from '../features/agent/AgentConversationContext'
import type {
  AgentFile,
  AgentMessage,
  AgentMode,
  AgentRuntimeHealth,
  AgentStreamEvent,
} from '../features/agent/types'
import { useBusinessApi, useBusinessStreamApi } from '../lib/businessApi'
import { jsonRequest } from '../lib/http'

const modeLabels: Record<AgentMode, string> = {
  chat: '问题',
  file: '文件问答',
  pptx: 'PPT 创作',
  deep: '深度研究',
}

const suggestions = [
  '分析今天值得关注的 AI 行业动态',
  '调研直播电商智能客服的市场格局',
  '生成一份季度内容运营复盘方案',
  '梳理新品上市的整合营销思路',
]

interface UploadResult {
  data?: {
    fileId?: string
    fileName?: string
    fileSize?: number
  }
  message?: string
}

function modeLabel(mode: AgentMode) {
  return modeLabels[mode]
}

function modePlaceholder(mode: AgentMode) {
  if (mode === 'file') return '围绕文件提问'
  if (mode === 'pptx') return '描述要创作的 PPT'
  if (mode === 'deep') return '输入需要深度研究的主题'
  return '输入问题'
}

export default function AgentWorkspacePage() {
  const request = useBusinessApi()
  const streamRequest = useBusinessStreamApi()
  const {
    activeConversation,
    createNewConversation: createStoredConversation,
    setStreamingConversationId,
    streamingConversationId,
    updateConversation,
  } = useAgentConversations()
  const [draft, setDraft] = useState('')
  const [uploading, setUploading] = useState(false)
  const [composerError, setComposerError] = useState('')
  const [health, setHealth] = useState<AgentRuntimeHealth | null>(null)
  const [healthError, setHealthError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const messageEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    setHealthError('')
    request<AgentRuntimeHealth>('/api/v1/agent/health')
      .then(value => { if (!cancelled) setHealth(value) })
      .catch(reason => {
        if (!cancelled) {
          setHealth(null)
          setHealthError(reason instanceof Error ? reason.message : 'Agent 运行时不可用')
        }
      })
    return () => { cancelled = true }
  }, [request])


  useEffect(() => {
    setDraft('')
    setComposerError('')
  }, [activeConversation?.id])

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: 'end' })
  }, [activeConversation?.messages])

  function createNewConversation(mode: AgentMode = 'chat') {
    createStoredConversation(mode)
    setDraft('')
    setComposerError('')
  }

  function setMode(mode: AgentMode) {
    if (!activeConversation || streamingConversationId) return
    updateConversation(activeConversation.id, conversation => ({
      ...conversation,
      mode,
      updatedAt: new Date().toISOString(),
    }))
  }

  async function uploadFile(file: File) {
    if (!activeConversation) return
    setUploading(true)
    setComposerError('')
    const form = new FormData()
    form.append('file', file)
    try {
      const result = await request<UploadResult>('/api/v1/agent/files', { method: 'POST', body: form })
      const fileId = result.data?.fileId
      if (!fileId) throw new Error(result.message || '文件上传未返回文件 ID')
      const uploaded: AgentFile = {
        id: fileId,
        name: result.data?.fileName || file.name,
        size: result.data?.fileSize || file.size,
      }
      updateConversation(activeConversation.id, conversation => ({
        ...conversation,
        mode: 'file',
        file: uploaded,
        updatedAt: new Date().toISOString(),
      }))
    } catch (reason) {
      setComposerError(reason instanceof Error ? reason.message : '文件上传失败')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function applyStreamEvent(conversationId: string, messageId: string, event: AgentStreamEvent) {
    const value = event.content ?? event.data
    updateConversation(conversationId, conversation => ({
      ...conversation,
      updatedAt: new Date().toISOString(),
      messages: conversation.messages.map(message => {
        if (message.id !== messageId) return message
        if (event.type === 'thinking') return { ...message, thinking: `${message.thinking || ''}${eventText(value)}` }
        if (event.type === 'text') return { ...message, content: `${message.content}${eventText(value)}` }
        if (event.type === 'reference') return { ...message, references: eventReferences(value) }
        if (event.type === 'recommend') return { ...message, recommendations: eventRecommendations(value) }
        if (event.type === 'error') {
          const error = eventText(value) || 'Agent 执行失败'
          return { ...message, status: 'error', error }
        }
        return message
      }),
    }))
  }

  async function sendMessage(override?: string) {
    const conversation = activeConversation
    const messageText = (override ?? draft).trim()
    if (!conversation || !messageText || streamingConversationId) return
    const requestMode = conversation.mode
    if (requestMode === 'file' && !conversation.file) {
      setComposerError('请先上传用于问答的文件')
      return
    }

    setComposerError('')
    setDraft('')
    const now = new Date().toISOString()
    const userMessage: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageText,
      createdAt: now,
    }
    const assistantId = crypto.randomUUID()
    const assistantMessage: AgentMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      createdAt: now,
    }
    updateConversation(conversation.id, current => ({
      ...current,
      mode: requestMode,
      title: current.messages.length === 0 ? messageText.slice(0, 28) : current.title,
      messages: [...current.messages, userMessage, assistantMessage],
      updatedAt: now,
    }))

    const controller = new AbortController()
    abortRef.current = controller
    setStreamingConversationId(conversation.id)
    try {
      const response = await streamRequest(
        `/api/v1/agent/conversations/${conversation.id}/messages/stream`,
        {
          ...jsonRequest('POST', {
            message: messageText,
            mode: requestMode,
            fileId: conversation.file?.id,
          }),
          signal: controller.signal,
        },
      )
      await consumeAgentStream(response, event => applyStreamEvent(conversation.id, assistantId, event))
      updateConversation(conversation.id, current => ({
        ...current,
        messages: current.messages.map(message => message.id === assistantId && message.status === 'streaming'
          ? { ...message, status: 'complete' }
          : message),
      }))
    } catch (reason) {
      const stopped = controller.signal.aborted
      const error = reason instanceof Error ? reason.message : 'Agent 请求失败'
      updateConversation(conversation.id, current => ({
        ...current,
        messages: current.messages.map(message => message.id === assistantId
          ? { ...message, status: stopped ? 'stopped' : 'error', error: stopped ? undefined : error }
          : message),
      }))
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setStreamingConversationId(current => current === conversation.id ? null : current)
    }
  }

  function stopGeneration() {
    if (!streamingConversationId) return
    const conversationId = streamingConversationId
    void request(`/api/v1/agent/conversations/${conversationId}/stop`, { method: 'POST' }).catch(() => undefined)
    abortRef.current?.abort()
    setStreamingConversationId(null)
  }

  const runtimeLabel = healthError
    ? '运行时离线'
    : health?.modelConfigured ? 'Agent 在线' : health ? '模型待配置' : '正在连接'

  return (
    <section className="flex-1 min-w-0 min-h-0 flex flex-col bg-page text-text overflow-hidden">
      <header className="relative z-10 shrink-0 border-b border-border bg-page px-3 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <div className="flex shrink-0 items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-accent text-page flex items-center justify-center"><Bot size={17} /></div>
            <div className="hidden min-w-0 sm:block">
              <div className="text-sm font-semibold">蓝鲲</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-text-tertiary">
                <span className={`h-1.5 w-1.5 rounded-full ${healthError ? 'bg-danger' : health?.modelConfigured ? 'bg-success' : 'bg-text-tertiary'}`} />
                <span className="max-w-28 truncate" title={healthError || runtimeLabel}>{runtimeLabel}</span>
              </div>
            </div>
          </div>

          <div
            className="flex min-w-0 flex-1 items-center gap-2 px-1 text-xs text-text-secondary sm:px-4"
            aria-label={`当前会话：${activeConversation?.title || '新对话'}`}
          >
            <MessageCircle size={14} className="shrink-0 text-text-tertiary" />
            <span className="min-w-0 truncate">{activeConversation?.title || '新对话'}</span>
            <span className="hidden shrink-0 text-[10px] text-text-tertiary md:inline">{modeLabel(activeConversation?.mode || 'chat')}</span>
          </div>

          <button
            type="button"
            className="w-9 h-9 rounded-md border border-border flex items-center justify-center text-text-tertiary hover:border-text-tertiary hover:text-text disabled:opacity-40"
            onClick={() => createNewConversation()}
            disabled={Boolean(streamingConversationId)}
            title="新建会话"
            aria-label="新建会话"
          >
            <Plus size={16} />
          </button>
        </div>
      </header>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {!activeConversation || activeConversation.messages.length === 0 ? (
            <div className="min-h-full flex items-center justify-center px-5 py-10">
              <div className="w-full max-w-2xl text-center animate-enter">
                <div className="mx-auto w-12 h-12 rounded-lg bg-accent text-page flex items-center justify-center"><Bot size={24} /></div>
                <h1 className="mt-5 font-display text-3xl font-medium">蓝鲲</h1>
                <p className="mt-3 text-sm text-text-secondary">今天想推进什么工作？</p>
                <div className="mt-8 grid gap-2 sm:grid-cols-2 text-left">
                  {suggestions.map(suggestion => (
                    <button
                      key={suggestion}
                      onClick={() => { void sendMessage(suggestion) }}
                      className="min-h-14 rounded-md border border-border px-4 py-3 text-sm leading-5 text-text-secondary hover:border-text-tertiary hover:text-text"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto px-4 py-6 sm:px-8 sm:py-8 space-y-7">
              {activeConversation.messages.map(message => message.role === 'user' ? (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[min(82%,720px)] rounded-lg bg-surface px-4 py-3 text-sm leading-6 whitespace-pre-wrap">{message.content}</div>
                </div>
              ) : (
                <article key={message.id} className="flex items-start gap-3">
                  <div className="mt-0.5 w-7 h-7 shrink-0 rounded-md bg-accent text-page flex items-center justify-center"><Bot size={14} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs font-medium">
                      <span>蓝鲲</span>
                      {message.status === 'streaming' && <LoaderCircle size={12} className="animate-spin text-text-tertiary" />}
                      {message.status === 'stopped' && <span className="text-[10px] font-normal text-text-tertiary">已停止</span>}
                    </div>

                    {message.thinking && (
                      <details className="mt-3 border-l-2 border-border pl-3 text-xs text-text-secondary">
                        <summary className="cursor-pointer select-none flex items-center gap-1.5 text-text-tertiary"><BrainCircuit size={13} />思考过程</summary>
                        <div className="mt-2 whitespace-pre-wrap leading-5">{message.thinking}</div>
                      </details>
                    )}

                    {message.content ? (
                      <div className="mt-3 text-sm leading-7 text-text-secondary break-words [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_h1]:my-4 [&_h1]:text-xl [&_h2]:my-3 [&_h2]:text-lg [&_h3]:my-3 [&_h3]:text-base [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-surface [&_pre]:p-3 [&_code]:font-mono [&_code]:text-[12px] [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3">
                        <ReactMarkdown components={{
                          a: props => <a {...props} target="_blank" rel="noreferrer" className="text-text underline underline-offset-2" />,
                        }}>{message.content}</ReactMarkdown>
                      </div>
                    ) : message.status === 'streaming' ? (
                      <div className="mt-4 flex items-center gap-1.5" aria-label="正在生成">
                        {[0, 1, 2].map(index => <span key={index} className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-pulse-soft" style={{ animationDelay: `${index * 160}ms` }} />)}
                      </div>
                    ) : null}

                    {message.error && (
                      <div role="alert" className="mt-3 flex items-start gap-2 border-y border-danger/30 bg-danger-muted px-3 py-2.5 text-xs text-danger">
                        <CircleAlert size={14} className="mt-0.5 shrink-0" /><span>{message.error}</span>
                      </div>
                    )}

                    {message.references && message.references.length > 0 && (
                      <div className="mt-5 border-t border-border pt-3">
                        <div className="text-[11px] font-medium text-text-tertiary">参考来源</div>
                        <div className="mt-2 space-y-1.5">
                          {message.references.map(reference => (
                            <a key={`${reference.url}-${reference.title}`} href={reference.url} target="_blank" rel="noreferrer" className="flex items-start gap-2 rounded-md px-2 py-2 text-xs text-text-secondary hover:bg-surface hover:text-text">
                              <ExternalLink size={13} className="mt-0.5 shrink-0" />
                              <span className="min-w-0"><span className="block truncate">{reference.title}</span>{reference.snippet && <span className="mt-0.5 block line-clamp-2 text-[10px] leading-4 text-text-tertiary">{reference.snippet}</span>}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {message.recommendations && message.recommendations.length > 0 && message.status !== 'streaming' && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {message.recommendations.map(recommendation => (
                          <button key={recommendation} onClick={() => void sendMessage(recommendation)} className="rounded-md border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-text-tertiary hover:text-text">
                            {recommendation}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              ))}
              <div ref={messageEndRef} />
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-border bg-page px-3 py-3 sm:px-6 sm:py-4">
          <div className="max-w-4xl mx-auto">
            {activeConversation?.file && (
              <div className="mb-2 flex items-center gap-2 text-xs text-text-secondary">
                <FileText size={14} />
                <span className="max-w-[min(70vw,520px)] truncate">{activeConversation.file.name}</span>
                <button
                  onClick={() => updateConversation(activeConversation.id, conversation => ({
                    ...conversation,
                    file: undefined,
                    mode: conversation.mode === 'file' ? 'chat' : conversation.mode,
                    updatedAt: new Date().toISOString(),
                  }))}
                  className="w-6 h-6 flex items-center justify-center text-text-tertiary hover:text-text"
                  title="移除文件"
                  aria-label="移除文件"
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {!healthError && health && !health.modelConfigured && (
              <div className="mb-2 text-xs text-text-tertiary">Agent 运行时在线，模型密钥尚未配置。</div>
            )}
            {composerError && <div role="alert" className="mb-2 text-xs text-danger">{composerError}</div>}

            <form
              onSubmit={event => { event.preventDefault(); void sendMessage() }}
              className="rounded-lg border border-border bg-surface p-2 focus-within:border-text-tertiary"
            >
              <textarea
                value={draft}
                onChange={event => setDraft(event.target.value.slice(0, 12000))}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void sendMessage()
                  }
                }}
                rows={2}
                placeholder={modePlaceholder(activeConversation?.mode || 'chat')}
                className="block w-full resize-none bg-transparent px-2 py-1.5 text-sm leading-6 outline-none placeholder:text-text-tertiary"
                disabled={Boolean(streamingConversationId)}
                aria-label="消息"
              />
              <div className="mt-1 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-0.5" role="toolbar" aria-label="创作模式">
                  <button
                    type="button"
                    onClick={() => setMode('chat')}
                    disabled={Boolean(streamingConversationId)}
                    aria-label="问题模式"
                    aria-pressed={activeConversation?.mode === 'chat'}
                    className={`w-8 h-8 rounded flex items-center justify-center transition-colors disabled:opacity-40 ${activeConversation?.mode === 'chat' ? 'bg-page text-text' : 'text-text-tertiary hover:text-text'}`}
                    title="问题"
                  >
                    <MessageCircle size={15} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    aria-label="选择文件"
                    accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                    onChange={event => {
                      const file = event.target.files?.[0]
                      if (file) void uploadFile(file)
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || Boolean(streamingConversationId)}
                    aria-pressed={activeConversation?.mode === 'file'}
                    className={`w-8 h-8 rounded flex items-center justify-center transition-colors disabled:opacity-40 ${activeConversation?.mode === 'file' ? 'bg-page text-text' : 'text-text-tertiary hover:text-text'}`}
                    title="上传文件并进入文件问答"
                    aria-label="上传文件"
                  >
                    {uploading ? <LoaderCircle size={15} className="animate-spin" /> : <Paperclip size={15} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('pptx')}
                    disabled={Boolean(streamingConversationId)}
                    aria-label="PPT 创作"
                    aria-pressed={activeConversation?.mode === 'pptx'}
                    className={`w-8 h-8 rounded flex items-center justify-center transition-colors disabled:opacity-40 ${activeConversation?.mode === 'pptx' ? 'bg-page text-text' : 'text-text-tertiary hover:text-text'}`}
                    title="PPT 创作"
                  >
                    <Presentation size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('deep')}
                    disabled={Boolean(streamingConversationId)}
                    aria-label="深度研究"
                    aria-pressed={activeConversation?.mode === 'deep'}
                    className={`w-8 h-8 rounded flex items-center justify-center transition-colors disabled:opacity-40 ${activeConversation?.mode === 'deep' ? 'bg-page text-text' : 'text-text-tertiary hover:text-text'}`}
                    title="深度研究"
                  >
                    <Telescope size={15} />
                  </button>
                  <span className="ml-1 truncate text-[10px] text-text-tertiary">{modeLabel(activeConversation?.mode || 'chat')}</span>
                </div>

                {streamingConversationId === activeConversation?.id ? (
                  <button type="button" onClick={stopGeneration} className="w-9 h-9 rounded-md bg-accent text-page flex items-center justify-center" title="停止生成" aria-label="停止生成"><Square size={14} fill="currentColor" /></button>
                ) : (
                  <button type="submit" disabled={!draft.trim() || Boolean(streamingConversationId)} className="w-9 h-9 rounded-md bg-accent text-page flex items-center justify-center disabled:opacity-35" title="发送" aria-label="发送"><Send size={15} /></button>
                )}
              </div>
            </form>
          </div>
        </footer>
    </section>
  )
}
