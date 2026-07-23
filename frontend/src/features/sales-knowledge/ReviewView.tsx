import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Pencil, Play, Send, Trash2, X } from 'lucide-react'
import Modal from '../../components/Modal'
import { useAuth } from '../../contexts/AuthContext'
import { useBusinessApi } from '../../lib/businessApi'
import { jsonRequest } from '../../lib/http'
import type { StagingConversation, StagingList } from './types'
import { ActionMessage, fieldClass, IconAction, InlineEmpty, Pager, primaryButtonClass, secondaryButtonClass, SectionHeading, textareaClass } from './ui'

const API = '/api/v1/sales-knowledge'
const CATEGORIES = ['sales', 'course', 'objection', 'closing', 'followup', 'qa', 'knowledge']

export default function ReviewView() {
  const request = useBusinessApi()
  const { activeTenant } = useAuth()
  const [records, setRecords] = useState<StagingList | null>(null)
  const [status, setStatus] = useState('pending')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<number[]>([])
  const [processLimit, setProcessLimit] = useState('20')
  const [windowSeconds, setWindowSeconds] = useState('300')
  const [processAll, setProcessAll] = useState(false)
  const [editing, setEditing] = useState<StagingConversation | null>(null)
  const [editText, setEditText] = useState('')
  const [editQuestion, setEditQuestion] = useState('')
  const [editAnswer, setEditAnswer] = useState('')
  const [editCategory, setEditCategory] = useState('sales')
  const [editNotes, setEditNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async (nextPage: number, nextStatus: string, nextCategory: string) => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ status: nextStatus, page: String(nextPage), page_size: '20' })
      if (nextCategory) query.set('category', nextCategory)
      setRecords(await request<StagingList>(`${API}/admin/staging/list?${query}`))
      setSelected([])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '待审核数据加载失败')
    } finally {
      setLoading(false)
    }
  }, [request])

  useEffect(() => {
    setPage(1)
    void load(1, status, category)
  }, [activeTenant?.id, category, load, status])

  const allOnPageSelected = useMemo(() => Boolean(records?.items.length) && records!.items.every(item => selected.includes(item.id)), [records, selected])

  async function preprocess() {
    const limit = Number(processLimit)
    const window = Number(windowSeconds)
    if (!processAll && (!Number.isInteger(limit) || limit < 1)) {
      setError('分批会话数必须是正整数')
      return
    }
    if (!Number.isInteger(window) || window < 30 || window > 3600) {
      setError('对话窗口必须在 30 到 3600 秒之间')
      return
    }
    setActionLoading(true)
    setError('')
    setSuccess('')
    try {
      const result = await request<{ total_created: number; processed: number; total: number; has_more: boolean }>(`${API}/admin/preprocess`, jsonRequest('POST', {
        window_seconds: window,
        limit: processAll ? undefined : limit,
        process_all: processAll,
      }))
      setSuccess(`已处理 ${result.processed}/${result.total} 个会话，生成 ${result.total_created} 条待审核对话${result.has_more ? '，仍有未处理会话' : ''}`)
      setStatus('pending')
      setPage(1)
      await load(1, 'pending', category)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '会话清洗失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function singleAction(item: StagingConversation, action: 'approve' | 'reject' | 'publish' | 'delete') {
    setActionLoading(true)
    setError('')
    setSuccess('')
    try {
      if (action === 'delete') {
        await request(`${API}/admin/staging/batch`, jsonRequest('POST', { staging_ids: [item.id], action: 'delete' }))
      } else if (action === 'approve') {
        const query = item.human_category || item.auto_category ? `?category=${encodeURIComponent(item.human_category || item.auto_category || '')}` : ''
        await request(`${API}/admin/staging/${item.id}/approve${query}`, jsonRequest('POST'))
      } else if (action === 'reject') {
        await request(`${API}/admin/staging/${item.id}/reject`, jsonRequest('POST'))
      } else {
        await request(`${API}/admin/staging/${item.id}/publish`, jsonRequest('POST'))
      }
      setSuccess(action === 'approve' ? '审核已通过' : action === 'reject' ? '记录已拒绝' : action === 'publish' ? '记录已发布到标注数据集' : '记录已删除')
      await load(page, status, category)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '审核操作失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function batchAction(action: 'approve' | 'reject' | 'delete') {
    if (!selected.length) return
    setActionLoading(true)
    setError('')
    setSuccess('')
    try {
      await request(`${API}/admin/staging/batch`, jsonRequest('POST', { staging_ids: selected, action, category: category || undefined }))
      setSuccess(`已批量${action === 'approve' ? '通过' : action === 'reject' ? '拒绝' : '删除'} ${selected.length} 条记录`)
      await load(page, status, category)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '批量审核失败')
    } finally {
      setActionLoading(false)
    }
  }

  function beginEdit(item: StagingConversation) {
    setEditing(item)
    setEditText(item.cleaned_text || item.original_text || '')
    setEditQuestion(item.human_question || item.auto_question || '')
    setEditAnswer(item.human_answer || item.auto_answer || '')
    setEditCategory(item.human_category || item.auto_category || 'sales')
    setEditNotes(item.human_notes || '')
  }

  async function saveEdit() {
    if (!editing || !editText.trim()) return
    setActionLoading(true)
    setError('')
    try {
      await request(`${API}/admin/staging/${editing.id}`, jsonRequest('PUT', {
        cleaned_text: editText.trim(),
        human_question: editQuestion.trim() || null,
        human_answer: editAnswer.trim() || null,
        human_category: editCategory,
        human_notes: editNotes.trim() || null,
      }))
      setEditing(null)
      setSuccess('审核内容已保存')
      await load(page, status, category)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '审核内容保存失败')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="space-y-7" data-testid="sales-review-view">
      <section>
        <SectionHeading title="会话清洗" detail="按时间窗口把原始消息合并成对话块。处理过程保留原始消息，不会覆盖导入证据。" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[150px_150px_minmax(0,1fr)_auto] lg:items-end">
          <label className="text-[11px] text-text-tertiary">每批会话数<input className={`${fieldClass} mt-1`} type="number" min="1" value={processLimit} disabled={processAll} onChange={event => setProcessLimit(event.target.value)} /></label>
          <label className="text-[11px] text-text-tertiary">对话窗口（秒）<input className={`${fieldClass} mt-1`} type="number" min="30" max="3600" value={windowSeconds} onChange={event => setWindowSeconds(event.target.value)} /></label>
          <label className="flex h-9 items-center gap-2 text-xs text-text-secondary"><input type="checkbox" checked={processAll} onChange={event => setProcessAll(event.target.checked)} /> 处理全部剩余会话</label>
          <button className={primaryButtonClass} disabled={actionLoading} onClick={() => void preprocess()}><Play size={14} /> 开始清洗</button>
        </div>
      </section>

      <div><ActionMessage loading={actionLoading} error={error} success={success} /></div>

      <section>
        <SectionHeading title="人工审核" detail="编辑问题与答案、修正分类，再通过、拒绝或发布到可导出的标注集。" />
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="w-36 text-[11px] text-text-tertiary">状态<select className={`${fieldClass} mt-1`} value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}><option value="pending">待审核</option><option value="modified">已修改</option><option value="approved">已通过</option><option value="rejected">已拒绝</option><option value="all">全部</option></select></label>
          <label className="w-40 text-[11px] text-text-tertiary">分类<select className={`${fieldClass} mt-1`} value={category} onChange={event => { setCategory(event.target.value); setPage(1) }}><option value="">全部分类</option>{CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label>
          <div className="ml-auto flex flex-wrap gap-2">
            <button className={secondaryButtonClass} disabled={!selected.length || actionLoading} onClick={() => void batchAction('approve')}><Check size={14} /> 批量通过</button>
            <button className={secondaryButtonClass} disabled={!selected.length || actionLoading} onClick={() => void batchAction('reject')}><X size={14} /> 批量拒绝</button>
            <button className={secondaryButtonClass} disabled={!selected.length || actionLoading} onClick={() => void batchAction('delete')}><Trash2 size={14} /> 批量删除</button>
          </div>
        </div>

        <div className="mt-4 border-y border-border">
          {loading ? <ActionMessage loading /> : !records?.items.length ? <InlineEmpty>当前筛选条件下没有待处理记录</InlineEmpty> : (
            <>
              <label className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2 text-[11px] text-text-tertiary"><input type="checkbox" checked={allOnPageSelected} onChange={event => setSelected(event.target.checked ? records.items.map(item => item.id) : [])} /> 选择本页 {records.items.length} 条</label>
              {records.items.map(item => (
                <article key={item.id} className="grid gap-3 border-b border-border px-3 py-4 last:border-b-0 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
                  <input className="mt-1" type="checkbox" checked={selected.includes(item.id)} onChange={event => setSelected(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} aria-label={`选择记录 ${item.id}`} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-tertiary"><span>#{item.id}</span><span>{item.session_id}</span><span>{item.human_category || item.auto_category || '未分类'}</span><span>质量 {item.auto_quality_score?.toFixed(1) || '-'}</span><span>{item.status}</span></div>
                    <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-text-secondary">{item.cleaned_text || item.original_text || '无正文'}</p>
                    {(item.human_question || item.auto_question) && <div className="mt-3 bg-surface px-3 py-2 text-xs leading-5"><div className="text-text-tertiary">问：{item.human_question || item.auto_question}</div><div className="mt-1 text-text-secondary">答：{item.human_answer || item.auto_answer || '未填写'}</div></div>}
                  </div>
                  <div className="flex items-start gap-1">
                    <IconAction icon={Pencil} label="编辑审核内容" onClick={() => beginEdit(item)} />
                    {item.status !== 'approved' && <IconAction icon={Check} label="审核通过" onClick={() => void singleAction(item, 'approve')} />}
                    {item.status !== 'rejected' && <IconAction icon={X} label="拒绝记录" onClick={() => void singleAction(item, 'reject')} />}
                    {item.status === 'approved' && <IconAction icon={Send} label="发布到标注数据集" onClick={() => void singleAction(item, 'publish')} />}
                    <IconAction icon={Trash2} label="删除记录" danger onClick={() => void singleAction(item, 'delete')} />
                  </div>
                </article>
              ))}
            </>
          )}
        </div>
        {records && <Pager page={page} hasMore={page * records.page_size < records.total} onChange={next => { setPage(next); void load(next, status, category) }} />}
      </section>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="编辑审核内容">
        <div className="space-y-4">
          <label className="block text-xs text-text-secondary">清洗后正文<textarea className={`${textareaClass} mt-2 min-h-36`} value={editText} onChange={event => setEditText(event.target.value)} /></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs text-text-secondary">标准问题<textarea className={`${textareaClass} mt-2`} value={editQuestion} onChange={event => setEditQuestion(event.target.value)} /></label><label className="block text-xs text-text-secondary">标准答案<textarea className={`${textareaClass} mt-2`} value={editAnswer} onChange={event => setEditAnswer(event.target.value)} /></label></div>
          <label className="block text-xs text-text-secondary">人工分类<select className={`${fieldClass} mt-2`} value={editCategory} onChange={event => setEditCategory(event.target.value)}>{CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label>
          <label className="block text-xs text-text-secondary">审核备注<textarea className={`${textareaClass} mt-2`} value={editNotes} onChange={event => setEditNotes(event.target.value)} /></label>
          <button className={`${primaryButtonClass} w-full`} disabled={!editText.trim() || actionLoading} onClick={() => void saveEdit()}><Check size={14} /> 保存修改</button>
        </div>
      </Modal>
    </div>
  )
}
