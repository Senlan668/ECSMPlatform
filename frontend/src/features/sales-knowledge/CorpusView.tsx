import { useCallback, useEffect, useState } from 'react'
import { Check, Pause, Pencil, Play, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import Modal from '../../components/Modal'
import { DependencyNotice } from '../../components/WorkspaceShell'
import { useAuth } from '../../contexts/AuthContext'
import { useBusinessApi } from '../../lib/businessApi'
import { jsonRequest } from '../../lib/http'
import type { ConversationTurn, CustomConversation, RuntimeCapabilities } from './types'
import { ActionMessage, fieldClass, IconAction, InlineEmpty, MetricStrip, primaryButtonClass, secondaryButtonClass, SectionHeading, textareaClass } from './ui'

const API = '/api/v1/sales-knowledge'
const CATEGORIES = ['sales', 'course', 'objection', 'closing', 'followup', 'qa', 'knowledge', 'casual']

interface CorpusStats {
  total: number
  active: number
  inactive: number
  by_category: Record<string, number>
  by_quality: Record<string, number>
}

interface GenerateProgress {
  total: number
  completed: number
  passed: number
  failed: number
  is_running: boolean
  errors: string[]
}

interface GeneratedRecord {
  index: number
  category: string
  title: string
  description: string
  conversation_json: ConversationTurn[]
  turn_count: number
}

export default function CorpusView({ capabilities }: { capabilities: RuntimeCapabilities | null }) {
  const request = useBusinessApi()
  const { activeTenant } = useAuth()
  const [records, setRecords] = useState<CustomConversation[]>([])
  const [stats, setStats] = useState<CorpusStats | null>(null)
  const [category, setCategory] = useState('')
  const [quality, setQuality] = useState('')
  const [editing, setEditing] = useState<CustomConversation | null | undefined>(undefined)
  const [title, setTitle] = useState('')
  const [editCategory, setEditCategory] = useState('sales')
  const [editQuality, setEditQuality] = useState('high')
  const [turnsJson, setTurnsJson] = useState('[\n  {"role": "user", "content": ""},\n  {"role": "assistant", "content": ""}\n]')
  const [generateCount, setGenerateCount] = useState('20')
  const [generateCategory, setGenerateCategory] = useState('sales')
  const [progress, setProgress] = useState<GenerateProgress | null>(null)
  const [generated, setGenerated] = useState<GeneratedRecord[]>([])
  const [approved, setApproved] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async (nextCategory: string, nextQuality: string) => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ limit: '200' })
      if (nextCategory) query.set('category', nextCategory)
      if (nextQuality) query.set('quality', nextQuality)
      const [nextRecords, nextStats, nextProgress] = await Promise.all([
        request<CustomConversation[]>(`${API}/custom/conversations?${query}`),
        request<CorpusStats>(`${API}/custom/stats`),
        request<GenerateProgress>(`${API}/custom/conversations/generate/progress`),
      ])
      setRecords(nextRecords)
      setStats(nextStats)
      setProgress(nextProgress)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '训练语料加载失败')
    } finally {
      setLoading(false)
    }
  }, [request])

  useEffect(() => {
    setRecords([])
    setGenerated([])
    setApproved([])
    void load('', '')
  }, [activeTenant?.id, load])

  useEffect(() => {
    if (!progress?.is_running) return
    const timer = window.setInterval(async () => {
      try {
        const next = await request<GenerateProgress>(`${API}/custom/conversations/generate/progress`)
        setProgress(next)
        if (!next.is_running) {
          const result = await request<{ total: number; results: GeneratedRecord[] }>(`${API}/custom/conversations/generate/results`)
          setGenerated(result.results)
          setApproved(result.results.map(item => item.index))
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '生成进度读取失败')
      }
    }, 1500)
    return () => window.clearInterval(timer)
  }, [progress?.is_running, request])

  function beginCreate() {
    setEditing(null)
    setTitle('')
    setEditCategory('sales')
    setEditQuality('high')
    setTurnsJson('[\n  {"role": "user", "content": ""},\n  {"role": "assistant", "content": ""}\n]')
  }

  function beginEdit(record: CustomConversation) {
    setEditing(record)
    setTitle(record.title || '')
    setEditCategory(record.category)
    setEditQuality(record.quality)
    setTurnsJson(JSON.stringify(record.conversation_json, null, 2))
  }

  function parseTurns() {
    const value = JSON.parse(turnsJson) as ConversationTurn[]
    if (!Array.isArray(value) || value.length < 2) throw new Error('对话至少需要 2 轮')
    if (value.some(turn => !['user', 'assistant', 'system'].includes(turn.role) || typeof turn.content !== 'string' || !turn.content.trim())) throw new Error('每轮必须包含有效 role 与非空 content')
    return value
  }

  async function saveConversation() {
    setError('')
    let turns: ConversationTurn[]
    try {
      turns = parseTurns()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '对话 JSON 无效')
      return
    }
    setActionLoading(true)
    try {
      const payload = { title: title.trim() || null, category: editCategory, quality: editQuality, conversation_json: turns }
      if (editing) await request(`${API}/custom/conversations/${editing.id}`, jsonRequest('PUT', payload))
      else await request(`${API}/custom/conversations`, jsonRequest('POST', payload))
      setEditing(undefined)
      setSuccess(editing ? '训练语料已更新' : '训练语料已创建')
      await load(category, quality)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '训练语料保存失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function recordAction(record: CustomConversation, action: 'toggle' | 'delete') {
    setActionLoading(true)
    setError('')
    try {
      await request(`${API}/custom/conversations/${record.id}${action === 'toggle' ? '/toggle' : ''}`, jsonRequest(action === 'toggle' ? 'POST' : 'DELETE'))
      await load(category, quality)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '训练语料更新失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function startGeneration() {
    const count = Number(generateCount)
    if (!Number.isInteger(count) || count < 1 || count > 500) {
      setError('生成数量必须是 1 到 500 的整数')
      return
    }
    setActionLoading(true)
    setError('')
    setSuccess('')
    setGenerated([])
    try {
      await request(`${API}/custom/conversations/generate`, jsonRequest('POST', { target_count: count, categories: [generateCategory] }))
      setProgress({ total: count, completed: 0, passed: 0, failed: 0, is_running: true, errors: [] })
      setSuccess('AI 语料生成任务已启动')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'AI 语料生成启动失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function stopGeneration() {
    try {
      const result = await request<{ message: string }>(`${API}/custom/conversations/generate/stop`, jsonRequest('POST'))
      setSuccess(result.message)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '停止生成失败')
    }
  }

  async function saveGenerated() {
    if (!approved.length) return
    setActionLoading(true)
    setError('')
    try {
      const result = await request<{ message: string }>(`${API}/custom/conversations/generate/save`, jsonRequest('POST', { approved_indices: approved }))
      setGenerated([])
      setApproved([])
      setSuccess(result.message)
      await load(category, quality)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '生成语料保存失败')
    } finally {
      setActionLoading(false)
    }
  }

  const llmReady = capabilities?.capabilities.rag_answer === true
  const percent = progress?.total ? Math.round(progress.completed / progress.total * 100) : 0

  return (
    <div className="space-y-8" data-testid="sales-corpus-view">
      {!llmReady && <DependencyNotice title="LLM 服务未配置" detail="人工语料 CRUD 正常可用；批量合成任务已停用且不会生成演示数据。" />}
      <ActionMessage loading={actionLoading} error={error} success={success} />

      <section>
        <SectionHeading title="自定义训练语料" detail="人工维护或审核 AI 合成的多轮对话，可启停并参与后续训练集导出。" action={<button className={primaryButtonClass} onClick={beginCreate}><Plus size={14} /> 新建语料</button>} />
        <div className="mt-4">{loading ? <ActionMessage loading /> : stats && <MetricStrip items={[
          { label: '语料总数', value: stats.total }, { label: '启用', value: stats.active }, { label: '停用', value: stats.inactive }, { label: '高质量', value: stats.by_quality.high || 0 },
        ]} />}</div>
        <div className="mt-4 flex flex-wrap gap-3"><select className={`${fieldClass} w-40`} value={category} onChange={event => { setCategory(event.target.value); void load(event.target.value, quality) }}><option value="">全部分类</option>{CATEGORIES.map(value => <option key={value}>{value}</option>)}</select><select className={`${fieldClass} w-36`} value={quality} onChange={event => { setQuality(event.target.value); void load(category, event.target.value) }}><option value="">全部质量</option><option value="high">high</option><option value="medium">medium</option><option value="low">low</option></select><button className={secondaryButtonClass} onClick={() => void load(category, quality)}><RefreshCw size={14} /> 刷新</button></div>
        <div className="mt-4 border-y border-border">
          {!records.length ? <InlineEmpty>暂无自定义训练语料</InlineEmpty> : records.map(record => (
            <article key={record.id} className="grid gap-3 border-b border-border px-3 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-sm text-text">{record.title || `对话 #${record.id}`}</span><span className={record.is_active ? 'text-[11px] text-success' : 'text-[11px] text-text-tertiary'}>{record.is_active ? '启用' : '停用'}</span><span className="text-[11px] text-text-tertiary">{record.category} · {record.quality} · {record.source}</span></div><div className="mt-2 space-y-1">{record.conversation_json.slice(0, 3).map((turn, index) => <p key={index} className="line-clamp-2 text-xs leading-5 text-text-secondary"><span className="text-text-tertiary">{turn.role}：</span>{turn.content}</p>)}</div></div>
              <div className="flex items-start gap-1"><IconAction icon={record.is_active ? Pause : Play} label={record.is_active ? '停用语料' : '启用语料'} onClick={() => void recordAction(record, 'toggle')} /><IconAction icon={Pencil} label="编辑语料" onClick={() => beginEdit(record)} /><IconAction icon={Trash2} label="删除语料" danger onClick={() => void recordAction(record, 'delete')} /></div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <SectionHeading title="AI 批量合成" detail="根据原项目销售场景模板生成候选对话。结果必须人工勾选后才进入训练语料。" />
        <div className="mt-4 grid gap-3 sm:grid-cols-[140px_180px_auto] sm:items-end"><label className="text-[11px] text-text-tertiary">目标数量<input className={`${fieldClass} mt-1`} type="number" min="1" max="500" value={generateCount} onChange={event => setGenerateCount(event.target.value)} /></label><label className="text-[11px] text-text-tertiary">生成分类<select className={`${fieldClass} mt-1`} value={generateCategory} onChange={event => setGenerateCategory(event.target.value)}>{CATEGORIES.filter(value => value !== 'casual').map(value => <option key={value}>{value}</option>)}</select></label><div className="flex gap-2"><button className={primaryButtonClass} disabled={!llmReady || progress?.is_running || actionLoading} onClick={() => void startGeneration()}><Sparkles size={14} /> 开始生成</button>{progress?.is_running && <button className={secondaryButtonClass} onClick={() => void stopGeneration()}><Pause size={14} /> 停止</button>}</div></div>
        {progress && (progress.is_running || progress.completed > 0) && <div className="mt-4 border-y border-border px-3 py-3"><div className="flex justify-between text-[11px] text-text-tertiary"><span>完成 {progress.completed}/{progress.total} · 通过 {progress.passed} · 失败 {progress.failed}</span><span>{percent}%</span></div><div className="mt-2 h-1 bg-surface"><div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} /></div></div>}
        {generated.length > 0 && <div className="mt-4"><div className="flex items-center justify-between gap-3"><span className="text-xs text-text-secondary">待审核结果 {generated.length} 条，已选 {approved.length} 条</span><button className={primaryButtonClass} disabled={!approved.length} onClick={() => void saveGenerated()}><Check size={14} /> 保存已选</button></div><div className="mt-3 max-h-[480px] overflow-y-auto border-y border-border">{generated.map(item => <label key={item.index} className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-border px-3 py-3 last:border-b-0 hover:bg-surface"><input className="mt-1" type="checkbox" checked={approved.includes(item.index)} onChange={event => setApproved(current => event.target.checked ? [...current, item.index] : current.filter(index => index !== item.index))} /><div><div className="text-xs text-text">{item.title || `候选 #${item.index}`} <span className="ml-2 text-[11px] text-text-tertiary">{item.category} · {item.turn_count} 轮</span></div><p className="mt-1 line-clamp-2 text-xs leading-5 text-text-secondary">{item.conversation_json.map(turn => `${turn.role}: ${turn.content}`).join(' / ')}</p></div></label>)}</div></div>}
      </section>

      <Modal open={editing !== undefined} onClose={() => setEditing(undefined)} title={editing ? '编辑训练语料' : '新建训练语料'}><div className="space-y-4"><label className="block text-xs text-text-secondary">标题<input autoFocus className={`${fieldClass} mt-2`} value={title} onChange={event => setTitle(event.target.value)} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-text-secondary">分类<select className={`${fieldClass} mt-2`} value={editCategory} onChange={event => setEditCategory(event.target.value)}>{CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label><label className="text-xs text-text-secondary">质量<select className={`${fieldClass} mt-2`} value={editQuality} onChange={event => setEditQuality(event.target.value)}><option value="high">high</option><option value="medium">medium</option><option value="low">low</option></select></label></div><label className="block text-xs text-text-secondary">对话 JSON<textarea className={`${textareaClass} mt-2 min-h-72 font-mono`} value={turnsJson} onChange={event => setTurnsJson(event.target.value)} /></label><button className={`${primaryButtonClass} w-full`} onClick={() => void saveConversation()}><Check size={14} /> 保存语料</button></div></Modal>
    </div>
  )
}
