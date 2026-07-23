import { useCallback, useEffect, useState } from 'react'
import { Download, Eye, FileJson, RefreshCw } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useBusinessApi, useBusinessBlobApi } from '../../lib/businessApi'
import { jsonRequest } from '../../lib/http'
import type { ExportOptions } from './types'
import { ActionMessage, fieldClass, InlineEmpty, primaryButtonClass, secondaryButtonClass, SectionHeading } from './ui'

const API = '/api/v1/sales-knowledge'

function saveDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function ExportView() {
  const request = useBusinessApi()
  const blobRequest = useBusinessBlobApi()
  const { activeTenant } = useAuth()
  const [options, setOptions] = useState<ExportOptions | null>(null)
  const [source, setSource] = useState<'labeled' | 'raw'>('labeled')
  const [format, setFormat] = useState('sharegpt')
  const [quality, setQuality] = useState('medium')
  const [categories, setCategories] = useState<string[]>([])
  const [includeSystem, setIncludeSystem] = useState(true)
  const [includeCustom, setIncludeCustom] = useState(true)
  const [excludePrice, setExcludePrice] = useState(true)
  const [mergeMessages, setMergeMessages] = useState(false)
  const [preview, setPreview] = useState<unknown[]>([])
  const [previewStats, setPreviewStats] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setOptions(await request<ExportOptions>(`${API}/export/formats`))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '导出格式加载失败')
    } finally {
      setLoading(false)
    }
  }, [request])

  useEffect(() => {
    setPreview([])
    setPreviewStats(null)
    void load()
  }, [activeTenant?.id, load])

  function config() {
    if (source === 'labeled') {
      return {
        format,
        include_system_prompt: includeSystem,
        categories: categories.length ? categories : null,
        exclude_price_data: excludePrice,
        merge_messages: mergeMessages,
        include_custom: includeCustom,
        validate_style: true,
        rag_mode: 'rule',
      }
    }
    return {
      format,
      min_quality: quality,
      categories: categories.length ? categories : null,
      include_system_prompt: includeSystem,
      time_window_seconds: 300,
      max_turns_per_conversation: 20,
      use_llm_scoring: false,
      deduplicate: false,
      merge_messages: mergeMessages,
    }
  }

  async function previewDataset() {
    setActionLoading(true)
    setError('')
    setSuccess('')
    try {
      const path = source === 'labeled' ? `${API}/export/labeled/preview?limit=8` : `${API}/export/preview?limit=8`
      const result = await request<{ preview: unknown[]; statistics: Record<string, unknown> }>(path, jsonRequest('POST', config()))
      setPreview(result.preview || [])
      setPreviewStats(result.statistics || {})
      setSuccess(`预览已生成，共匹配 ${String(result.statistics?.total ?? result.preview?.length ?? 0)} 条`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '训练集预览失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function downloadDataset() {
    setActionLoading(true)
    setError('')
    setSuccess('')
    try {
      const path = source === 'labeled' ? `${API}/export/labeled/dataset` : `${API}/export/dataset`
      const result = await blobRequest(path, jsonRequest('POST', config()))
      const fallback = `sales_training_${source}_${format}.${format === 'openai' || format === 'jsonl' ? 'jsonl' : format === 'rag' ? 'csv' : 'json'}`
      saveDownload(result.blob, result.filename === 'download' ? fallback : result.filename)
      setSuccess('训练数据集已下载')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '训练数据集导出失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function downloadKnowledge() {
    setActionLoading(true)
    setError('')
    try {
      const result = await blobRequest(`${API}/export/knowledge`)
      saveDownload(result.blob, result.filename === 'download' ? 'sales_knowledge_chunks.json' : result.filename)
      setSuccess('知识分块已导出')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '知识分块导出失败')
    } finally {
      setActionLoading(false)
    }
  }

  function toggleCategory(category: string) {
    setCategories(current => current.includes(category) ? current.filter(value => value !== category) : [...current, category])
  }

  return (
    <div className="space-y-7" data-testid="sales-export-view">
      <ActionMessage loading={actionLoading} error={error} success={success} />
      <section>
        <SectionHeading title="训练数据导出" detail="将原始聊天或人工审核数据转换为 ShareGPT、Alpaca、OpenAI、JSONL 与 RAG 格式。" action={<div className="flex gap-2"><button className={secondaryButtonClass} onClick={() => void downloadKnowledge()}><FileJson size={14} /> 知识分块</button><button className={secondaryButtonClass} onClick={() => void load()}><RefreshCw size={14} /> 格式</button></div>} />
        {loading ? <div className="mt-4"><ActionMessage loading /></div> : !options ? <div className="mt-4"><InlineEmpty>导出能力不可用</InlineEmpty></div> : (
          <div className="mt-5 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-[11px] text-text-tertiary">数据来源<select className={`${fieldClass} mt-1`} value={source} onChange={event => { setSource(event.target.value as 'labeled' | 'raw'); setPreview([]) }}><option value="labeled">人工审核数据</option><option value="raw">原始聊天自动切分</option></select></label>
              <label className="text-[11px] text-text-tertiary">导出格式<select className={`${fieldClass} mt-1`} value={format} onChange={event => setFormat(event.target.value)}>{options.formats.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              {source === 'raw' && <label className="text-[11px] text-text-tertiary">最低质量<select className={`${fieldClass} mt-1`} value={quality} onChange={event => setQuality(event.target.value)}>{options.qualities.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
            </div>

            <div><div className="text-[11px] text-text-tertiary">分类筛选（不选表示全部）</div><div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">{options.categories.map(item => <label key={item.id} className="flex items-center gap-2 text-xs text-text-secondary"><input type="checkbox" checked={categories.includes(item.id)} onChange={() => toggleCategory(item.id)} /> {item.name}</label>)}</div></div>

            <div className="flex flex-wrap gap-x-6 gap-y-2 border-y border-border px-3 py-3">
              <label className="flex items-center gap-2 text-xs text-text-secondary"><input type="checkbox" checked={includeSystem} onChange={event => setIncludeSystem(event.target.checked)} /> 包含系统提示词</label>
              <label className="flex items-center gap-2 text-xs text-text-secondary"><input type="checkbox" checked={mergeMessages} onChange={event => setMergeMessages(event.target.checked)} /> 合并连续消息</label>
              {source === 'labeled' && <label className="flex items-center gap-2 text-xs text-text-secondary"><input type="checkbox" checked={includeCustom} onChange={event => setIncludeCustom(event.target.checked)} /> 包含自定义语料</label>}
              {source === 'labeled' && <label className="flex items-center gap-2 text-xs text-text-secondary"><input type="checkbox" checked={excludePrice} onChange={event => setExcludePrice(event.target.checked)} /> 排除价格数据</label>}
            </div>

            <div className="flex justify-end gap-2"><button className={secondaryButtonClass} disabled={actionLoading} onClick={() => void previewDataset()}><Eye size={14} /> 预览</button><button className={primaryButtonClass} disabled={actionLoading} onClick={() => void downloadDataset()}><Download size={14} /> 下载数据集</button></div>
          </div>
        )}
      </section>

      <section>
        <SectionHeading title="导出预览" detail="这里只展示少量样本和真实统计，完整数据仅在下载时生成。" />
        {previewStats && <div className="mt-4 overflow-x-auto border-y border-border px-3 py-3"><pre className="text-[11px] leading-5 text-text-tertiary">{JSON.stringify(previewStats, null, 2)}</pre></div>}
        <div className="mt-4 border-y border-border">{!preview.length ? <InlineEmpty>调整配置后点击预览</InlineEmpty> : preview.map((item, index) => <div key={index} className="border-b border-border px-3 py-3 last:border-b-0"><div className="text-[11px] text-text-tertiary">样本 {index + 1}</div><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-text-secondary">{JSON.stringify(item, null, 2)}</pre></div>)}</div>
      </section>
    </div>
  )
}

