import { useEffect, useMemo, useState } from 'react'
import { CalendarPlus, Check, FilePlus2, Image, Plus, RefreshCw, RotateCcw, Sparkles, Trash2, Video } from 'lucide-react'
import Modal from '../../components/Modal'
import { CollectionState, EmptyWorkspace, StatusText } from '../../components/WorkspaceShell'
import { useBusinessApi, useBusinessCollection } from '../../lib/businessApi'
import { jsonRequest } from '../../lib/http'
import { ActionState, SectionHeading, iconButton, inputClass, primaryButton, secondaryButton, textareaClass } from './ui'

interface ContentBrief {
  id: string
  title: string
  product: string
  goal: string
  channel: string
  tone: string
  status: 'draft' | 'topic_review' | 'content_review' | 'approved' | 'rejected'
  topics: string[]
  selectedTopic: string
  draft: string
  executionMode: string
  createdAt: string
  updatedAt: string
}

interface MediaIntent {
  id: string
  briefId: string
  title: string
  kind: '海报' | '短视频' | '平台适配'
  status: string
  dependency: string
  createdAt: string
}

interface CalendarEvent {
  id: string
  briefId: string
  title: string
  channel: string
  date: string
  status: 'planned' | 'ready'
  createdAt: string
}

const statusLabels: Record<ContentBrief['status'], string> = {
  draft: '待生成选题',
  topic_review: '待确认选题',
  content_review: '待人工审核',
  approved: '已通过',
  rejected: '已退回',
}

export function BriefWorkflowView() {
  const api = useBusinessApi()
  const briefs = useBusinessCollection<ContentBrief>('/api/v1/content/briefs')
  const mediaIntents = useBusinessCollection<MediaIntent>('/api/v1/content/media-intents')
  const [selectedId, setSelectedId] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [product, setProduct] = useState('')
  const [goal, setGoal] = useState('新品首发与有效转化')
  const [channel, setChannel] = useState('小红书')
  const [tone, setTone] = useState('专业、克制、基于事实')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!selectedId || !briefs.items.some(brief => brief.id === selectedId)) {
      setSelectedId(briefs.items[0]?.id || '')
    }
  }, [briefs.items, selectedId])

  const selected = briefs.items.find(brief => brief.id === selectedId) || null
  const selectedIntents = mediaIntents.items.filter(intent => intent.briefId === selectedId)

  function replaceBrief(updated: ContentBrief) {
    briefs.setItems(current => current.map(brief => brief.id === updated.id ? updated : brief))
  }

  async function createBrief() {
    if (!title.trim() || !product.trim() || !goal.trim() || !channel.trim() || !tone.trim()) return
    setLoading(true)
    setError('')
    try {
      const created = await api<ContentBrief>('/api/v1/content/briefs', jsonRequest('POST', {
        title: title.trim(),
        product: product.trim(),
        goal: goal.trim(),
        channel: channel.trim(),
        tone: tone.trim(),
      }))
      briefs.setItems(current => [created, ...current])
      setSelectedId(created.id)
      setDialogOpen(false)
      setTitle('')
      setProduct('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '运营简报创建失败')
    } finally {
      setLoading(false)
    }
  }

  async function mutateBrief(path: string, body?: Record<string, string>) {
    if (!selected) return
    setLoading(true)
    setError('')
    try {
      const updated = await api<ContentBrief>(`/api/v1/content/briefs/${selected.id}${path}`, jsonRequest('POST', body))
      replaceBrief(updated)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '运营工作流执行失败')
    } finally {
      setLoading(false)
    }
  }

  async function deleteBrief() {
    if (!selected) return
    setLoading(true)
    setError('')
    try {
      await api<void>(`/api/v1/content/briefs/${selected.id}`, jsonRequest('DELETE'))
      briefs.setItems(current => current.filter(brief => brief.id !== selected.id))
      mediaIntents.setItems(current => current.filter(intent => intent.briefId !== selected.id))
      setSelectedId('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '运营简报删除失败')
    } finally {
      setLoading(false)
    }
  }

  async function createMediaIntent(kind: MediaIntent['kind']) {
    if (!selected) return
    setLoading(true)
    setError('')
    try {
      const created = await api<MediaIntent>('/api/v1/content/media-intents', jsonRequest('POST', { briefId: selected.id, kind }))
      mediaIntents.setItems(current => [created, ...current])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '生产请求创建失败')
    } finally {
      setLoading(false)
    }
  }

  async function deleteMediaIntent(intentId: string) {
    setError('')
    try {
      await api<void>(`/api/v1/content/media-intents/${intentId}`, jsonRequest('DELETE'))
      mediaIntents.setItems(current => current.filter(intent => intent.id !== intentId))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '生产请求删除失败')
    }
  }

  return (
    <section aria-label="运营简报工作流">
      <SectionHeading
        title="运营简报与人工审核"
        detail="控制面保留确定性的业务状态；外部模型未配置时使用明确标记的演示内容。"
        action={<div className="flex items-center gap-1"><button onClick={() => { void briefs.reload(); void mediaIntents.reload() }} className={iconButton} title="刷新" aria-label="刷新运营简报"><RefreshCw size={14} /></button><button onClick={() => setDialogOpen(true)} className="flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-3 text-xs text-page"><Plus size={14} /> 创建运营简报</button></div>}
      />
      <div className="mt-5"><CollectionState loading={briefs.loading} error={briefs.error} /></div>
      <div className="mt-5 grid min-w-0 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="min-w-0 border-y border-border">
          {!briefs.loading && !briefs.error && briefs.items.length === 0 && <div className="px-3 py-10 text-center text-xs text-text-tertiary">暂无运营简报</div>}
          {briefs.items.map(brief => (
            <button key={brief.id} onClick={() => setSelectedId(brief.id)} className={`block w-full min-w-0 border-b border-border px-3 py-3 text-left last:border-b-0 ${selectedId === brief.id ? 'bg-surface' : ''}`}>
              <div className="truncate text-sm text-text">{brief.title}</div>
              <div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-[11px] text-text-tertiary"><span className="truncate">{brief.product}</span><span className="shrink-0">{statusLabels[brief.status]}</span></div>
            </button>
          ))}
        </aside>

        <div className="min-w-0">
          <ActionState loading={loading} error={error} />
          {!selected && !briefs.loading && !briefs.error && <EmptyWorkspace title="创建第一份运营简报" detail="简报会经过选题确认、草稿生成和人工审核后进入排期与生产。" />}
          {selected && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-y border-border py-4">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words text-base font-medium text-text">{selected.title}</h3><StatusText tone={selected.status === 'approved' ? 'success' : selected.status === 'rejected' ? 'danger' : 'neutral'}>{statusLabels[selected.status]}</StatusText></div><p className="mt-2 break-words text-xs leading-5 text-text-tertiary">{selected.product} · {selected.goal} · {selected.channel}</p></div>
                <button onClick={() => void deleteBrief()} className={`${iconButton} hover:text-danger`} title="删除运营简报" aria-label={`删除 ${selected.title}`}><Trash2 size={14} /></button>
              </div>

              {(selected.status === 'draft' || selected.status === 'rejected') && <button onClick={() => void mutateBrief('/topics')} disabled={loading} className={primaryButton}><Sparkles size={14} /> 生成演示选题</button>}

              {selected.topics.length > 0 && (
                <div><h3 className="text-xs font-medium text-text">候选选题</h3><div className="mt-3 divide-y divide-border border-y border-border">{selected.topics.map((topic, index) => <button key={topic} onClick={() => void mutateBrief('/topic', { topic })} disabled={selected.status !== 'topic_review' || loading} className={`flex w-full min-w-0 items-start gap-3 py-3 text-left text-sm leading-6 ${selected.selectedTopic === topic ? 'text-text' : 'text-text-secondary'} disabled:cursor-default`}><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px]">{selected.selectedTopic === topic ? <Check size={11} /> : index + 1}</span><span className="min-w-0 break-words">{topic}</span></button>)}</div></div>
              )}

              {selected.status === 'topic_review' && selected.selectedTopic && <button onClick={() => void mutateBrief('/draft')} disabled={loading} className={primaryButton}><FilePlus2 size={14} /> 生成演示草稿</button>}

              {selected.draft && (
                <div><div className="flex items-center justify-between gap-3"><h3 className="text-xs font-medium text-text">内容版本 v1</h3><span className="text-[10px] text-text-tertiary">{selected.executionMode === 'fallback' ? '未配置模型 · 演示降级' : selected.executionMode}</span></div><div className="mt-3 max-h-[480px] overflow-y-auto whitespace-pre-wrap break-words border-y border-border bg-surface px-4 py-5 text-sm leading-7 text-text-secondary">{selected.draft}</div></div>
              )}

              {selected.status === 'content_review' && <div className="flex flex-wrap justify-end gap-2"><button onClick={() => void mutateBrief('/review', { decision: 'rejected' })} disabled={loading} className={secondaryButton}><RotateCcw size={13} /> 退回修改</button><button onClick={() => void mutateBrief('/review', { decision: 'approved' })} disabled={loading} className={primaryButton}><Check size={13} /> 审核通过</button></div>}

              {selected.status === 'approved' && (
                <div className="space-y-4"><div className="flex items-center gap-2 border-y border-success/30 bg-success-muted px-3 py-3 text-xs text-success"><Check size={14} /> 内容版本已通过</div><div><h3 className="text-xs font-medium text-text">下游生产请求</h3><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void createMediaIntent('海报')} className={secondaryButton}><Image size={13} /> 海报</button><button onClick={() => void createMediaIntent('短视频')} className={secondaryButton}><Video size={13} /> 短视频</button><button onClick={() => void createMediaIntent('平台适配')} className={secondaryButton}><Sparkles size={13} /> 平台适配</button></div></div></div>
              )}

              {selectedIntents.length > 0 && <div className="divide-y divide-border border-y border-border">{selectedIntents.map(intent => <div key={intent.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3"><div className="min-w-0"><div className="truncate text-xs text-text">{intent.kind} · {intent.title}</div><div className="mt-1 truncate text-[10px] text-text-tertiary">{intent.status === 'blocked' ? `等待依赖：${intent.dependency}` : intent.status}</div></div><button onClick={() => void deleteMediaIntent(intent.id)} className={`${iconButton} hover:text-danger`} title="删除生产请求" aria-label={`删除 ${intent.kind}生产请求`}><Trash2 size={13} /></button></div>)}</div>}
            </div>
          )}
        </div>
      </div>

      <Modal open={dialogOpen} onClose={() => setDialogOpen(false)} title="创建运营简报">
        <div className="space-y-4">
          <label className="block text-xs text-text-secondary">简报名称<input value={title} onChange={event => setTitle(event.target.value)} className={inputClass} autoFocus aria-label="简报名称" /></label>
          <label className="block text-xs text-text-secondary">商品或主题<input value={product} onChange={event => setProduct(event.target.value)} className={inputClass} aria-label="商品或主题" /></label>
          <label className="block text-xs text-text-secondary">运营目标<textarea value={goal} onChange={event => setGoal(event.target.value)} className={textareaClass} /></label>
          <div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs text-text-secondary">发布渠道<select value={channel} onChange={event => setChannel(event.target.value)} className={inputClass}><option>小红书</option><option>抖音</option><option>微信公众号</option><option>B 站</option><option>微博</option></select></label><label className="block text-xs text-text-secondary">表达语气<input value={tone} onChange={event => setTone(event.target.value)} className={inputClass} /></label></div>
          <button onClick={() => void createBrief()} disabled={!title.trim() || !product.trim() || !goal.trim() || !channel.trim() || !tone.trim() || loading} className={`${primaryButton} w-full`}>保存并进入工作流</button>
        </div>
      </Modal>
    </section>
  )
}

export function OperationsCalendarView() {
  const api = useBusinessApi()
  const briefs = useBusinessCollection<ContentBrief>('/api/v1/content/briefs')
  const events = useBusinessCollection<CalendarEvent>('/api/v1/content/calendar-events')
  const approvedBriefs = useMemo(() => briefs.items.filter(brief => brief.status === 'approved'), [briefs.items])
  const [briefId, setBriefId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!briefId || !approvedBriefs.some(brief => brief.id === briefId)) setBriefId(approvedBriefs[0]?.id || '')
  }, [approvedBriefs, briefId])

  async function createEvent() {
    if (!briefId || !date) return
    setLoading(true)
    setError('')
    try {
      const created = await api<CalendarEvent>('/api/v1/content/calendar-events', jsonRequest('POST', { briefId, date }))
      events.setItems(current => [created, ...current])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '内容排期创建失败')
    } finally {
      setLoading(false)
    }
  }

  async function markReady(eventId: string) {
    setError('')
    try {
      const updated = await api<CalendarEvent>(`/api/v1/content/calendar-events/${eventId}/ready`, jsonRequest('POST'))
      events.setItems(current => current.map(event => event.id === eventId ? updated : event))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '日历状态更新失败')
    }
  }

  async function deleteEvent(eventId: string) {
    setError('')
    try {
      await api<void>(`/api/v1/content/calendar-events/${eventId}`, jsonRequest('DELETE'))
      events.setItems(current => current.filter(event => event.id !== eventId))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '日历条目删除失败')
    }
  }

  return (
    <section aria-label="运营日历">
      <SectionHeading title="已审核内容排期" detail="只有通过人工审核的内容可以进入发布准备队列。" action={<button onClick={() => { void briefs.reload(); void events.reload() }} className={iconButton} title="刷新" aria-label="刷新运营日历"><RefreshCw size={14} /></button>} />
      <div className="mt-5 grid gap-3 border-y border-border py-4 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end">
        <label className="block min-w-0 text-xs text-text-secondary">已审核内容<select value={briefId} onChange={event => setBriefId(event.target.value)} className={inputClass} aria-label="已审核内容"><option value="">请选择已审核内容</option>{approvedBriefs.map(brief => <option key={brief.id} value={brief.id}>{brief.title}</option>)}</select></label>
        <label className="block text-xs text-text-secondary">计划日期<input type="date" value={date} onChange={event => setDate(event.target.value)} className={inputClass} /></label>
        <button onClick={() => void createEvent()} disabled={!briefId || !date || loading} className={`${primaryButton} sm:mb-0.5`}><CalendarPlus size={14} /> 加入日历</button>
      </div>
      <div className="mt-4"><ActionState loading={loading} error={error} /></div>
      <div className="mt-5"><CollectionState loading={events.loading || briefs.loading} error={events.error || briefs.error} /></div>
      {!events.loading && !events.error && events.items.length === 0 && <EmptyWorkspace title="运营日历暂无内容" detail="先在运营简报中完成人工审核，再将内容安排到具体日期。" />}
      {events.items.length > 0 && <div className="divide-y divide-border border-y border-border">{events.items.map(event => <div key={event.id} className="grid min-w-0 gap-3 py-4 sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:items-center"><div className="font-mono text-xs text-text-tertiary">{event.date}</div><div className="min-w-0"><div className="truncate text-sm text-text">{event.title}</div><div className="mt-1 text-[11px] text-text-tertiary">{event.channel} · {event.status === 'ready' ? '已准备' : '待准备'}</div></div><div className="flex items-center"><button onClick={() => void markReady(event.id)} disabled={event.status === 'ready'} className={iconButton} title={event.status === 'ready' ? '已准备' : '标记准备'} aria-label={`${event.status === 'ready' ? '已准备' : '准备'} ${event.title}`}><Check size={14} /></button><button onClick={() => void deleteEvent(event.id)} className={`${iconButton} hover:text-danger`} title="移出日历" aria-label={`移出日历 ${event.title}`}><Trash2 size={14} /></button></div></div>)}</div>}
    </section>
  )
}
