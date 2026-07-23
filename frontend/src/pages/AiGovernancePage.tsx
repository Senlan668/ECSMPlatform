import { useEffect, useMemo, useState } from 'react'
import { BrainCircuit, CheckCircle2, Copy, Pencil, Play, Plus, Power, Square, Trash2 } from 'lucide-react'
import Modal from '../components/Modal'
import { useAuth } from '../contexts/AuthContext'

type RuntimeStatus = 'running' | 'stopped'

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

type ModelDialog = { mode: 'create' } | { mode: 'edit'; model: ModelRecord }
type KeyDialog = { mode: 'create' } | { mode: 'edit'; key: ApiKeyRecord }

function modelsStorageKey(tenantId: string) { return `shangmei-zhiying-models:${tenantId}` }
function keysStorageKey(tenantId: string) { return `shangmei-zhiying-api-keys:${tenantId}` }

function loadRecords<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]') as T[] } catch { return [] }
}

function makeSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  return `smz_${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value))
}

export default function AiGovernancePage() {
  const { activeTenant } = useAuth()
  const tenantId = activeTenant?.id || ''
  const [activeTab, setActiveTab] = useState<'models' | 'keys'>('models')
  const [models, setModels] = useState<ModelRecord[]>([])
  const [keys, setKeys] = useState<ApiKeyRecord[]>([])
  const [modelDialog, setModelDialog] = useState<ModelDialog | null>(null)
  const [keyDialog, setKeyDialog] = useState<KeyDialog | null>(null)
  const [modelName, setModelName] = useState('')
  const [provider, setProvider] = useState('OpenAI')
  const [modelId, setModelId] = useState('')
  const [keyName, setKeyName] = useState('')
  const [newSecret, setNewSecret] = useState('')

  useEffect(() => {
    const storedModels = loadRecords<ModelRecord>(modelsStorageKey(tenantId)).map(model => ({ ...model, status: model.status || 'stopped' }))
    const storedKeys = loadRecords<ApiKeyRecord>(keysStorageKey(tenantId)).map(key => ({ ...key, status: key.status || 'running' }))
    setModels(storedModels)
    setKeys(storedKeys)
    setModelDialog(null)
    setKeyDialog(null)
    setNewSecret('')
  }, [tenantId])

  const modelRows = useMemo(() => models.map(model => ({ ...model, createdAt: formatDate(model.createdAt) })), [models])
  const keyRows = useMemo(() => keys.map(key => ({ ...key, createdAt: formatDate(key.createdAt) })), [keys])

  function persistModels(next: ModelRecord[]) {
    setModels(next)
    localStorage.setItem(modelsStorageKey(tenantId), JSON.stringify(next))
  }

  function persistKeys(next: ApiKeyRecord[]) {
    setKeys(next)
    localStorage.setItem(keysStorageKey(tenantId), JSON.stringify(next))
  }

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

  function saveModel() {
    if (!modelName.trim() || !provider.trim() || !modelId.trim() || !modelDialog) return
    if (modelDialog.mode === 'create') {
      persistModels([{ id: crypto.randomUUID(), name: modelName.trim(), provider: provider.trim(), modelId: modelId.trim(), status: 'stopped', createdAt: new Date().toISOString() }, ...models])
    } else {
      persistModels(models.map(model => model.id === modelDialog.model.id ? { ...model, name: modelName.trim(), provider: provider.trim(), modelId: modelId.trim() } : model))
    }
    setModelDialog(null)
  }

  function openKeyDialog(dialog: KeyDialog) {
    setKeyDialog(dialog)
    setKeyName(dialog.mode === 'edit' ? dialog.key.name : '')
    setNewSecret('')
  }

  function saveKey() {
    if (!keyName.trim() || !keyDialog) return
    if (keyDialog.mode === 'create') {
      const secret = makeSecret()
      persistKeys([{ id: crypto.randomUUID(), name: keyName.trim(), prefix: secret.slice(0, 10), lastFour: secret.slice(-4), status: 'running', createdAt: new Date().toISOString() }, ...keys])
      setNewSecret(secret)
    } else {
      persistKeys(keys.map(key => key.id === keyDialog.key.id ? { ...key, name: keyName.trim() } : key))
      setKeyDialog(null)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-10 md:px-10 md:py-12">
        <header className="animate-enter"><div className="flex items-center gap-2 text-xs text-text-tertiary"><BrainCircuit size={14} /> 项目八 · {activeTenant?.name}</div><h1 className="mt-4 font-display text-3xl font-medium text-text">AI 模型与服务中心</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-text-secondary">管理当前租户的模型接入与服务密钥。模型与密钥状态独立控制，任何变更都在此处留存。</p></header>

        <div className="mt-9 flex border-b border-border" role="tablist" aria-label="治理资源">
          <button role="tab" aria-selected={activeTab === 'models'} onClick={() => setActiveTab('models')} className={`px-1 pb-3 mr-6 text-sm ${activeTab === 'models' ? 'border-b-2 border-text text-text' : 'text-text-tertiary hover:text-text'}`}>模型</button>
          <button role="tab" aria-selected={activeTab === 'keys'} onClick={() => setActiveTab('keys')} className={`px-1 pb-3 text-sm ${activeTab === 'keys' ? 'border-b-2 border-text text-text' : 'text-text-tertiary hover:text-text'}`}>API Key</button>
        </div>

        {activeTab === 'models' ? <section className="mt-6" aria-label="模型列表"><div className="flex items-center justify-between"><p className="text-xs text-text-tertiary">模型在启动后才可被 AI Runtime 路由。</p><button onClick={() => openModelDialog({ mode: 'create' })} className="w-9 h-9 flex items-center justify-center rounded-md bg-accent text-page" title="添加模型" aria-label="添加模型"><Plus size={17} /></button></div><div className="mt-4 border-y border-border">{modelRows.length === 0 ? <div className="py-12 text-center text-sm text-text-tertiary">当前租户还没有模型</div> : modelRows.map(model => <div key={model.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 items-center py-4 border-b border-border last:border-b-0"><div className="min-w-0"><div className="flex items-center gap-2"><span className="text-sm text-text truncate">{model.name}</span><span className={`text-[10px] ${model.status === 'running' ? 'text-success' : 'text-text-tertiary'}`}>{model.status === 'running' ? '已启动' : '已关闭'}</span></div><div className="mt-1 text-xs text-text-tertiary truncate">{model.provider} · {model.modelId} · 创建于 {model.createdAt}</div></div><div className="flex items-center gap-1"><button onClick={() => persistModels(models.map(item => item.id === model.id ? { ...item, status: item.status === 'running' ? 'stopped' : 'running' } : item))} className="w-8 h-8 flex items-center justify-center text-text-tertiary hover:text-text" title={model.status === 'running' ? '关闭模型' : '启动模型'} aria-label={model.status === 'running' ? `关闭 ${model.name}` : `启动 ${model.name}`}>{model.status === 'running' ? <Square size={14} /> : <Play size={14} />}</button><button onClick={() => openModelDialog({ mode: 'edit', model })} className="w-8 h-8 flex items-center justify-center text-text-tertiary hover:text-text" title="编辑模型" aria-label={`编辑 ${model.name}`}><Pencil size={14} /></button><button onClick={() => persistModels(models.filter(item => item.id !== model.id))} className="w-8 h-8 flex items-center justify-center text-text-tertiary hover:text-danger" title="删除模型" aria-label={`删除 ${model.name}`}><Trash2 size={14} /></button></div></div>)}</div></section> : <section className="mt-6" aria-label="API Key 列表"><div className="flex items-center justify-between"><p className="text-xs text-text-tertiary">创建后仅显示一次完整密钥；停用后不能再用于模型服务。</p><button onClick={() => openKeyDialog({ mode: 'create' })} className="w-9 h-9 flex items-center justify-center rounded-md bg-accent text-page" title="创建 API Key" aria-label="创建 API Key"><Plus size={17} /></button></div><div className="mt-4 border-y border-border">{keyRows.length === 0 ? <div className="py-12 text-center text-sm text-text-tertiary">当前租户还没有 API Key</div> : keyRows.map(key => <div key={key.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 items-center py-4 border-b border-border last:border-b-0"><div className="min-w-0"><div className="flex items-center gap-2"><span className="text-sm text-text truncate">{key.name}</span><span className={`text-[10px] ${key.status === 'running' ? 'text-success' : 'text-text-tertiary'}`}>{key.status === 'running' ? '已启用' : '已停用'}</span></div><div className="mt-1 text-xs text-text-tertiary font-mono truncate">{key.prefix}...{key.lastFour} · 创建于 {key.createdAt}</div></div><div className="flex items-center gap-1"><button onClick={() => persistKeys(keys.map(item => item.id === key.id ? { ...item, status: item.status === 'running' ? 'stopped' : 'running' } : item))} className="w-8 h-8 flex items-center justify-center text-text-tertiary hover:text-text" title={key.status === 'running' ? '停用 API Key' : '启用 API Key'} aria-label={key.status === 'running' ? `停用 ${key.name}` : `启用 ${key.name}`}><Power size={14} /></button><button onClick={() => openKeyDialog({ mode: 'edit', key })} className="w-8 h-8 flex items-center justify-center text-text-tertiary hover:text-text" title="编辑 API Key" aria-label={`编辑 ${key.name}`}><Pencil size={14} /></button><button onClick={() => persistKeys(keys.filter(item => item.id !== key.id))} className="w-8 h-8 flex items-center justify-center text-text-tertiary hover:text-danger" title="删除 API Key" aria-label={`删除 ${key.name}`}><Trash2 size={14} /></button></div></div>)}</div></section>}
      </div>

      <Modal open={Boolean(modelDialog)} onClose={() => setModelDialog(null)} title={modelDialog?.mode === 'edit' ? '编辑模型' : '添加模型'}>
        <div className="space-y-4"><label className="block text-xs text-text-secondary">显示名称<input className="mt-2 w-full h-10 rounded-md border border-border bg-page px-3 text-sm outline-none focus:border-text-tertiary" value={modelName} onChange={event => setModelName(event.target.value)} autoFocus placeholder="例如：商品文案生成" aria-label="模型名称" /></label><label className="block text-xs text-text-secondary">供应商<input className="mt-2 w-full h-10 rounded-md border border-border bg-page px-3 text-sm outline-none focus:border-text-tertiary" value={provider} onChange={event => setProvider(event.target.value)} placeholder="例如：OpenAI" aria-label="供应商" /></label><label className="block text-xs text-text-secondary">模型标识<input className="mt-2 w-full h-10 rounded-md border border-border bg-page px-3 text-sm outline-none focus:border-text-tertiary" value={modelId} onChange={event => setModelId(event.target.value)} placeholder="例如：gpt-5" aria-label="模型标识" /></label><button onClick={saveModel} disabled={!modelName.trim() || !provider.trim() || !modelId.trim()} className="w-full h-10 rounded-md bg-accent text-page text-sm disabled:opacity-50">保存模型</button></div>
      </Modal>

      <Modal open={Boolean(keyDialog)} onClose={() => { setKeyDialog(null); setNewSecret('') }} title={newSecret ? '保存 API Key' : keyDialog?.mode === 'edit' ? '编辑 API Key' : '创建 API Key'}>
        {newSecret ? <div><p className="text-sm leading-6 text-text-secondary">此密钥只显示一次。请立即保存到安全的密钥管理系统。</p><div className="mt-4 flex items-center gap-2 border border-border bg-page rounded-md p-3"><code className="min-w-0 flex-1 break-all text-xs text-text">{newSecret}</code><button onClick={() => navigator.clipboard.writeText(newSecret)} className="w-8 h-8 shrink-0 flex items-center justify-center text-text-secondary hover:text-text" title="复制密钥" aria-label="复制密钥"><Copy size={15} /></button></div><button onClick={() => { setKeyDialog(null); setNewSecret('') }} className="mt-5 w-full h-10 rounded-md bg-accent text-page text-sm">我已保存</button></div> : <div><label className="block text-xs text-text-secondary">密钥名称<input className="mt-2 w-full h-10 rounded-md border border-border bg-page px-3 text-sm outline-none focus:border-text-tertiary" value={keyName} onChange={event => setKeyName(event.target.value)} autoFocus placeholder="例如：内容生成服务" aria-label="密钥名称" /></label><div className="mt-4 flex items-center gap-2 text-xs text-success"><CheckCircle2 size={14} /> 密钥将绑定到当前租户</div><button onClick={saveKey} disabled={!keyName.trim()} className="mt-5 w-full h-10 rounded-md bg-accent text-page text-sm disabled:opacity-50">保存 API Key</button></div>}
      </Modal>
    </div>
  )
}
