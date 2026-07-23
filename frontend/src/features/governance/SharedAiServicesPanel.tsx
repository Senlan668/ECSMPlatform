import { useCallback, useEffect, useMemo, useState } from 'react'
import { Braces, Database, MemoryStick, Play, RefreshCw, Router, Send, ServerCog, Trash2, UserRoundSearch } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useBusinessApi } from '../../lib/businessApi'
import { jsonRequest } from '../../lib/http'
import { CollectionState, EmptyWorkspace, StatusText } from '../../components/WorkspaceShell'

const API = '/api/v1/governance/shared-services'
const serviceCatalog = [
  { id: 'llm-gateway', label: 'LLM 网关', detail: '对话、Embedding 与模型路由', icon: Router },
  { id: 'rag-service', label: 'RAG 服务', detail: '文档摄取与租户知识检索', icon: Database },
  { id: 'memory-service', label: '共享记忆', detail: '会话记忆与用户事实', icon: MemoryStick },
  { id: 'prompt-hub', label: 'Prompt Hub', detail: 'Prompt 发现与参数渲染', icon: Braces },
] as const

type ServiceId = typeof serviceCatalog[number]['id']
type AgentId = 'customer-service' | 'writing-assistant'
type AgentMessage = { id: string; role: 'user' | 'assistant' | 'system'; content: string }

interface ToolDefinition {
  name: string
  description: string
  input_schema?: {
    properties?: Record<string, { type?: string; default?: unknown }>
    required?: string[]
  }
}

interface PromptDefinition {
  name: string
  description: string
  arguments?: Array<{ name: string; description: string; required: boolean }>
}

interface ServiceHealth {
  service: string
  status: 'ok' | 'error'
  tools?: number
  message?: string
}

interface HealthResponse {
  status: 'ok' | 'degraded'
  services: Record<string, ServiceHealth>
}

interface QuotaUsage {
  project_id: string
  date: string
  used_tokens: number
  daily_limit: number
  remaining: number
}

function initialValue(type?: string, fallback?: unknown) {
  if (fallback !== undefined) return fallback
  if (type === 'array') return []
  if (type === 'object') return {}
  if (type === 'integer' || type === 'number') return 0
  if (type === 'boolean') return false
  return ''
}

function toolArguments(tool?: ToolDefinition) {
  const values: Record<string, unknown> = {}
  Object.entries(tool?.input_schema?.properties || {}).forEach(([name, property]) => {
    if (name === 'project_id' || name === 'source_project') return
    values[name] = initialValue(property.type, property.default)
  })
  return JSON.stringify(values, null, 2)
}

function promptArguments(prompt?: PromptDefinition) {
  return JSON.stringify(Object.fromEntries((prompt?.arguments || []).map(argument => [argument.name, ''])), null, 2)
}

function parseArguments(value: string) {
  const parsed = JSON.parse(value || '{}') as unknown
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('参数必须是 JSON 对象')
  return parsed as Record<string, unknown>
}

function formattedResult(value: unknown) {
  return JSON.stringify(value, null, 2)
}

export default function SharedAiServicesPanel() {
  const request = useBusinessApi()
  const { activeTenant } = useAuth()
  const [service, setService] = useState<ServiceId>('prompt-hub')
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [quota, setQuota] = useState<QuotaUsage | null>(null)
  const [tools, setTools] = useState<ToolDefinition[]>([])
  const [prompts, setPrompts] = useState<PromptDefinition[]>([])
  const [toolName, setToolName] = useState('')
  const [promptName, setPromptName] = useState('')
  const [toolInput, setToolInput] = useState('{}')
  const [promptInput, setPromptInput] = useState('{}')
  const [result, setResult] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [agent, setAgent] = useState<AgentId>('customer-service')
  const [agentSessions, setAgentSessions] = useState<Partial<Record<AgentId, string>>>({})
  const [agentMessages, setAgentMessages] = useState<Partial<Record<AgentId, AgentMessage[]>>>({})
  const [agentInput, setAgentInput] = useState('')
  const [writingStyle, setWritingStyle] = useState('正式')
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentError, setAgentError] = useState('')

  const selectedTool = useMemo(() => tools.find(tool => tool.name === toolName), [toolName, tools])
  const selectedPrompt = useMemo(() => prompts.find(prompt => prompt.name === promptName), [promptName, prompts])

  const loadOverview = useCallback(async () => {
    const [healthResult, quotaResult] = await Promise.all([
      request<HealthResponse>(`${API}/health`),
      request<QuotaUsage>(`${API}/quota`),
    ])
    setHealth(healthResult)
    setQuota(quotaResult)
  }, [request])

  const loadCatalog = useCallback(async (nextService: ServiceId) => {
    const [toolResult, promptResult] = await Promise.all([
      request<{ tools: ToolDefinition[] }>(`${API}/${nextService}/tools`),
      request<{ prompts: PromptDefinition[] }>(`${API}/${nextService}/prompts`),
    ])
    const nextTools = toolResult.tools || []
    const nextPrompts = promptResult.prompts || []
    setTools(nextTools)
    setPrompts(nextPrompts)
    setToolName(nextTools[0]?.name || '')
    setPromptName(nextPrompts[0]?.name || '')
    setToolInput(toolArguments(nextTools[0]))
    setPromptInput(promptArguments(nextPrompts[0]))
  }, [request])

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      await Promise.all([loadOverview(), loadCatalog(service)])
    } catch (reason) {
      setHealth(null)
      setQuota(null)
      setTools([])
      setPrompts([])
      setError(reason instanceof Error ? reason.message : '共享 AI 服务加载失败')
    } finally {
      setLoading(false)
    }
  }, [loadCatalog, loadOverview, service])

  useEffect(() => { void reload() }, [activeTenant?.id, reload])

  function selectTool(name: string) {
    setToolName(name)
    setPromptName('')
    setToolInput(toolArguments(tools.find(tool => tool.name === name)))
    setResult(null)
    setError('')
  }

  function selectPrompt(name: string) {
    setToolName('')
    setPromptName(name)
    setPromptInput(promptArguments(prompts.find(prompt => prompt.name === name)))
    setResult(null)
    setError('')
  }

  async function callTool() {
    if (!toolName) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      setResult(await request(`${API}/tools/call`, jsonRequest('POST', {
        service,
        tool: toolName,
        arguments: parseArguments(toolInput),
      })))
      setQuota(await request<QuotaUsage>(`${API}/quota`))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'MCP 工具调用失败')
    } finally {
      setLoading(false)
    }
  }

  async function renderPrompt() {
    if (!promptName) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      setResult(await request(`${API}/prompts/render`, jsonRequest('POST', {
        service,
        prompt: promptName,
        arguments: parseArguments(promptInput),
      })))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'MCP Prompt 渲染失败')
    } finally {
      setLoading(false)
    }
  }

  async function sendAgentMessage() {
    const message = agentInput.trim()
    if (!message || agentLoading) return
    const userMessage: AgentMessage = { id: crypto.randomUUID(), role: 'user', content: message }
    setAgentMessages(current => ({ ...current, [agent]: [...(current[agent] || []), userMessage] }))
    setAgentInput(''); setAgentError(''); setAgentLoading(true)
    try {
      const response = await request<{ reply: string; session_id: string }>(`${API}/agents/${agent}/chat`, jsonRequest('POST', {
        message,
        sessionId: agentSessions[agent],
        style: writingStyle,
      }))
      setAgentSessions(current => ({ ...current, [agent]: response.session_id }))
      setAgentMessages(current => ({ ...current, [agent]: [...(current[agent] || []), {
        id: crypto.randomUUID(), role: 'assistant', content: response.reply,
      }] }))
      setQuota(await request<QuotaUsage>(`${API}/quota`))
    } catch (reason) {
      setAgentError(reason instanceof Error ? reason.message : 'Agent 工作流调用失败')
    } finally { setAgentLoading(false) }
  }

  async function clearAgentSession() {
    const sessionId = agentSessions[agent]
    setAgentError('')
    if (sessionId) {
      setAgentLoading(true)
      try {
        await request(`${API}/agents/${agent}/clear`, jsonRequest('POST', { sessionId }))
      } catch (reason) {
        setAgentError(reason instanceof Error ? reason.message : '会话清理失败')
        setAgentLoading(false)
        return
      }
      setAgentLoading(false)
    }
    setAgentSessions(current => ({ ...current, [agent]: undefined }))
    setAgentMessages(current => ({ ...current, [agent]: [] }))
  }

  async function loadAgentProfile() {
    setAgentLoading(true); setAgentError('')
    try {
      const response = await request<{ facts: Array<{ key: string; value: string }> }>(`${API}/agents/${agent}/profile`, jsonRequest('POST'))
      const content = response.facts.length
        ? response.facts.map(fact => `${fact.key}: ${fact.value}`).join('\n')
        : '当前 Agent 尚未提取用户画像。'
      setAgentMessages(current => ({ ...current, [agent]: [...(current[agent] || []), {
        id: crypto.randomUUID(), role: 'system', content,
      }] }))
    } catch (reason) { setAgentError(reason instanceof Error ? reason.message : '用户画像读取失败') }
    finally { setAgentLoading(false) }
  }

  return (
    <section aria-label="共享 AI 服务工作台">
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="text-sm font-medium text-text">共享 AI 服务集群</h2><p className="mt-1 text-xs text-text-tertiary">工具参数中的项目范围由控制面绑定到当前租户。</p></div>
        <button onClick={() => void reload()} disabled={loading} className="flex h-9 w-9 shrink-0 items-center justify-center text-text-tertiary hover:text-text disabled:opacity-40" title="刷新共享服务" aria-label="刷新共享服务"><RefreshCw size={15} /></button>
      </div>

      <div className="mt-6 border-y border-border py-5" aria-label="业务 Agent 工作流">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-1" role="tablist" aria-label="Agent 工作流"><button role="tab" aria-selected={agent === 'customer-service'} onClick={() => setAgent('customer-service')} className={`h-8 rounded-md px-3 text-xs ${agent === 'customer-service' ? 'bg-accent text-page' : 'text-text-secondary hover:bg-surface'}`}>智能客服 Agent</button><button role="tab" aria-selected={agent === 'writing-assistant'} onClick={() => setAgent('writing-assistant')} className={`h-8 rounded-md px-3 text-xs ${agent === 'writing-assistant' ? 'bg-accent text-page' : 'text-text-secondary hover:bg-surface'}`}>写作 Agent</button></div><div className="flex items-center gap-1"><button onClick={() => void loadAgentProfile()} disabled={agentLoading} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text disabled:opacity-40" title="查看用户画像" aria-label="查看 Agent 用户画像"><UserRoundSearch size={14} /></button><button onClick={() => void clearAgentSession()} disabled={agentLoading} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-danger disabled:opacity-40" title="清空会话" aria-label="清空 Agent 会话"><Trash2 size={14} /></button></div></div>
        {agent === 'writing-assistant' && <div className="mt-3 flex items-center gap-2 text-xs text-text-secondary"><span>文风</span><select value={writingStyle} onChange={event => setWritingStyle(event.target.value)} className="h-8 rounded-md border border-border bg-page px-2 text-xs"><option>正式</option><option>轻松</option><option>学术</option><option>幽默</option></select></div>}
        <div className="mt-4 max-h-72 min-h-32 overflow-y-auto border-y border-border px-1 py-3">
          {(agentMessages[agent] || []).length === 0 && <EmptyWorkspace title={agent === 'customer-service' ? '开始一轮智能客服问答' : '开始一轮多轮写作'} detail="会依次调用记忆、用户画像、知识检索、Prompt Hub 与模型网关。" />}
          {(agentMessages[agent] || []).map(message => <div key={message.id} className={`mb-3 max-w-[88%] whitespace-pre-wrap break-words px-3 py-2 text-xs leading-6 last:mb-0 ${message.role === 'user' ? 'ml-auto bg-accent text-page' : message.role === 'system' ? 'mx-auto border border-border bg-surface text-text-secondary' : 'bg-surface text-text'}`}><div className="mb-0.5 text-[10px] opacity-60">{message.role === 'user' ? '你' : message.role === 'assistant' ? 'Agent' : '用户画像'}</div>{message.content}</div>)}
        </div>
        {agentError && <div className="mt-3 text-xs text-danger">{agentError}</div>}
        <div className="mt-3 flex items-end gap-2"><textarea value={agentInput} onChange={event => setAgentInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendAgentMessage() } }} className="min-h-20 flex-1 resize-y rounded-md border border-border bg-page p-3 text-xs leading-5 outline-none" placeholder={agent === 'customer-service' ? '输入客户问题' : '输入主题、润色或续写要求'} aria-label="Agent 消息" /><button onClick={() => void sendAgentMessage()} disabled={!agentInput.trim() || agentLoading} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-page disabled:opacity-40" title="发送" aria-label="发送 Agent 消息"><Send size={15} /></button></div>
        {agentSessions[agent] && <div className="mt-2 truncate font-mono text-[10px] text-text-tertiary">会话 {agentSessions[agent]}</div>}
      </div>

      <div className="mt-5 grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 xl:grid-cols-4" role="tablist" aria-label="共享服务">
        {serviceCatalog.map(item => {
          const Icon = item.icon
          const currentHealth = health?.services[item.id]
          return <button key={item.id} role="tab" aria-selected={service === item.id} onClick={() => setService(item.id)} className={`min-w-0 bg-page p-3 text-left ${service === item.id ? 'shadow-[inset_0_-2px_0_var(--color-accent)]' : 'hover:bg-surface'}`}><div className="flex items-center gap-2"><Icon size={14} className="shrink-0 text-text-tertiary" /><span className="truncate text-xs font-medium text-text">{item.label}</span><StatusText tone={currentHealth?.status === 'ok' ? 'success' : 'neutral'}>{currentHealth?.status === 'ok' ? '在线' : '未连接'}</StatusText></div><p className="mt-1 truncate text-[11px] text-text-tertiary">{item.detail}</p></button>
        })}
      </div>

      <div className="mt-6"><CollectionState loading={loading && !health} error={error} /></div>

      {!error && (
        <div className="mt-5 grid gap-8 xl:grid-cols-[260px_minmax(0,1fr)]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium text-text"><ServerCog size={14} /> 工具与 Prompt</div>
            <div className="mt-3 border-y border-border">
              {tools.map(tool => <button key={tool.name} onClick={() => selectTool(tool.name)} className={`block w-full border-b border-border px-1 py-3 text-left last:border-b-0 ${toolName === tool.name ? 'text-accent' : 'text-text'}`}><div className="truncate text-xs font-medium">{tool.name}</div><div className="mt-1 line-clamp-2 text-[11px] leading-5 text-text-tertiary">{tool.description || 'MCP Tool'}</div></button>)}
              {prompts.map(prompt => <button key={prompt.name} onClick={() => selectPrompt(prompt.name)} className={`block w-full border-b border-border px-1 py-3 text-left last:border-b-0 ${promptName === prompt.name && !toolName ? 'text-accent' : 'text-text'}`}><div className="flex items-center gap-1.5 text-xs font-medium"><Braces size={12} /> <span className="truncate">{prompt.name}</span></div><div className="mt-1 line-clamp-2 text-[11px] leading-5 text-text-tertiary">{prompt.description || 'MCP Prompt'}</div></button>)}
              {tools.length === 0 && prompts.length === 0 && <EmptyWorkspace title="当前服务没有可发现能力" detail="启动对应 MCP Server 后刷新。" />}
            </div>
          </div>

          <div className="min-w-0">
            {selectedTool && <div><div className="flex items-center justify-between gap-4"><div><div className="font-mono text-sm text-text">{selectedTool.name}</div><p className="mt-1 text-xs text-text-tertiary">{selectedTool.description}</p></div><button onClick={() => void callTool()} disabled={loading} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md bg-accent px-3 text-xs text-page disabled:opacity-40"><Play size={13} /> 调用</button></div><label className="mt-5 block text-xs text-text-secondary">参数 JSON<textarea value={toolInput} onChange={event => setToolInput(event.target.value)} className="mt-2 min-h-52 w-full resize-y rounded-md border border-border bg-page p-3 font-mono text-xs leading-6 outline-none" spellCheck={false} aria-label="MCP 工具参数" /></label></div>}
            {!selectedTool && selectedPrompt && <div><div className="flex items-center justify-between gap-4"><div><div className="font-mono text-sm text-text">{selectedPrompt.name}</div><p className="mt-1 text-xs text-text-tertiary">{selectedPrompt.description}</p></div><button onClick={() => void renderPrompt()} disabled={loading} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md bg-accent px-3 text-xs text-page disabled:opacity-40"><Send size={13} /> 渲染</button></div><label className="mt-5 block text-xs text-text-secondary">参数 JSON<textarea value={promptInput} onChange={event => setPromptInput(event.target.value)} className="mt-2 min-h-52 w-full resize-y rounded-md border border-border bg-page p-3 font-mono text-xs leading-6 outline-none" spellCheck={false} aria-label="MCP Prompt 参数" /></label></div>}

            {result !== null && <div className="mt-6 border-t border-border pt-4"><div className="text-xs font-medium text-text">调用结果</div><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface p-3 font-mono text-xs leading-6 text-text-secondary">{formattedResult(result)}</pre></div>}
          </div>
        </div>
      )}

      {quota && <div className="mt-8 grid grid-cols-2 gap-4 border-t border-border pt-4 text-xs sm:grid-cols-4"><div><div className="text-text-tertiary">租户范围</div><div className="mt-1 truncate font-mono text-text">{quota.project_id}</div></div><div><div className="text-text-tertiary">今日 Token</div><div className="mt-1 text-text">{quota.used_tokens.toLocaleString()}</div></div><div><div className="text-text-tertiary">每日上限</div><div className="mt-1 text-text">{quota.daily_limit > 0 ? quota.daily_limit.toLocaleString() : '不限'}</div></div><div><div className="text-text-tertiary">剩余</div><div className="mt-1 text-text">{quota.remaining >= 0 ? quota.remaining.toLocaleString() : '不限'}</div></div></div>}
    </section>
  )
}
