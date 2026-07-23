import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, Download, ImagePlus, Link2, Sparkles } from 'lucide-react'
import Modal from '../../components/Modal'
import { useAuth } from '../../contexts/AuthContext'
import { useBusinessApi } from '../../lib/businessApi'
import { jsonRequest } from '../../lib/http'
import { IMAGE_FILE_ACCEPT, MAX_REFERENCE_IMAGES, campaignPath, fileAsBase64, type PosterResult } from './api'
import { ActionState, CampaignMedia, SectionHeading, ViewTabs, inputClass, primaryButton, secondaryButton, textareaClass } from './ui'

type PosterMode = 'custom' | 'template' | 'edit' | 'style' | 'inpaint' | 'erase' | 'adapt' | 'export'
interface TemplateItem { id: string; name: string; description?: string; config?: { text_slots?: Array<{ name: string; label?: string; required?: boolean }>; default_aspect_ratio?: string } }
interface StyleTag { name: string; description?: string }
interface PromptResult { success: boolean; prompt?: string; error?: string; aspect_ratio?: string; width?: number; height?: number }
interface SalesCandidate { id: number; name?: string; phone?: string; class_name?: string }
interface SalesSyncResult { success: boolean; status: string; message: string; student?: SalesCandidate; material?: { id?: number | string }; candidates?: SalesCandidate[] }

const modes = [
  { id: 'custom' as const, label: '自由生成' }, { id: 'template' as const, label: '模板生成' },
  { id: 'edit' as const, label: '以图改图' }, { id: 'style' as const, label: '风格迁移' },
  { id: 'inpaint' as const, label: '局部重绘' }, { id: 'erase' as const, label: '智能擦除' },
  { id: 'adapt' as const, label: '尺寸适配' }, { id: 'export' as const, label: '全平台导出' },
]
const ratios = ['3:4', '2.35:1', '9:16', '1:1', '16:9']

export default function PosterStudioView() {
  const request = useBusinessApi()
  const { activeTenant } = useAuth()
  const [mode, setMode] = useState<PosterMode>('custom')
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [styles, setStyles] = useState<StyleTag[]>([])
  const [templateId, setTemplateId] = useState('')
  const [params, setParams] = useState<Record<string, string>>({})
  const [prompt, setPrompt] = useState('')
  const [imageBase64, setImageBase64] = useState('')
  const [imageName, setImageName] = useState('')
  const [maskBase64, setMaskBase64] = useState('')
  const [maskName, setMaskName] = useState('')
  const [references, setReferences] = useState<Array<{ image_base64: string; name: string }>>([])
  const [styleTags, setStyleTags] = useState<string[]>([])
  const [ratio, setRatio] = useState('3:4')
  const [sourceRatio, setSourceRatio] = useState('3:4')
  const [targetRatio, setTargetRatio] = useState('16:9')
  const [strength, setStrength] = useState('medium')
  const [strategy, setStrategy] = useState('outpaint')
  const [result, setResult] = useState<PosterResult | null>(null)
  const [externalPrompt, setExternalPrompt] = useState<PromptResult | null>(null)
  const [salesOpen, setSalesOpen] = useState(false)
  const [salesQuery, setSalesQuery] = useState('')
  const [salesCandidates, setSalesCandidates] = useState<SalesCandidate[]>([])
  const [salesResult, setSalesResult] = useState<SalesSyncResult | null>(null)
  const [salesLoading, setSalesLoading] = useState(false)
  const [salesError, setSalesError] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadOptions = useCallback(async () => {
    try {
      const [templateItems, styleResponse] = await Promise.all([
        request<TemplateItem[]>(campaignPath('/templates/list?scope=all')),
        request<{ tags: StyleTag[] }>(campaignPath('/poster/style-tags')),
      ])
      setTemplates(templateItems)
      setStyles(styleResponse.tags)
      setTemplateId(current => current || templateItems[0]?.id || '')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '视觉配置加载失败') }
  }, [request])

  useEffect(() => { setResult(null); setError(''); void loadOptions() }, [activeTenant?.id, loadOptions])
  useEffect(() => {
    const template = templates.find(item => item.id === templateId)
    const slots = template?.config?.text_slots || []
    setParams(current => Object.fromEntries(slots.map(slot => [slot.name, current[slot.name] || ''])))
    if (template?.config?.default_aspect_ratio) setRatio(template.config.default_aspect_ratio)
  }, [templateId, templates])

  const selectedTemplate = useMemo(() => templates.find(item => item.id === templateId), [templateId, templates])

  async function chooseFile(file: File | undefined, kind: 'image' | 'mask') {
    if (!file) return
    try {
      const encoded = await fileAsBase64(file)
      if (kind === 'image') { setImageBase64(encoded.base64); setImageName(file.name) }
      else { setMaskBase64(encoded.base64); setMaskName(file.name) }
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '图片读取失败') }
  }

  async function chooseReferences(files: FileList | null) {
    if (!files) return
    try {
      if (files.length > MAX_REFERENCE_IMAGES) throw new Error(`参考图片最多 ${MAX_REFERENCE_IMAGES} 张`)
      const selected = await Promise.all([...files].map(async file => ({ image_base64: (await fileAsBase64(file)).base64, name: file.name })))
      setReferences(selected); setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '参考图片读取失败') }
  }

  function toggleStyle(name: string) {
    setStyleTags(current => current.includes(name) ? current.filter(item => item !== name) : [...current, name])
  }

  async function generate() {
    setLoading(true); setError(''); setResult(null)
    try {
      let endpoint = '/poster/generate/custom'
      let body: Record<string, unknown> = { prompt, style_tags: styleTags, aspect_ratio: ratio, reference_images: references }
      if (mode === 'template') { endpoint = '/poster/generate/template'; body = { template_id: templateId, params, style_tag: styleTags[0] || null, aspect_ratio: ratio } }
      if (mode === 'edit') { endpoint = '/poster/generate/edit'; body = { image_base64: imageBase64, edit_prompt: prompt, aspect_ratio: ratio } }
      if (mode === 'style') { endpoint = '/poster/generate/style-transfer'; body = { image_base64: imageBase64, style_tags: styleTags, strength, aspect_ratio: ratio } }
      if (mode === 'inpaint') { endpoint = '/poster/inpaint'; body = { image_base64: imageBase64, mask_base64: maskBase64, inpaint_prompt: prompt, aspect_ratio: ratio } }
      if (mode === 'erase') { endpoint = '/poster/erase'; body = { image_base64: imageBase64, mask_base64: maskBase64 } }
      if (mode === 'adapt') { endpoint = '/poster/adapt'; body = { image_base64: imageBase64, source_ratio: sourceRatio, target_ratio: targetRatio, strategy, outpaint_prompt: prompt || null } }
      if (mode === 'export') { endpoint = '/poster/export-all'; body = { image_base64: imageBase64, source_ratio: sourceRatio, strategy, outpaint_prompt: prompt || null } }
      const generated = await request<PosterResult>(campaignPath(endpoint), jsonRequest('POST', body))
      if (!generated.success) throw new Error(generated.error || '生成服务未返回有效结果')
      setResult(generated)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '视觉生成失败') }
    finally { setLoading(false) }
  }

  async function generateExternalPrompt() {
    if (!prompt.trim()) return
    setLoading(true); setError(''); setExternalPrompt(null)
    try {
      const generated = await request<PromptResult>(campaignPath('/poster/generate-prompt'), jsonRequest('POST', {
        prompt: prompt.trim(), style_tags: styleTags, aspect_ratio: ratio, reference_images: references,
      }))
      if (!generated.success || !generated.prompt) throw new Error(generated.error || '提示词服务未返回有效结果')
      setExternalPrompt(generated)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '提示词生成失败') }
    finally { setLoading(false) }
  }

  function openSalesSync() {
    setSalesQuery(''); setSalesCandidates([]); setSalesResult(null); setSalesError(''); setSalesOpen(true)
  }

  async function syncToSales(studentId?: number) {
    const imageUrl = result?.image_url || result?.images?.[0]?.url
    if (!imageUrl || (!studentId && !salesQuery.trim())) {
      setSalesError('请输入学员姓名或手机号')
      return
    }
    setSalesLoading(true); setSalesError('')
    try {
      const synced = await request<SalesSyncResult>(campaignPath('/poster/sales-sync'), jsonRequest('POST', {
        image_url: imageUrl,
        query: salesQuery.trim() || undefined,
        student_id: studentId,
        title: salesQuery.trim() ? `${salesQuery.trim()} 喜报` : undefined,
      }))
      setSalesResult(synced.success ? synced : null)
      setSalesCandidates(synced.candidates || [])
      if (!synced.success) setSalesError(synced.message || '没有完成同步')
    } catch (reason) { setSalesError(reason instanceof Error ? reason.message : '同步销售系统失败') }
    finally { setSalesLoading(false) }
  }

  const requiresSource = ['edit', 'style', 'inpaint', 'erase', 'adapt', 'export'].includes(mode)
  const requiresPrompt = ['custom', 'edit', 'inpaint'].includes(mode)
  const requiresMask = mode === 'inpaint' || mode === 'erase'
  const canGenerate = mode === 'template'
    ? Boolean(templateId && Object.values(params).some(Boolean))
    : (!requiresSource || Boolean(imageBase64)) && (!requiresMask || Boolean(maskBase64)) && (!requiresPrompt || Boolean(prompt.trim())) && (mode !== 'style' || styleTags.length > 0)

  return (
    <section aria-label="视觉内容生产">
      <SectionHeading title="海报与视觉生产" detail="生成结果自动进入当前租户作品库。" />
      <div className="mt-5"><ViewTabs items={modes} value={mode} onChange={value => { setMode(value); setResult(null); setError('') }} label="视觉生成模式" /></div>
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          {mode === 'template' && <label className="block text-xs text-text-secondary">内容模板<select value={templateId} onChange={event => setTemplateId(event.target.value)} className={inputClass}>{templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>}
          {mode === 'template' && (selectedTemplate?.config?.text_slots || []).map(slot => <label key={slot.name} className="block text-xs text-text-secondary">{slot.label || slot.name}<input value={params[slot.name] || ''} onChange={event => setParams(current => ({ ...current, [slot.name]: event.target.value }))} className={inputClass} required={slot.required} /></label>)}

          {requiresSource && <FileField label="源图片" name={imageName} onChange={file => void chooseFile(file, 'image')} />}
          {requiresMask && <FileField label="遮罩图片" name={maskName} onChange={file => void chooseFile(file, 'mask')} />}
          {mode === 'custom' && <FileField label={`参考图片（最多 ${MAX_REFERENCE_IMAGES} 张）`} name={references.map(item => item.name).join('、')} multiple onFiles={files => void chooseReferences(files)} />}

          {(requiresPrompt || mode === 'adapt' || mode === 'export') && <label className="block text-xs text-text-secondary">{mode === 'adapt' || mode === 'export' ? '扩图补充描述' : mode === 'edit' ? '编辑指令' : mode === 'inpaint' ? '重绘内容' : '画面描述'}<textarea value={prompt} onChange={event => setPrompt(event.target.value)} className={textareaClass} /></label>}

          {['custom', 'template', 'style'].includes(mode) && <div><div className="text-xs text-text-secondary">视觉风格</div><div className="mt-2 flex flex-wrap gap-2">{styles.map(style => <button key={style.name} onClick={() => toggleStyle(style.name)} className={`h-8 rounded-md border px-2.5 text-xs ${styleTags.includes(style.name) ? 'border-text bg-accent text-page' : 'border-border text-text-secondary'}`}>{style.name}</button>)}</div></div>}

          <div className="grid gap-4 sm:grid-cols-2">
            {!['erase', 'adapt', 'export'].includes(mode) && <SelectField label="输出比例" value={ratio} onChange={setRatio} options={ratios} />}
            {(mode === 'adapt' || mode === 'export') && <SelectField label="源图比例" value={sourceRatio} onChange={setSourceRatio} options={ratios} />}
            {mode === 'adapt' && <SelectField label="目标比例" value={targetRatio} onChange={setTargetRatio} options={ratios.filter(item => item !== sourceRatio)} />}
            {mode === 'style' && <SelectField label="迁移强度" value={strength} onChange={setStrength} options={['light', 'medium', 'strong']} />}
            {(mode === 'adapt' || mode === 'export') && <SelectField label="适配策略" value={strategy} onChange={setStrategy} options={['outpaint', 'crop']} />}
          </div>
          <div className="flex flex-wrap gap-2"><button onClick={() => void generate()} disabled={!canGenerate || loading} className={`${primaryButton} min-w-40 flex-1`}><Sparkles size={14} /> 执行生成</button>{mode === 'custom' && <button onClick={() => void generateExternalPrompt()} disabled={!prompt.trim() || loading} className={secondaryButton}><Copy size={14} /> 只生成提示词</button>}</div>
          {externalPrompt?.prompt && <div className="border-y border-border py-3"><div className="flex items-center justify-between gap-3"><span className="text-xs font-medium text-text">外部图片模型提示词</span><button onClick={() => void navigator.clipboard.writeText(externalPrompt.prompt || '')} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text" title="复制提示词" aria-label="复制外部图片模型提示词"><Copy size={13} /></button></div><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words bg-surface p-3 text-xs leading-6 text-text-secondary">{externalPrompt.prompt}</pre><div className="mt-2 text-[11px] text-text-tertiary">{externalPrompt.width} × {externalPrompt.height} · {externalPrompt.aspect_ratio}</div></div>}
          <ActionState loading={loading} error={error} />
        </div>

        <div className="min-w-0">
          <div className="aspect-[3/4] max-h-[620px] overflow-hidden border border-border bg-surface">
            <CampaignMedia url={result?.image_url || result?.images?.[0]?.url} alt="视觉生成结果" />
          </div>
          {result && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-text-tertiary"><span>{result.mode || mode} · {result.aspect_ratio || ratio}</span><div className="flex flex-wrap gap-2"><button onClick={openSalesSync} className={secondaryButton}><Link2 size={13} /> 同步喜报</button><span className={secondaryButton}><Download size={13} /> 已保存到作品库</span></div></div>}
          {result?.images && result.images.length > 1 && <div className="mt-4 grid grid-cols-4 gap-2">{result.images.map((image, index) => <div key={`${image.url}-${index}`} className="aspect-square overflow-hidden border border-border"><CampaignMedia url={image.url} alt={`适配结果 ${index + 1}`} /></div>)}</div>}
        </div>
      </div>
      <Modal open={salesOpen} onClose={() => setSalesOpen(false)} title="关联销售学员">
        {salesResult?.success ? <div><div className="text-sm font-medium text-success">已同步到销售系统</div><p className="mt-2 text-xs text-text-secondary">{salesResult.student?.name || salesQuery} · 素材 ID {salesResult.material?.id || '已创建'}</p></div> : <div className="space-y-4"><label className="block text-xs text-text-secondary">学员姓名或手机号<input value={salesQuery} onChange={event => setSalesQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void syncToSales() }} disabled={salesLoading} className={inputClass} autoFocus /></label>{salesError && <div className="text-xs text-danger">{salesError}</div>}{salesCandidates.length > 0 && <div className="border-y border-border">{salesCandidates.map(student => <div key={student.id} className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-b-0"><div className="min-w-0"><div className="truncate text-xs text-text">{student.name || `学员 ${student.id}`}</div><div className="mt-1 truncate text-[11px] text-text-tertiary">{student.phone || '未填写手机号'}{student.class_name ? ` · ${student.class_name}` : ''}</div></div><button onClick={() => void syncToSales(student.id)} disabled={salesLoading} className={secondaryButton}>关联</button></div>)}</div>}<button onClick={() => void syncToSales()} disabled={salesLoading || !salesQuery.trim()} className={`${primaryButton} w-full`}>{salesLoading ? '同步中...' : '搜索并关联'}</button></div>}
      </Modal>
    </section>
  )
}

function FileField({ label, name, multiple, onChange, onFiles }: { label: string; name: string; multiple?: boolean; onChange?: (file?: File) => void; onFiles?: (files: FileList | null) => void }) {
  return <label className="block text-xs text-text-secondary">{label}<span className="mt-2 flex h-10 cursor-pointer items-center gap-2 rounded-md border border-border bg-page px-3 text-xs text-text-tertiary"><ImagePlus size={14} /><span className="min-w-0 flex-1 truncate">{name || '选择图片'}</span><input type="file" accept={IMAGE_FILE_ACCEPT} multiple={multiple} className="sr-only" onChange={event => { onChange?.(event.target.files?.[0]); onFiles?.(event.target.files) }} /></span></label>
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="block text-xs text-text-secondary">{label}<select value={value} onChange={event => onChange(event.target.value)} className={inputClass}>{options.map(option => <option key={option}>{option}</option>)}</select></label>
}
