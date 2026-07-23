import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, FileText, Play, RotateCcw, Trash2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useBusinessApi, useBusinessStreamApi } from '../../lib/businessApi'
import { jsonRequest } from '../../lib/http'
import { campaignPath, type WorkflowState, type WorkflowThread } from './api'
import { ActionState, RefreshButton, SectionHeading, inputClass, primaryButton, secondaryButton, textareaClass } from './ui'

interface ThreadResponse { threads: WorkflowThread[]; total: number }
interface SseEnvelope { type: string; data: Record<string, unknown> }

export default function WorkflowView() {
  const request = useBusinessApi()
  const streamRequest = useBusinessStreamApi()
  const { activeTenant } = useAuth()
  const [threads, setThreads] = useState<WorkflowThread[]>([])
  const [activeId, setActiveId] = useState('')
  const [state, setState] = useState<WorkflowState | null>(null)
  const [direction, setDirection] = useState('')
  const [feedback, setFeedback] = useState('')
  const [streamText, setStreamText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadThreads = useCallback(async () => {
    setError('')
    try {
      const response = await request<ThreadResponse>(campaignPath('/workflow/threads'))
      setThreads(response.threads)
      setActiveId(current => current || response.threads[0]?.thread_id || '')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '工作流列表加载失败')
    }
  }, [request])

  const loadState = useCallback(async (threadId: string) => {
    if (!threadId) { setState(null); return }
    setError('')
    try {
      setState(await request<WorkflowState>(campaignPath(`/workflow/state/${encodeURIComponent(threadId)}`)))
    } catch (reason) {
      setState(null)
      setError(reason instanceof Error ? reason.message : '工作流状态加载失败')
    }
  }, [request])

  useEffect(() => { setThreads([]); setActiveId(''); setState(null); void loadThreads() }, [activeTenant?.id, loadThreads])
  useEffect(() => { void loadState(activeId) }, [activeId, loadState])

  async function startWorkflow() {
    if (!direction.trim()) return
    setLoading(true); setError(''); setStreamText('')
    try {
      const created = await request<{ thread_id: string }>(campaignPath('/workflow/start'), jsonRequest('POST', { topic_direction: direction.trim() }))
      setDirection('')
      setActiveId(created.thread_id)
      await loadThreads()
      await loadState(created.thread_id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '工作流启动失败')
    } finally { setLoading(false) }
  }

  async function resume(action: 'select_topic' | 'approve' | 'reject', data?: Record<string, string>) {
    if (!activeId) return
    setLoading(true); setError(''); setStreamText('')
    try {
      if (action === 'select_topic' || action === 'reject') {
        const response = await streamRequest(campaignPath(`/workflow/stream/resume/${encodeURIComponent(activeId)}`), jsonRequest('POST', { action, data }))
        await consumeSse(response, event => {
          if (event.type === 'llm_token') setStreamText(current => current + String(event.data.content || ''))
          if (event.type === 'error') throw new Error(String(event.data.message || '内容生成失败'))
        })
      } else {
        await request(campaignPath(`/workflow/resume/${encodeURIComponent(activeId)}`), jsonRequest('POST', { action, data }))
      }
      setFeedback('')
      await loadState(activeId)
      await loadThreads()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '工作流恢复失败')
    } finally { setLoading(false) }
  }

  async function deleteThread(threadId: string) {
    setError('')
    try {
      await request(campaignPath(`/workflow/threads/${encodeURIComponent(threadId)}`), jsonRequest('DELETE'))
      if (activeId === threadId) { setActiveId(''); setState(null) }
      await loadThreads()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '工作流删除失败') }
  }

  const values = state?.values || {}
  const topics = useMemo(() => Array.isArray(values.generated_topics) ? values.generated_topics.map(String) : [], [values.generated_topics])
  const article = streamText || String(values.article_content || '')
  const actionRequired = state?.interrupt_info?.action_required

  return (
    <section aria-label="内容创作工作流">
      <SectionHeading title="选题与内容审批" detail="LangGraph 线程按租户和平台用户隔离。" action={<RefreshButton onClick={() => { void loadThreads(); if (activeId) void loadState(activeId) }} />} />
      <div className="mt-5 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-w-0 border-y border-border">
          <div className="p-3">
            <label className="block text-xs text-text-secondary">主题方向<input value={direction} onChange={event => setDirection(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void startWorkflow() }} className={inputClass} placeholder="输入商品、活动或内容方向" /></label>
            <button onClick={() => void startWorkflow()} disabled={!direction.trim() || loading} className={`${primaryButton} mt-3 w-full`}><Play size={13} /> 启动工作流</button>
          </div>
          <div className="border-t border-border">
            {threads.length === 0 ? <div className="px-3 py-8 text-center text-xs text-text-tertiary">暂无线程</div> : threads.map(thread => (
              <div key={thread.thread_id} className={`grid grid-cols-[minmax(0,1fr)_32px] border-b border-border last:border-b-0 ${activeId === thread.thread_id ? 'bg-surface' : ''}`}>
                <button onClick={() => setActiveId(thread.thread_id)} className="min-w-0 px-3 py-3 text-left"><div className="truncate text-xs text-text">{thread.topic_direction || '未命名主题'}</div><div className="mt-1 truncate text-[10px] text-text-tertiary">{thread.status} · {thread.is_completed ? '已完成' : '进行中'}</div></button>
                <button onClick={() => void deleteThread(thread.thread_id)} className="text-text-tertiary hover:text-danger" title="删除线程" aria-label={`删除 ${thread.topic_direction}`}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </aside>

        <div className="min-w-0">
          <ActionState loading={loading} error={error} />
          {!activeId && !error ? <div className="border-y border-border py-16 text-center text-sm text-text-tertiary">选择线程或启动新工作流</div> : state && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-3"><div className="flex items-center gap-2"><FileText size={14} className="text-text-tertiary" /><span className="text-sm text-text">{String(values.topic_direction || '内容线程')}</span></div><span className="text-xs text-text-tertiary">{state.status}</span></div>

              {actionRequired === 'select_topic' && (
                <div><h3 className="text-xs font-medium text-text">候选选题</h3><div className="mt-3 divide-y divide-border border-y border-border">{topics.map((topic, index) => <button key={topic} disabled={loading} onClick={() => void resume('select_topic', { selected_topic: topic })} className="flex w-full items-center gap-3 py-3 text-left text-sm text-text-secondary hover:text-text"><span className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-[10px] text-text-tertiary">{index + 1}</span><span>{topic}</span></button>)}</div></div>
              )}

              {(actionRequired === 'review' || article) && (
                <div><div className="flex items-center justify-between"><h3 className="text-xs font-medium text-text">文章草稿</h3><span className="text-[10px] text-text-tertiary">{article.length} 字符</span></div><div className="mt-3 max-h-[520px] overflow-y-auto whitespace-pre-wrap border-y border-border bg-surface px-4 py-5 text-sm leading-7 text-text-secondary">{article || state.interrupt_info?.article_preview}</div></div>
              )}

              {actionRequired === 'review' && (
                <div className="border-t border-border pt-4"><label className="block text-xs text-text-secondary">驳回意见<textarea value={feedback} onChange={event => setFeedback(event.target.value)} className={textareaClass} placeholder="仅驳回时填写" /></label><div className="mt-3 flex justify-end gap-2"><button onClick={() => void resume('reject', { feedback })} className={secondaryButton}><RotateCcw size={13} /> 驳回重写</button><button onClick={() => void resume('approve')} className={primaryButton}><Check size={13} /> 审核并生成配图</button></div></div>
              )}

              {state.is_completed && <div className="flex items-center gap-2 border-y border-success/30 bg-success-muted px-3 py-3 text-xs text-success"><Check size={14} /> 内容、审核与配图流程已完成</div>}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

async function consumeSse(response: Response, onEvent: (event: SseEnvelope) => void) {
  if (!response.body) throw new Error('服务器未返回响应流')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() || ''
    for (const block of blocks) {
      const line = block.split('\n').find(item => item.startsWith('data:'))
      if (!line) continue
      onEvent(JSON.parse(line.slice(5).trim()) as SseEnvelope)
    }
  }
}
