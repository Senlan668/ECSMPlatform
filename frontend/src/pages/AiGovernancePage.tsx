import { useEffect, useState } from 'react'
import { Braces, BrainCircuit, CheckCircle2, Copy, KeyRound, Pencil, Play, Plus, Power, RefreshCw, Route, Save, Square, Trash2, Wrench } from 'lucide-react'
import Modal from '../components/Modal'
import { CollectionState, DependencyNotice, EmptyWorkspace, StatusText, WorkspaceShell, type WorkspaceTab } from '../components/WorkspaceShell'
import { useBusinessApi, useBusinessCollection } from '../lib/businessApi'
import { jsonRequest } from '../lib/http'
import ContentImageModels from '../features/content-campaign/ContentImageModels'
import SharedAiServicesPanel from '../features/governance/SharedAiServicesPanel'

type RuntimeStatus = 'running' | 'stopped'
type GovernanceTab = 'models' | 'keys' | 'prompts' | 'tools' | 'shared' | 'usage'

interface ModelRecord {
  id: string
  name: string
  provider: string
  modelId: string
  status: RuntimeStatus
  createdAt: string
}

interface ApiKeyRecord {
  id: string
  name: string
  prefix: string
  lastFour: string
  status: RuntimeStatus
  createdAt: string
}

interface PromptRecord {
  id: string
  name: string
  purpose: string
  template: string
  version: number
  status: RuntimeStatus
  createdAt: string
}

interface ToolRecord {
  id: string
  name: string
  transport: 'HTTP' | 'MCP'
  endpoint: string
  status: RuntimeStatus
  createdAt: string
}

interface BudgetPolicy {
  dailyTokenLimit: number
  mode: 'observe' | 'block'
}

interface RuntimeHealth {
  id: string
  name: string
  kind: string
  baseUrl: string
  status: 'online' | 'degraded' | 'offline'
  latencyMs: number
  detail: string
  capabilities: string[]
  checkedAt: string
}

type ModelDialog = { mode: 'create' } | { mode: 'edit'; model: ModelRecord }
type KeyDialog = { mode: 'create' } | { mode: 'edit'; key: ApiKeyRecord }
type PromptDialog = { mode: 'create' } | { mode: 'edit'; prompt: PromptRecord }
type ToolDialog = { mode: 'create' } | { mode: 'edit'; tool: ToolRecord }

const tabs: WorkspaceTab<GovernanceTab>[] = [
  { id: 'models', label: '模型' },
  { id: 'keys', label: 'API Key' },
  { id: 'prompts', label: 'Prompt' },
  { id: 'tools', label: '工具服务' },
  { id: 'shared', label: '共享 AI 服务' },
  { id: 'usage', label: '调用与预算' },
]

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value))
}

export default function AiGovernancePage() {
  const [activeTab, setActiveTab] = useState<GovernanceTab>('models')
  const api = useBusinessApi()
  const modelRecords = useBusinessCollection<ModelRecord>('/api/v1/governance/models')
  const keyRecords = useBusinessCollection<ApiKeyRecord>('/api/v1/governance/api-keys')
  const promptRecords = useBusinessCollection<PromptRecord>('/api/v1/governance/prompts')
  const toolRecords = useBusinessCollection<ToolRecord>('/api/v1/governance/tools')
  const runtimeRecords = useBusinessCollection<RuntimeHealth>('/api/v1/runtimes')
  const models = modelRecords.items
  const keys = keyRecords.items
  const prompts = promptRecords.items
  const tools = toolRecords.items
  const [budget, setBudget] = useState<BudgetPolicy>({ dailyTokenLimit: 100000, mode: 'observe' })

  const [modelDialog, setModelDialog] = useState<ModelDialog | null>(null)
  const [keyDialog, setKeyDialog] = useState<KeyDialog | null>(null)
  const [promptDialog, setPromptDialog] = useState<PromptDialog | null>(null)
  const [toolDialog, setToolDialog] = useState<ToolDialog | null>(null)
  const [modelName, setModelName] = useState('')
  const [provider, setProvider] = useState('OpenAI')
  const [modelId, setModelId] = useState('')
  const [keyName, setKeyName] = useState('')
  const [newSecret, setNewSecret] = useState('')
  const [promptName, setPromptName] = useState('')
  const [promptPurpose, setPromptPurpose] = useState('内容生成')
  const [promptTemplate, setPromptTemplate] = useState('')
  const [toolName, setToolName] = useState('')
  const [toolTransport, setToolTransport] = useState<ToolRecord['transport']>('HTTP')
  const [toolEndpoint, setToolEndpoint] = useState('')
  const [dailyTokenLimit, setDailyTokenLimit] = useState(String(budget.dailyTokenLimit))
  const [budgetMode, setBudgetMode] = useState<BudgetPolicy['mode']>(budget.mode)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    let cancelled = false
    api<BudgetPolicy>('/api/v1/governance/budget')
      .then(value => { if (!cancelled) setBudget(value) })
      .catch(reason => { if (!cancelled) setActionError(reason instanceof Error ? reason.message : '预算策略加载失败') })
    return () => { cancelled = true }
  }, [api])

  useEffect(() => {
    setDailyTokenLimit(String(budget.dailyTokenLimit))
    setBudgetMode(budget.mode)
  }, [budget])

  function openModelDialog(dialog: ModelDialog) {
    setModelDialog(dialog)
    if (dialog.mode === 'edit') {
      setModelName(dialog.model.name)
      setProvider(dialog.model.provider)
      setModelId(dialog.model.modelId)
    } else {
      setModelName('')
      setProvider('OpenAI')
      setModelId('')
    }
  }

  async function saveModel() {
    if (!modelName.trim() || !provider.trim() || !modelId.trim() || !modelDialog) return
    setActionError('')
    try {
      const path = modelDialog.mode === 'create' ? '/api/v1/governance/models' : `/api/v1/governance/models/${modelDialog.model.id}`
      const saved = await api<ModelRecord>(path, jsonRequest(modelDialog.mode === 'create' ? 'POST' : 'PUT', { name: modelName.trim(), provider: provider.trim(), modelId: modelId.trim() }))
      modelRecords.setItems(current => modelDialog.mode === 'create' ? [saved, ...current] : current.map(model => model.id === saved.id ? saved : model))
      setModelDialog(null)
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '模型保存失败')
    }
  }

  function openKeyDialog(dialog: KeyDialog) {
    setKeyDialog(dialog)
    setKeyName(dialog.mode === 'edit' ? dialog.key.name : '')
    setNewSecret('')
  }

  async function saveKey() {
    if (!keyName.trim() || !keyDialog) return
    setActionError('')
    try {
      if (keyDialog.mode === 'create') {
        const created = await api<{ apiKey: ApiKeyRecord; secret: string }>('/api/v1/governance/api-keys', jsonRequest('POST', { name: keyName.trim() }))
        keyRecords.setItems(current => [created.apiKey, ...current])
        setNewSecret(created.secret)
      } else {
        const saved = await api<ApiKeyRecord>(`/api/v1/governance/api-keys/${keyDialog.key.id}`, jsonRequest('PUT', { name: keyName.trim() }))
        keyRecords.setItems(current => current.map(key => key.id === saved.id ? saved : key))
        setKeyDialog(null)
      }
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'API Key 保存失败')
    }
  }

  function openPromptDialog(dialog: PromptDialog) {
    setPromptDialog(dialog)
    if (dialog.mode === 'edit') {
      setPromptName(dialog.prompt.name)
      setPromptPurpose(dialog.prompt.purpose)
      setPromptTemplate(dialog.prompt.template)
    } else {
      setPromptName('')
      setPromptPurpose('内容生成')
      setPromptTemplate('')
    }
  }

  async function savePrompt() {
    if (!promptDialog || !promptName.trim() || !promptTemplate.trim()) return
    setActionError('')
    try {
      const path = promptDialog.mode === 'create' ? '/api/v1/governance/prompts' : `/api/v1/governance/prompts/${promptDialog.prompt.id}`
      const saved = await api<PromptRecord>(path, jsonRequest(promptDialog.mode === 'create' ? 'POST' : 'PUT', { name: promptName.trim(), purpose: promptPurpose, template: promptTemplate.trim() }))
      promptRecords.setItems(current => promptDialog.mode === 'create' ? [saved, ...current] : current.map(prompt => prompt.id === saved.id ? saved : prompt))
      setPromptDialog(null)
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Prompt 保存失败')
    }
  }

  function openToolDialog(dialog: ToolDialog) {
    setToolDialog(dialog)
    if (dialog.mode === 'edit') {
      setToolName(dialog.tool.name)
      setToolTransport(dialog.tool.transport)
      setToolEndpoint(dialog.tool.endpoint)
    } else {
      setToolName('')
      setToolTransport('HTTP')
      setToolEndpoint('')
    }
  }

  async function saveTool() {
    if (!toolDialog || !toolName.trim() || !toolEndpoint.trim()) return
    setActionError('')
    try {
      const path = toolDialog.mode === 'create' ? '/api/v1/governance/tools' : `/api/v1/governance/tools/${toolDialog.tool.id}`
      const saved = await api<ToolRecord>(path, jsonRequest(toolDialog.mode === 'create' ? 'POST' : 'PUT', { name: toolName.trim(), transport: toolTransport, endpoint: toolEndpoint.trim() }))
      toolRecords.setItems(current => toolDialog.mode === 'create' ? [saved, ...current] : current.map(tool => tool.id === saved.id ? saved : tool))
      setToolDialog(null)
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '工具服务保存失败')
    }
  }

  async function saveBudget() {
    const parsed = Number(dailyTokenLimit)
    if (!Number.isFinite(parsed) || parsed < 0) return
    setActionError('')
    try {
      const saved = await api<BudgetPolicy>('/api/v1/governance/budget', jsonRequest('PUT', { dailyTokenLimit: Math.round(parsed), mode: budgetMode }))
      setBudget(saved)
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '预算策略保存失败')
    }
  }

  async function mutateRecord<T extends { id: string }>(
    collection: { setItems: React.Dispatch<React.SetStateAction<T[]>> },
    path: string,
    id: string,
    action: 'toggle' | 'delete',
  ) {
    setActionError('')
    try {
      if (action === 'delete') {
        await api<void>(`${path}/${id}`, jsonRequest('DELETE'))
        collection.setItems(current => current.filter(item => item.id !== id))
      } else {
        const updated = await api<T>(`${path}/${id}/toggle`, jsonRequest('POST'))
        collection.setItems(current => current.map(item => item.id === id ? updated : item))
      }
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '状态更新失败')
    }
  }

  return (
    <WorkspaceShell
      eyebrow="项目八"
      title="AI 模型与服务中心"
      description="统一管理模型、服务密钥、Prompt 版本、工具服务、调用路由和预算。MCP 作为可选工具传输存在，租户身份与工具权限不由调用参数自行声明。"
      icon={BrainCircuit}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {actionError && <div className="mb-5"><CollectionState loading={false} error={actionError} /></div>}
      {activeTab === 'models' && (
        <section aria-label="模型列表">
          <div className="flex items-center justify-between"><p className="text-xs text-text-tertiary">模型启动后才可进入 AI Runtime 路由；当前仅保存配置，不验证供应商连接。</p><button onClick={() => openModelDialog({ mode: 'create' })} className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-page" title="添加模型" aria-label="添加模型"><Plus size={17} /></button></div>
          <div className="mt-4 border-y border-border"><CollectionState loading={modelRecords.loading} error={modelRecords.error} />{!modelRecords.loading && !modelRecords.error && (models.length === 0 ? <EmptyWorkspace title="当前租户还没有模型" detail="添加模型配置后可独立启停。" /> : models.map(model => <div key={model.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border py-4 last:border-b-0"><div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate text-sm text-text">{model.name}</span><StatusText tone={model.status === 'running' ? 'success' : 'neutral'}>{model.status === 'running' ? '已启动' : '已关闭'}</StatusText></div><div className="mt-1 truncate text-xs text-text-tertiary">{model.provider} · {model.modelId} · 创建于 {formatDate(model.createdAt)}</div></div><div className="flex items-center gap-1"><button onClick={() => void mutateRecord(modelRecords, '/api/v1/governance/models', model.id, 'toggle')} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text" title={model.status === 'running' ? '关闭模型' : '启动模型'} aria-label={model.status === 'running' ? `关闭 ${model.name}` : `启动 ${model.name}`}>{model.status === 'running' ? <Square size={14} /> : <Play size={14} />}</button><button onClick={() => openModelDialog({ mode: 'edit', model })} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text" title="编辑模型" aria-label={`编辑 ${model.name}`}><Pencil size={14} /></button><button onClick={() => void mutateRecord(modelRecords, '/api/v1/governance/models', model.id, 'delete')} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-danger" title="删除模型" aria-label={`删除 ${model.name}`}><Trash2 size={14} /></button></div></div>))}</div>
          <ContentImageModels />
        </section>
      )}

      {activeTab === 'keys' && (
        <section aria-label="API Key 列表">
          <div className="flex items-center justify-between"><p className="text-xs text-text-tertiary">完整密钥由服务端生成且只显示一次；控制面仅保存摘要、前缀和末四位。</p><button onClick={() => openKeyDialog({ mode: 'create' })} className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-page" title="创建 API Key" aria-label="创建 API Key"><Plus size={17} /></button></div>
          <div className="mt-4 border-y border-border"><CollectionState loading={keyRecords.loading} error={keyRecords.error} />{!keyRecords.loading && !keyRecords.error && (keys.length === 0 ? <EmptyWorkspace title="当前租户还没有 API Key" detail="服务密钥与模型状态独立控制。" /> : keys.map(key => <div key={key.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border py-4 last:border-b-0"><div className="min-w-0"><div className="flex items-center gap-2"><KeyRound size={14} className="text-text-tertiary" /><span className="truncate text-sm text-text">{key.name}</span><StatusText tone={key.status === 'running' ? 'success' : 'neutral'}>{key.status === 'running' ? '已启用' : '已停用'}</StatusText></div><div className="mt-1 truncate font-mono text-xs text-text-tertiary">{key.prefix}...{key.lastFour} · 创建于 {formatDate(key.createdAt)}</div></div><div className="flex items-center gap-1"><button onClick={() => void mutateRecord(keyRecords, '/api/v1/governance/api-keys', key.id, 'toggle')} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text" title={key.status === 'running' ? '停用 API Key' : '启用 API Key'} aria-label={key.status === 'running' ? `停用 ${key.name}` : `启用 ${key.name}`}><Power size={14} /></button><button onClick={() => openKeyDialog({ mode: 'edit', key })} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text" title="编辑 API Key" aria-label={`编辑 ${key.name}`}><Pencil size={14} /></button><button onClick={() => void mutateRecord(keyRecords, '/api/v1/governance/api-keys', key.id, 'delete')} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-danger" title="删除 API Key" aria-label={`删除 ${key.name}`}><Trash2 size={14} /></button></div></div>))}</div>
        </section>
      )}

      {activeTab === 'prompts' && (
        <section aria-label="Prompt 版本列表">
          <div className="flex items-center justify-between"><p className="text-xs text-text-tertiary">每次编辑生成新版本号；启用状态代表可被路由别名引用。</p><button onClick={() => openPromptDialog({ mode: 'create' })} className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-page" title="创建 Prompt" aria-label="创建 Prompt"><Plus size={17} /></button></div>
          <div className="mt-4 border-y border-border"><CollectionState loading={promptRecords.loading} error={promptRecords.error} />{!promptRecords.loading && !promptRecords.error && (prompts.length === 0 ? <EmptyWorkspace title="暂无 Prompt" detail="Prompt 将按用途、版本和启用状态管理。" /> : prompts.map(prompt => <div key={prompt.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border py-4 last:border-b-0"><div className="min-w-0"><div className="flex items-center gap-2"><Braces size={14} className="text-text-tertiary" /><span className="truncate text-sm text-text">{prompt.name}</span><StatusText tone={prompt.status === 'running' ? 'success' : 'neutral'}>{prompt.status === 'running' ? '已启用' : '草稿'}</StatusText></div><div className="mt-1 truncate text-xs text-text-tertiary">{prompt.purpose} · v{prompt.version} · 创建于 {formatDate(prompt.createdAt)}</div></div><div className="flex items-center gap-1"><button onClick={() => void mutateRecord(promptRecords, '/api/v1/governance/prompts', prompt.id, 'toggle')} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text" title={prompt.status === 'running' ? '停用 Prompt' : '启用 Prompt'} aria-label={`${prompt.status === 'running' ? '停用' : '启用'} ${prompt.name}`}><Power size={14} /></button><button onClick={() => openPromptDialog({ mode: 'edit', prompt })} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text" title="编辑 Prompt" aria-label={`编辑 ${prompt.name}`}><Pencil size={14} /></button><button onClick={() => void mutateRecord(promptRecords, '/api/v1/governance/prompts', prompt.id, 'delete')} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-danger" title="删除 Prompt" aria-label={`删除 ${prompt.name}`}><Trash2 size={14} /></button></div></div>))}</div>
        </section>
      )}

      {activeTab === 'tools' && (
        <section aria-label="工具服务目录">
          <div className="flex items-center justify-between"><p className="text-xs text-text-tertiary">HTTP 是默认内部契约；MCP 仅用于需要动态工具发现的适配器。</p><button onClick={() => openToolDialog({ mode: 'create' })} className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-page" title="添加工具服务" aria-label="添加工具服务"><Plus size={17} /></button></div>
          <div className="mt-4 border-y border-border"><CollectionState loading={toolRecords.loading} error={toolRecords.error} />{!toolRecords.loading && !toolRecords.error && (tools.length === 0 ? <EmptyWorkspace title="暂无工具服务" detail="添加服务元数据不会发起网络连接。" /> : tools.map(tool => <div key={tool.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border py-4 last:border-b-0"><div className="min-w-0"><div className="flex items-center gap-2"><Wrench size={14} className="text-text-tertiary" /><span className="truncate text-sm text-text">{tool.name}</span><StatusText tone={tool.status === 'running' ? 'success' : 'neutral'}>{tool.status === 'running' ? '已启用' : '已停用'}</StatusText></div><div className="mt-1 truncate font-mono text-xs text-text-tertiary">{tool.transport} · {tool.endpoint}</div></div><div className="flex items-center gap-1"><button onClick={() => void mutateRecord(toolRecords, '/api/v1/governance/tools', tool.id, 'toggle')} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text" title={tool.status === 'running' ? '停用服务' : '启用服务'} aria-label={`${tool.status === 'running' ? '停用' : '启用'} ${tool.name}`}><Power size={14} /></button><button onClick={() => openToolDialog({ mode: 'edit', tool })} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text" title="编辑工具服务" aria-label={`编辑 ${tool.name}`}><Pencil size={14} /></button><button onClick={() => void mutateRecord(toolRecords, '/api/v1/governance/tools', tool.id, 'delete')} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-danger" title="删除工具服务" aria-label={`删除 ${tool.name}`}><Trash2 size={14} /></button></div></div>))}</div>
        </section>
      )}

      {activeTab === 'shared' && <SharedAiServicesPanel />}

      {activeTab === 'usage' && (
        <section aria-label="调用与预算">
          <DependencyNotice kind="database" title="AI Trace Repository 未连接" detail="当前没有真实 Token、成本或评测数据；预算策略由当前租户控制面管理。" />
          <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="border-y border-border"><div className="grid grid-cols-[minmax(0,1fr)_80px] items-center border-b border-border py-4"><div><div className="text-sm text-text">本日 Token</div><div className="mt-1 text-xs text-text-tertiary">模型网关未执行真实调用</div></div><div className="text-right font-display text-2xl text-text">0</div></div><div className="grid grid-cols-[minmax(0,1fr)_80px] items-center border-b border-border py-4"><div><div className="text-sm text-text">本日结算成本</div><div className="mt-1 text-xs text-text-tertiary">Provider 账单未接入</div></div><div className="text-right font-display text-2xl text-text">¥0</div></div><div className="grid grid-cols-[minmax(0,1fr)_80px] items-center py-4"><div><div className="text-sm text-text">AI Trace</div><div className="mt-1 text-xs text-text-tertiary">无调用记录</div></div><div className="text-right font-display text-2xl text-text">0</div></div></div>
            <div className="border-t border-border pt-4"><div className="flex items-center gap-2 text-sm font-medium text-text"><Route size={15} /> 租户预算策略</div><label className="mt-5 block text-xs text-text-secondary">每日 Token 上限<input type="number" min="0" value={dailyTokenLimit} onChange={event => setDailyTokenLimit(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-page px-3 text-sm" aria-label="每日 Token 上限" /></label><label className="mt-4 block text-xs text-text-secondary">超额模式<select value={budgetMode} onChange={event => setBudgetMode(event.target.value as BudgetPolicy['mode'])} className="mt-2 h-10 w-full rounded-md border border-border bg-page px-3 text-sm"><option value="observe">只告警</option><option value="block">阻断新调用</option></select></label><button onClick={saveBudget} className="mt-5 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-accent text-xs text-page"><Save size={14} /> 保存预算策略</button><div className="mt-3 flex items-center gap-2 text-[11px] text-success"><CheckCircle2 size={13} /> 当前：{budget.dailyTokenLimit.toLocaleString()} Token / {budget.mode === 'block' ? '超额阻断' : '只告警'}</div></div>
          </div>
          <div className="mt-10 border-t border-border pt-5" aria-label="五项目运行时状态">
            <div className="flex items-center justify-between gap-4"><div><h2 className="text-sm font-medium text-text">迁入运行时</h2><p className="mt-1 text-xs text-text-tertiary">控制面并行检查五套来源能力，不在线时不会伪造成可调用。</p></div><button onClick={() => void runtimeRecords.reload()} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text" title="刷新运行时状态" aria-label="刷新运行时状态"><RefreshCw size={14} /></button></div>
            <div className="mt-4 border-y border-border">
              <CollectionState loading={runtimeRecords.loading} error={runtimeRecords.error} />
              {!runtimeRecords.loading && !runtimeRecords.error && runtimeRecords.items.map(runtime => (
                <div key={runtime.id} className="grid gap-3 border-b border-border py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_120px] md:items-center">
                  <div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate text-sm text-text">{runtime.name}</span><StatusText tone={runtime.status === 'online' ? 'success' : runtime.status === 'offline' ? 'danger' : 'neutral'}>{runtime.status === 'online' ? '在线' : runtime.status === 'degraded' ? '降级' : '未启动'}</StatusText></div><div className="mt-1 truncate text-xs text-text-tertiary">{runtime.kind} · {runtime.capabilities.join('、')}</div></div>
                  <div className="text-left text-[11px] text-text-tertiary md:text-right">{runtime.status === 'offline' ? runtime.detail : `${runtime.latencyMs} ms`}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <Modal open={Boolean(modelDialog)} onClose={() => setModelDialog(null)} title={modelDialog?.mode === 'edit' ? '编辑模型' : '添加模型'}>
        <div className="space-y-4"><label className="block text-xs text-text-secondary">显示名称<input className="mt-2 h-10 w-full rounded-md border border-border bg-page px-3 text-sm outline-none" value={modelName} onChange={event => setModelName(event.target.value)} autoFocus placeholder="例如：商品文案生成" aria-label="模型名称" /></label><label className="block text-xs text-text-secondary">供应商<input className="mt-2 h-10 w-full rounded-md border border-border bg-page px-3 text-sm outline-none" value={provider} onChange={event => setProvider(event.target.value)} placeholder="例如：OpenAI" aria-label="供应商" /></label><label className="block text-xs text-text-secondary">模型标识<input className="mt-2 h-10 w-full rounded-md border border-border bg-page px-3 text-sm outline-none" value={modelId} onChange={event => setModelId(event.target.value)} placeholder="例如：gpt-5" aria-label="模型标识" /></label><button onClick={saveModel} disabled={!modelName.trim() || !provider.trim() || !modelId.trim()} className="h-10 w-full rounded-md bg-accent text-sm text-page disabled:opacity-50">保存模型</button></div>
      </Modal>

      <Modal open={Boolean(keyDialog)} onClose={() => { setKeyDialog(null); setNewSecret('') }} title={newSecret ? '保存 API Key' : keyDialog?.mode === 'edit' ? '编辑 API Key' : '创建 API Key'}>
        {newSecret ? <div><p className="text-sm leading-6 text-text-secondary">此密钥只显示一次。请立即保存到安全的密钥管理系统。</p><div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-page p-3"><code className="min-w-0 flex-1 break-all text-xs text-text">{newSecret}</code><button onClick={() => navigator.clipboard.writeText(newSecret)} className="flex h-8 w-8 shrink-0 items-center justify-center text-text-secondary hover:text-text" title="复制密钥" aria-label="复制密钥"><Copy size={15} /></button></div><button onClick={() => { setKeyDialog(null); setNewSecret('') }} className="mt-5 h-10 w-full rounded-md bg-accent text-sm text-page">我已保存</button></div> : <div><label className="block text-xs text-text-secondary">密钥名称<input className="mt-2 h-10 w-full rounded-md border border-border bg-page px-3 text-sm outline-none" value={keyName} onChange={event => setKeyName(event.target.value)} autoFocus placeholder="例如：内容生成服务" aria-label="密钥名称" /></label><div className="mt-4 flex items-center gap-2 text-xs text-success"><CheckCircle2 size={14} /> 密钥将绑定到当前租户</div><button onClick={saveKey} disabled={!keyName.trim()} className="mt-5 h-10 w-full rounded-md bg-accent text-sm text-page disabled:opacity-50">保存 API Key</button></div>}
      </Modal>

      <Modal open={Boolean(promptDialog)} onClose={() => setPromptDialog(null)} title={promptDialog?.mode === 'edit' ? '编辑 Prompt' : '创建 Prompt'}>
        <div className="space-y-4"><label className="block text-xs text-text-secondary">名称<input value={promptName} onChange={event => setPromptName(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-page px-3 text-sm" autoFocus aria-label="Prompt 名称" /></label><label className="block text-xs text-text-secondary">用途<select value={promptPurpose} onChange={event => setPromptPurpose(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-page px-3 text-sm"><option>内容生成</option><option>客服问答</option><option>销售考核</option><option>事实提取</option></select></label><label className="block text-xs text-text-secondary">模板<textarea value={promptTemplate} onChange={event => setPromptTemplate(event.target.value)} className="mt-2 min-h-28 w-full resize-none rounded-md border border-border bg-page p-3 font-mono text-xs" aria-label="Prompt 模板" placeholder="使用 {{variable}} 表示受控变量" /></label><button onClick={savePrompt} disabled={!promptName.trim() || !promptTemplate.trim()} className="h-10 w-full rounded-md bg-accent text-sm text-page disabled:opacity-40">保存 Prompt</button></div>
      </Modal>

      <Modal open={Boolean(toolDialog)} onClose={() => setToolDialog(null)} title={toolDialog?.mode === 'edit' ? '编辑工具服务' : '添加工具服务'}>
        <div className="space-y-4"><label className="block text-xs text-text-secondary">服务名称<input value={toolName} onChange={event => setToolName(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-page px-3 text-sm" autoFocus aria-label="工具服务名称" /></label><label className="block text-xs text-text-secondary">传输<select value={toolTransport} onChange={event => setToolTransport(event.target.value as ToolRecord['transport'])} className="mt-2 h-10 w-full rounded-md border border-border bg-page px-3 text-sm"><option>HTTP</option><option>MCP</option></select></label><label className="block text-xs text-text-secondary">内部端点<input value={toolEndpoint} onChange={event => setToolEndpoint(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-page px-3 font-mono text-xs" aria-label="工具服务端点" placeholder="例如：http://service.internal/api" /></label><button onClick={saveTool} disabled={!toolName.trim() || !toolEndpoint.trim()} className="h-10 w-full rounded-md bg-accent text-sm text-page disabled:opacity-40">保存工具服务</button></div>
      </Modal>
    </WorkspaceShell>
  )
}
