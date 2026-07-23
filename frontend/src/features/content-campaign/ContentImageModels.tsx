import { useCallback, useEffect, useState } from 'react'
import { Check, Pencil, Play, Plus, Square, Trash2 } from 'lucide-react'
import Modal from '../../components/Modal'
import { useAuth } from '../../contexts/AuthContext'
import { useBusinessApi } from '../../lib/businessApi'
import { jsonRequest } from '../../lib/http'
import { campaignPath } from './api'
import { ActionState, RefreshButton, SectionHeading, iconButton, inputClass, primaryButton } from './ui'

interface ImageModel {
  id: string
  name: string
  provider_type: string
  base_url: string
  model_name: string
  api_key: string
  description?: string | null
  is_active: boolean
  is_default: boolean
  sort_order: number
}

export default function ContentImageModels() {
  const request = useBusinessApi(); const { activeTenant } = useAuth()
  const [items, setItems] = useState<ImageModel[]>([]); const [canManage, setCanManage] = useState(false); const [editing, setEditing] = useState<ImageModel | null | 'new'>(null)
  const [name, setName] = useState(''); const [provider, setProvider] = useState('openai_image'); const [baseUrl, setBaseUrl] = useState(''); const [modelName, setModelName] = useState(''); const [apiKey, setApiKey] = useState(''); const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false); const [error, setError] = useState('')
  const load = useCallback(async () => { setLoading(true); setError(''); try { const response = await request<{ items: ImageModel[]; can_manage: boolean }>(campaignPath('/image-models/list?include_inactive=true')); setItems(response.items); setCanManage(response.can_manage) } catch (reason) { setError(reason instanceof Error ? reason.message : '内容图片模型加载失败') } finally { setLoading(false) } }, [request])
  useEffect(() => { void load() }, [activeTenant?.id, load])
  function open(item?: ImageModel) { setEditing(item || 'new'); setName(item?.name || ''); setProvider(item?.provider_type || 'openai_image'); setBaseUrl(item?.base_url || ''); setModelName(item?.model_name || ''); setApiKey(''); setDescription(item?.description || '') }
  async function save() { if (!editing) return; setLoading(true); setError(''); try { const body: Record<string, unknown> = { name: name.trim(), provider_type: provider, base_url: baseUrl.trim(), model_name: modelName.trim(), description: description.trim() || null }; if (apiKey.trim()) body.api_key = apiKey.trim(); if (editing === 'new') { body.api_key = apiKey.trim(); body.is_active = true; body.is_default = items.length === 0 } await request(campaignPath(editing === 'new' ? '/image-models/create' : `/image-models/${editing.id}`), jsonRequest(editing === 'new' ? 'POST' : 'PUT', body)); setEditing(null); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : '内容图片模型保存失败') } finally { setLoading(false) } }
  async function action(item: ImageModel, operation: 'toggle' | 'default' | 'delete') { setError(''); try { if (operation === 'delete') await request(campaignPath(`/image-models/${item.id}`), jsonRequest('DELETE')); else if (operation === 'default') await request(campaignPath(`/image-models/${item.id}/set-default`), jsonRequest('POST')); else await request(campaignPath(`/image-models/${item.id}`), jsonRequest('PUT', { is_active: !item.is_active })); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : '内容图片模型状态更新失败') } }
  return <section className="mt-10 border-t border-border pt-6" aria-label="内容图片模型"><SectionHeading title="内容运营图片模型" detail="供海报、局部重绘、尺寸适配和工作流配图使用。" action={<div className="flex gap-1"><RefreshButton onClick={() => void load()} />{canManage && <button onClick={() => open()} className={iconButton} title="添加图片模型" aria-label="添加图片模型"><Plus size={15} /></button>}</div>} /><div className="mt-4"><ActionState loading={loading} error={error} /></div><div className="mt-4 divide-y divide-border border-y border-border">{items.length === 0 && !loading ? <div className="py-10 text-center text-xs text-text-tertiary">尚未配置内容图片模型</div> : items.map(item => <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-4"><div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate text-sm text-text">{item.name}</span><span className={`text-[10px] ${item.is_active ? 'text-success' : 'text-text-tertiary'}`}>{item.is_active ? '已启动' : '已关闭'}{item.is_default ? ' · 默认' : ''}</span></div><p className="mt-1 truncate text-xs text-text-tertiary">{item.provider_type} · {item.model_name} · {item.api_key}</p></div>{canManage && <div className="flex"><button onClick={() => void action(item, 'toggle')} className={iconButton} title={item.is_active ? '关闭模型' : '启动模型'} aria-label={item.is_active ? '关闭模型' : '启动模型'}>{item.is_active ? <Square size={13} /> : <Play size={13} />}</button>{!item.is_default && <button onClick={() => void action(item, 'default')} className={iconButton} title="设为默认" aria-label="设为默认"><Check size={13} /></button>}<button onClick={() => open(item)} className={iconButton} title="编辑模型" aria-label="编辑模型"><Pencil size={13} /></button><button onClick={() => void action(item, 'delete')} className={`${iconButton} hover:text-danger`} title="删除模型" aria-label="删除模型"><Trash2 size={13} /></button></div>}</div>)}</div>
    <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? '添加内容图片模型' : '编辑内容图片模型'}><div className="space-y-4"><label className="block text-xs text-text-secondary">显示名称<input value={name} onChange={event => setName(event.target.value)} className={inputClass} autoFocus /></label><label className="block text-xs text-text-secondary">协议类型<select value={provider} onChange={event => setProvider(event.target.value)} className={inputClass}><option value="openai_image">OpenAI Image 兼容</option><option value="gemini">Gemini</option><option value="doubao">豆包 Seedream</option></select></label><label className="block text-xs text-text-secondary">Base URL<input value={baseUrl} onChange={event => setBaseUrl(event.target.value)} className={inputClass} /></label><label className="block text-xs text-text-secondary">模型标识<input value={modelName} onChange={event => setModelName(event.target.value)} className={inputClass} /></label><label className="block text-xs text-text-secondary">API Key<input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} className={inputClass} placeholder={editing === 'new' ? '必填' : '留空保留原值'} autoComplete="off" /></label><label className="block text-xs text-text-secondary">说明<input value={description} onChange={event => setDescription(event.target.value)} className={inputClass} /></label><button onClick={() => void save()} disabled={!name.trim() || !baseUrl.trim() || !modelName.trim() || (editing === 'new' && !apiKey.trim())} className={`${primaryButton} w-full`}>保存图片模型</button></div></Modal>
  </section>
}
