import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, ImagePlus, Plus, RefreshCw, RotateCcw, Sparkles, Trash2, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useBusinessApi, useBusinessBlobApi, useBusinessStreamApi } from '../../lib/businessApi'
import { jsonRequest } from '../../lib/http'
import {
  IMAGE_FILE_ACCEPT,
  MAX_REFERENCE_IMAGES,
  campaignPath,
  fileAsBase64,
} from './api'
import {
  ActionState,
  CampaignMedia,
  SectionHeading,
  ViewTabs,
  iconButton,
  inputClass,
  primaryButton,
  secondaryButton,
  textareaClass,
} from './ui'

type BatchMode = 'custom' | 'template'

interface TemplateSlot {
  name: string
  label?: string
  required?: boolean
}

interface TemplateItem {
  id: string
  name: string
  style_tag?: string | null
  config?: {
    text_slots?: TemplateSlot[]
    default_aspect_ratio?: string
  }
}

interface ReferenceImage {
  image_base64: string
  name: string
}

interface BatchRow {
  key: string
  title: string
  subtitle: string
  prompt: string
  params: Record<string, string>
  referenceImages: ReferenceImage[]
}

interface BatchSubmission {
  success: boolean
  task_id?: string | null
  total_count: number
  error?: string | null
}

interface BatchItemStatus {
  id?: string | null
  order_index: number
  status: string
  image_url?: string | null
  error_message?: string | null
  title: string
  subtitle: string
}

interface BatchStatus {
  task_id: string
  status: string
  total_count: number
  success_count: number
  failed_count: number
  running_count: number
  series_mode: boolean
  created_at?: string | null
  completed_at?: string | null
  items: BatchItemStatus[]
}

const modes = [
  { id: 'custom' as const, label: '自由批量' },
  { id: 'template' as const, label: '模板批量' },
]
const ratios = ['3:4', '2.35:1', '9:16', '1:1', '16:9']
const terminalStatuses = new Set(['completed', 'partial_failed', 'failed'])

function newRow(slots: TemplateSlot[] = []): BatchRow {
  return {
    key: crypto.randomUUID(),
    title: '',
    subtitle: '',
    prompt: '',
    params: Object.fromEntries(slots.map(slot => [slot.name, ''])),
    referenceImages: [],
  }
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: '等待执行',
    running: '生成中',
    success: '成功',
    completed: '全部完成',
    partial_failed: '部分失败',
    failed: '失败',
  }
  return labels[status] || status
}

async function consumeBatchEvents(
  response: Response,
  onStatus: (status: BatchStatus) => void,
) {
  if (!response.body) throw new Error('服务器未返回任务进度流')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  function consumeLine(line: string) {
    if (!line.startsWith('data:')) return
    const payload = line.slice(5).trim()
    if (!payload) return
    const event = JSON.parse(payload) as BatchStatus & { error?: string }
    if (event.error) throw new Error(event.error)
    onStatus(event)
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ''
    lines.forEach(consumeLine)
    if (done) break
  }
  if (buffer) consumeLine(buffer)
}

export default function PosterBatchPanel() {
  const request = useBusinessApi()
  const requestBlob = useBusinessBlobApi()
  const requestStream = useBusinessStreamApi()
  const { activeTenant } = useAuth()
  const [mode, setMode] = useState<BatchMode>('custom')
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [templateId, setTemplateId] = useState('')
  const [rows, setRows] = useState<BatchRow[]>([newRow()])
  const [ratio, setRatio] = useState('3:4')
  const [style, setStyle] = useState('')
  const [colorTone, setColorTone] = useState('')
  const [seriesMode, setSeriesMode] = useState(false)
  const [status, setStatus] = useState<BatchStatus | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [watching, setWatching] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const streamController = useRef<AbortController | null>(null)
  const storageKey = activeTenant ? `content-campaign:batch-task:${activeTenant.id}` : ''

  const selectedTemplate = useMemo(
    () => templates.find(template => template.id === templateId),
    [templateId, templates],
  )
  const templateSlots = useMemo(
    () => selectedTemplate?.config?.text_slots || [],
    [selectedTemplate],
  )

  const applyStatus = useCallback((nextStatus: BatchStatus) => {
    setStatus(nextStatus)
    setError('')
  }, [])

  const watchTask = useCallback(async (taskId: string) => {
    streamController.current?.abort()
    const controller = new AbortController()
    streamController.current = controller
    setWatching(true)
    try {
      const response = await requestStream(
        campaignPath(`/poster/batch/${taskId}/stream`),
        { signal: controller.signal },
      )
      await consumeBatchEvents(response, applyStatus)
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : '任务进度连接中断')
    } finally {
      if (streamController.current === controller) {
        streamController.current = null
        setWatching(false)
      }
    }
  }, [applyStatus, requestStream])

  const refreshTask = useCallback(async (taskId: string, resumeStream = false) => {
    try {
      const nextStatus = await request<BatchStatus>(campaignPath(`/poster/batch/${taskId}/status`))
      applyStatus(nextStatus)
      if (resumeStream && !terminalStatuses.has(nextStatus.status)) void watchTask(taskId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '批量任务加载失败')
    }
  }, [applyStatus, request, watchTask])

  const loadTemplates = useCallback(async () => {
    try {
      const records = await request<TemplateItem[]>(campaignPath('/templates/list?scope=all'))
      setTemplates(records)
      setTemplateId(current => current || records[0]?.id || '')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '模板加载失败')
    }
  }, [request])

  useEffect(() => {
    streamController.current?.abort()
    setStatus(null)
    setError('')
    setSuccess('')
    void loadTemplates()
    const storedTaskId = storageKey ? sessionStorage.getItem(storageKey) : null
    if (storedTaskId) void refreshTask(storedTaskId, true)
    return () => streamController.current?.abort()
  }, [activeTenant?.id, loadTemplates, refreshTask, storageKey])

  useEffect(() => {
    if (mode !== 'template' || !selectedTemplate) return
    const slots = selectedTemplate.config?.text_slots || []
    setRows(current => current.map(row => ({
      ...row,
      params: Object.fromEntries(slots.map(slot => [slot.name, row.params[slot.name] || ''])),
    })))
    if (selectedTemplate.config?.default_aspect_ratio) setRatio(selectedTemplate.config.default_aspect_ratio)
    setStyle(selectedTemplate.style_tag || '')
  }, [mode, selectedTemplate])

  function updateRow(key: string, patch: Partial<BatchRow>) {
    setRows(current => current.map(row => row.key === key ? { ...row, ...patch } : row))
  }

  function updateParam(key: string, name: string, value: string) {
    setRows(current => current.map(row => row.key === key ? { ...row, params: { ...row.params, [name]: value } } : row))
  }

  async function chooseReferences(key: string, files: FileList | null) {
    if (!files) return
    setError('')
    try {
      if (files.length > MAX_REFERENCE_IMAGES) throw new Error(`参考图片最多 ${MAX_REFERENCE_IMAGES} 张`)
      const referenceImages = await Promise.all([...files].map(async file => ({
        image_base64: (await fileAsBase64(file)).base64,
        name: file.name,
      })))
      updateRow(key, { referenceImages })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '参考图片读取失败')
    }
  }

  const validRows = mode === 'custom'
    ? rows.every(row => row.prompt.trim())
    : Boolean(templateId) && rows.every(row => templateSlots.every(slot => !slot.required || row.params[slot.name]?.trim()))

  async function submit() {
    setSubmitting(true)
    setError('')
    setSuccess('')
    streamController.current?.abort()
    try {
      const endpoint = mode === 'custom' ? '/poster/batch/generate' : '/poster/batch/template'
      const body = mode === 'custom' ? {
        mode: 'custom',
        aspect_ratio: ratio,
        color_tone: colorTone.trim() || null,
        style_tags: style.split(',').map(value => value.trim()).filter(Boolean),
        series_mode: seriesMode,
        items: rows.map(row => ({
          title: row.title.trim(),
          subtitle: row.subtitle.trim(),
          prompt: row.prompt.trim(),
        })),
      } : {
        template_id: templateId,
        items: rows.map(row => ({
          params: Object.fromEntries(Object.entries(row.params).map(([key, value]) => [key, value.trim()])),
          title: row.title.trim() || Object.values(row.params).find(value => value.trim()) || null,
          reference_images: row.referenceImages.length > 0 ? row.referenceImages : null,
        })),
        style_tag: style.trim() || null,
        color_option: colorTone.trim() || null,
        aspect_ratio: ratio,
      }
      const result = await request<BatchSubmission>(campaignPath(endpoint), jsonRequest('POST', body))
      if (!result.success || !result.task_id) throw new Error(result.error || '批量任务创建失败')
      const provisional: BatchStatus = {
        task_id: result.task_id,
        status: 'pending',
        total_count: result.total_count,
        success_count: 0,
        failed_count: 0,
        running_count: 0,
        series_mode: mode === 'custom' && seriesMode,
        items: [],
      }
      applyStatus(provisional)
      if (storageKey) sessionStorage.setItem(storageKey, result.task_id)
      void watchTask(result.task_id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '批量任务创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function retryFailed() {
    if (!status) return
    setError('')
    setSuccess('')
    try {
      const result = await request<{ queued: boolean; retried_count: number; message: string }>(
        campaignPath(`/poster/batch/${status.task_id}/retry`),
        jsonRequest('POST'),
      )
      setSuccess(result.message)
      if (result.queued) void watchTask(status.task_id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '失败项重试失败')
    }
  }

  async function downloadZip() {
    if (!status) return
    setError('')
    try {
      const download = await requestBlob(campaignPath(`/poster/batch/${status.task_id}/download`))
      const url = URL.createObjectURL(download.blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = download.filename
      anchor.click()
      URL.revokeObjectURL(url)
      setSuccess('批量图片已下载')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ZIP 下载失败')
    }
  }

  function clearTask() {
    streamController.current?.abort()
    if (storageKey) sessionStorage.removeItem(storageKey)
    setStatus(null)
    setError('')
    setSuccess('')
  }

  const progress = status?.total_count
    ? Math.round(((status.success_count + status.failed_count) / status.total_count) * 100)
    : 0

  return (
    <section aria-label="批量海报生产">
      <SectionHeading title="批量海报生产" detail="每个任务最多 50 条内容。" />
      <div className="mt-5"><ViewTabs items={modes} value={mode} onChange={value => { setMode(value); setError(''); setRows([newRow(value === 'template' ? templateSlots : [])]) }} label="批量生成模式" /></div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {mode === 'template' && <label className="block text-xs text-text-secondary">内容模板<select value={templateId} onChange={event => setTemplateId(event.target.value)} className={inputClass}>{templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>}
        <label className="block text-xs text-text-secondary">输出比例<select value={ratio} onChange={event => setRatio(event.target.value)} className={inputClass}>{ratios.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="block text-xs text-text-secondary">{mode === 'custom' ? '风格标签' : '模板风格'}<input value={style} onChange={event => setStyle(event.target.value)} className={inputClass} placeholder={mode === 'custom' ? '逗号分隔' : ''} /></label>
        <label className="block text-xs text-text-secondary">色调<input value={colorTone} onChange={event => setColorTone(event.target.value)} className={inputClass} /></label>
        {mode === 'custom' && <label className="flex h-10 items-center gap-2 self-end px-1 text-xs text-text-secondary"><input type="checkbox" checked={seriesMode} onChange={event => setSeriesMode(event.target.checked)} />系列风格一致</label>}
      </div>

      <div className="mt-6 flex items-center justify-between gap-4">
        <span className="text-xs text-text-tertiary">生成条目 {rows.length} / 50</span>
        <button onClick={() => setRows(current => [...current, newRow(mode === 'template' ? templateSlots : [])])} disabled={rows.length >= 50} className={secondaryButton}><Plus size={13} /> 添加条目</button>
      </div>
      <div className="mt-3 divide-y divide-border border-y border-border">
        {rows.map((row, index) => (
          <div key={row.key} className="py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] text-text-tertiary">{String(index + 1).padStart(2, '0')}</span>
              <button onClick={() => setRows(current => current.filter(item => item.key !== row.key))} disabled={rows.length <= 1} className={iconButton} title="删除条目" aria-label={`删除第 ${index + 1} 条`}><Trash2 size={13} /></button>
            </div>
            {mode === 'custom' ? (
              <div className="grid gap-3 lg:grid-cols-[220px_220px_minmax(0,1fr)]">
                <label className="block text-xs text-text-secondary">主标题<input value={row.title} onChange={event => updateRow(row.key, { title: event.target.value })} className={inputClass} /></label>
                <label className="block text-xs text-text-secondary">副标题<input value={row.subtitle} onChange={event => updateRow(row.key, { subtitle: event.target.value })} className={inputClass} /></label>
                <label className="block text-xs text-text-secondary">画面描述<textarea value={row.prompt} onChange={event => updateRow(row.key, { prompt: event.target.value })} className={`${textareaClass} min-h-20`} /></label>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {templateSlots.map(slot => <label key={slot.name} className="block text-xs text-text-secondary">{slot.label || slot.name}{slot.required ? ' *' : ''}<input value={row.params[slot.name] || ''} onChange={event => updateParam(row.key, slot.name, event.target.value)} className={inputClass} /></label>)}
                </div>
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-xs text-text-secondary hover:text-text">
                  <ImagePlus size={13} />
                  <span className="max-w-80 truncate">{row.referenceImages.length > 0 ? row.referenceImages.map(image => image.name).join('、') : `参考图片（最多 ${MAX_REFERENCE_IMAGES} 张）`}</span>
                  <input type="file" accept={IMAGE_FILE_ACCEPT} multiple className="sr-only" onChange={event => void chooseReferences(row.key, event.target.files)} />
                </label>
              </div>
            )}
          </div>
        ))}
      </div>

      <button onClick={() => void submit()} disabled={!validRows || submitting} className={`${primaryButton} mt-5 w-full`}><Sparkles size={14} /> 创建批量任务</button>
      <div className="mt-4"><ActionState loading={submitting || watching} error={error} success={success} /></div>

      {status && (
        <div className="mt-7 border-t border-border pt-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2"><h3 className="text-sm font-medium text-text">任务进度</h3><span className={`text-[11px] ${status.failed_count > 0 ? 'text-danger' : terminalStatuses.has(status.status) ? 'text-success' : 'text-text-tertiary'}`}>{statusLabel(status.status)}</span></div>
              <p className="mt-1 break-all font-mono text-[10px] text-text-tertiary">{status.task_id}</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => void refreshTask(status.task_id)} className={iconButton} title="刷新进度" aria-label="刷新进度"><RefreshCw size={13} /></button>
              {status.failed_count > 0 && <button onClick={() => void retryFailed()} className={iconButton} title="重试失败项" aria-label="重试失败项"><RotateCcw size={13} /></button>}
              {status.success_count > 0 && <button onClick={() => void downloadZip()} className={iconButton} title="下载 ZIP" aria-label="下载 ZIP"><Download size={13} /></button>}
              <button onClick={clearTask} className={iconButton} title="清除任务" aria-label="清除任务"><X size={13} /></button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-3 border-y border-border py-3 text-center text-[11px]"><span><strong className="block text-sm font-medium text-text">{status.total_count}</strong>总数</span><span><strong className="block text-sm font-medium text-success">{status.success_count}</strong>成功</span><span><strong className="block text-sm font-medium text-danger">{status.failed_count}</strong>失败</span><span><strong className="block text-sm font-medium text-text">{progress}%</strong>进度</span></div>
          <div className="mt-3 h-1 overflow-hidden bg-border"><div className="h-full bg-accent transition-[width]" style={{ width: `${progress}%` }} /></div>
          {status.items.length > 0 && <div className="mt-4 divide-y divide-border border-y border-border">{status.items.map(item => <div key={item.id || item.order_index} className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 py-3"><div className="h-12 w-12 overflow-hidden bg-surface"><CampaignMedia url={item.image_url} alt={item.title || `批量结果 ${item.order_index + 1}`} /></div><div className="min-w-0"><div className="truncate text-xs text-text">{item.title || `条目 ${item.order_index + 1}`}</div><div className="mt-1 truncate text-[10px] text-text-tertiary">{item.subtitle || item.error_message || '等待生成结果'}</div></div><span className={`text-[10px] ${item.status === 'success' ? 'text-success' : item.status === 'failed' ? 'text-danger' : 'text-text-tertiary'}`}>{statusLabel(item.status)}</span></div>)}</div>}
        </div>
      )}
    </section>
  )
}
