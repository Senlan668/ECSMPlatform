import { useCallback, useEffect, useState } from 'react'
import { Copy, FilePlus2, Pencil, Plus, Send, Trash2 } from 'lucide-react'
import Modal from '../../components/Modal'
import { useAuth } from '../../contexts/AuthContext'
import { useBusinessApi } from '../../lib/businessApi'
import { jsonRequest } from '../../lib/http'
import { campaignPath } from './api'
import {
  ActionState,
  RefreshButton,
  SectionHeading,
  iconButton,
  inputClass,
  primaryButton,
  secondaryButton,
  textareaClass,
} from './ui'

interface TemplateSlot {
  name: string
  label: string
  required: boolean
}

interface TemplateConfig extends Record<string, unknown> {
  ai_prompt_template?: string
  text_slots?: TemplateSlot[]
  default_aspect_ratio?: string
}

interface TemplateItem {
  id: string
  user_id?: string | null
  name: string
  description?: string | null
  category?: string | null
  style_tag?: string | null
  is_system: boolean
  is_active: boolean
  use_count: number
  config?: TemplateConfig
}

interface EditableSlot extends TemplateSlot {
  key: string
}

const ratios = ['3:4', '2.35:1', '9:16', '1:1', '16:9']

function newSlot(slot?: Partial<TemplateSlot>): EditableSlot {
  return {
    key: crypto.randomUUID(),
    name: slot?.name || 'title',
    label: slot?.label || '标题',
    required: slot?.required ?? true,
  }
}

export default function TemplatePanel() {
  const request = useBusinessApi()
  const { activeTenant } = useAuth()
  const [scope, setScope] = useState<'all' | 'mine' | 'system'>('all')
  const [items, setItems] = useState<TemplateItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<TemplateItem | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('电商')
  const [style, setStyle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [ratio, setRatio] = useState('3:4')
  const [slots, setSlots] = useState<EditableSlot[]>([newSlot()])
  const [saving, setSaving] = useState(false)
  const [editorError, setEditorError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setItems(await request<TemplateItem[]>(campaignPath(`/templates/list?scope=${scope}`)))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '模板加载失败')
    } finally {
      setLoading(false)
    }
  }, [request, scope])

  useEffect(() => { void load() }, [activeTenant?.id, load])

  function openEditor(item?: TemplateItem) {
    const config = item?.config || {}
    const configuredSlots = Array.isArray(config.text_slots) ? config.text_slots : []
    setEditing(item || null)
    setName(item?.name || '')
    setDescription(item?.description || '')
    setCategory(item?.category || '电商')
    setStyle(item?.style_tag || '')
    setPrompt(config.ai_prompt_template || '')
    setRatio(config.default_aspect_ratio || '3:4')
    setSlots(configuredSlots.length > 0 ? configuredSlots.map(slot => newSlot(slot)) : [newSlot()])
    setEditorError('')
    setEditorOpen(true)
  }

  function updateSlot(key: string, patch: Partial<TemplateSlot>) {
    setSlots(current => current.map(slot => slot.key === key ? { ...slot, ...patch } : slot))
  }

  async function save() {
    const normalizedSlots = slots.map(slot => ({
      name: slot.name.trim(),
      label: slot.label.trim(),
      required: slot.required,
    }))
    if (normalizedSlots.some(slot => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(slot.name))) {
      setEditorError('字段标识只能使用英文字母、数字和下划线，且不能以数字开头')
      return
    }
    if (new Set(normalizedSlots.map(slot => slot.name)).size !== normalizedSlots.length) {
      setEditorError('字段标识不能重复')
      return
    }

    setSaving(true)
    setEditorError('')
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        category: category.trim() || null,
        style_tag: style.trim() || null,
        config: {
          ...editing?.config,
          ai_prompt_template: prompt.trim(),
          text_slots: normalizedSlots,
          default_aspect_ratio: ratio,
        },
      }
      await request(
        campaignPath(editing ? `/templates/${editing.id}` : '/templates/create'),
        jsonRequest(editing ? 'PUT' : 'POST', body),
      )
      setEditorOpen(false)
      await load()
    } catch (reason) {
      setEditorError(reason instanceof Error ? reason.message : '模板保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function action(item: TemplateItem, operation: 'duplicate' | 'publish' | 'delete') {
    setError('')
    try {
      const path = operation === 'delete' ? `/templates/${item.id}` : `/templates/${item.id}/${operation}`
      await request(campaignPath(path), jsonRequest(operation === 'delete' ? 'DELETE' : 'POST'))
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '模板操作失败')
    }
  }

  return (
    <div>
      <SectionHeading
        title="内容模板"
        action={(
          <div className="flex gap-1">
            <RefreshButton onClick={() => void load()} />
            <button onClick={() => openEditor()} className={iconButton} title="新建模板" aria-label="新建模板"><Plus size={15} /></button>
          </div>
        )}
      />
      <div className="mt-4 flex gap-2">
        {(['all', 'mine', 'system'] as const).map(value => (
          <button key={value} onClick={() => setScope(value)} className={`h-8 rounded-md border px-3 text-xs ${scope === value ? 'border-text bg-accent text-page' : 'border-border text-text-secondary'}`}>
            {value === 'all' ? '全部' : value === 'mine' ? '我的' : '系统'}
          </button>
        ))}
      </div>
      <div className="mt-4"><ActionState loading={loading} error={error} /></div>
      {!loading && !error && items.length === 0 && <div className="border-y border-border py-12 text-center text-xs text-text-tertiary">暂无模板</div>}
      <div className="mt-4 divide-y divide-border border-y border-border">
        {items.map(item => (
          <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm text-text">{item.name}</span>
                <span className={`text-[10px] ${item.is_active ? 'text-text-tertiary' : 'text-danger'}`}>{item.is_system ? '公共模板' : '个人模板'} · 使用 {item.use_count || 0}</span>
              </div>
              <p className="mt-1 truncate text-xs text-text-tertiary">{item.category || '未分类'} · {item.style_tag || '未设风格'} · {item.description || '无描述'}</p>
            </div>
            <div className="flex items-center">
              {item.is_system ? (
                <button onClick={() => void action(item, 'duplicate')} className={iconButton} title="复制到我的模板" aria-label="复制模板"><Copy size={13} /></button>
              ) : (
                <>
                  <button onClick={() => openEditor(item)} className={iconButton} title="编辑模板" aria-label={`编辑模板 ${item.name}`}><Pencil size={13} /></button>
                  <button onClick={() => void action(item, 'publish')} className={iconButton} title="发布为公共模板" aria-label="发布模板"><Send size={13} /></button>
                  <button onClick={() => void action(item, 'delete')} className={`${iconButton} hover:text-danger`} title="删除模板" aria-label="删除模板"><Trash2 size={13} /></button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal open={editorOpen} onClose={() => setEditorOpen(false)} title={editing ? '编辑内容模板' : '新建内容模板'}>
        <div className="space-y-4">
          <label className="block text-xs text-text-secondary">模板名称<input value={name} onChange={event => setName(event.target.value)} className={inputClass} autoFocus /></label>
          <label className="block text-xs text-text-secondary">描述<input value={description} onChange={event => setDescription(event.target.value)} className={inputClass} /></label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block text-xs text-text-secondary">分类<input value={category} onChange={event => setCategory(event.target.value)} className={inputClass} /></label>
            <label className="block text-xs text-text-secondary">风格<input value={style} onChange={event => setStyle(event.target.value)} className={inputClass} /></label>
            <label className="block text-xs text-text-secondary">默认比例<select value={ratio} onChange={event => setRatio(event.target.value)} className={inputClass}>{ratios.map(value => <option key={value}>{value}</option>)}</select></label>
          </div>
          <label className="block text-xs text-text-secondary">AI 提示词模板<textarea value={prompt} onChange={event => setPrompt(event.target.value)} className={textareaClass} /></label>

          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-text-secondary">动态文本字段</span>
              <button onClick={() => setSlots(current => [...current, newSlot({ name: `field_${current.length + 1}`, label: `字段 ${current.length + 1}`, required: false })])} className={secondaryButton}><Plus size={13} /> 添加字段</button>
            </div>
            <div className="mt-2 divide-y divide-border border-y border-border">
              {slots.map(slot => (
                <div key={slot.key} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-end">
                  <label className="block text-[11px] text-text-tertiary">字段标识<input value={slot.name} onChange={event => updateSlot(slot.key, { name: event.target.value })} className={inputClass} aria-label="字段标识" /></label>
                  <label className="block text-[11px] text-text-tertiary">显示名称<input value={slot.label} onChange={event => updateSlot(slot.key, { label: event.target.value })} className={inputClass} aria-label="字段显示名称" /></label>
                  <label className="flex h-10 items-center gap-2 px-1 text-xs text-text-secondary"><input type="checkbox" checked={slot.required} onChange={event => updateSlot(slot.key, { required: event.target.checked })} />必填</label>
                  <button onClick={() => setSlots(current => current.filter(item => item.key !== slot.key))} disabled={slots.length <= 1} className={`${iconButton} h-10 disabled:opacity-30`} title="删除字段" aria-label="删除字段"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </div>
          <ActionState loading={saving} error={editorError} />
          <button onClick={() => void save()} disabled={!name.trim() || !prompt.trim() || slots.some(slot => !slot.name.trim() || !slot.label.trim()) || saving} className={`${primaryButton} w-full`}><FilePlus2 size={14} /> 保存模板</button>
        </div>
      </Modal>
    </div>
  )
}
