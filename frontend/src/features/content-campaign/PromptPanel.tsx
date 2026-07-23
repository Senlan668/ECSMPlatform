import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardCopy, Copy, Pencil, Plus, Search, Send, Trash2 } from 'lucide-react'
import Modal from '../../components/Modal'
import { useAuth } from '../../contexts/AuthContext'
import { useBusinessApi } from '../../lib/businessApi'
import { jsonRequest } from '../../lib/http'
import { campaignPath } from './api'
import { ActionState, SectionHeading, iconButton, inputClass, primaryButton, secondaryButton, textareaClass } from './ui'

interface PromptItem {
  id: string
  user_id?: string | null
  title: string
  content: string
  category: string
  tags: string[]
  is_public: boolean
  use_count: number
}

export default function PromptPanel() {
  const request = useBusinessApi()
  const { activeTenant } = useAuth()
  const [scope, setScope] = useState<'mine' | 'public' | 'all'>('mine')
  const [items, setItems] = useState<PromptItem[]>([])
  const [keyword, setKeyword] = useState('')
  const [editing, setEditing] = useState<PromptItem | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('poster')
  const [tags, setTags] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ scope })
      if (keyword.trim()) query.set('keyword', keyword.trim())
      const response = await request<{ items: PromptItem[] }>(campaignPath(`/prompts/list?${query}`))
      setItems(response.items)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '提示词加载失败')
    } finally {
      setLoading(false)
    }
  }, [keyword, request, scope])

  useEffect(() => { setSuccess(''); void load() }, [activeTenant?.id, load])

  function edit(item?: PromptItem) {
    setEditing(item || { id: '', title: '', content: '', category: 'poster', tags: [], is_public: false, use_count: 0 })
    setTitle(item?.title || '')
    setContent(item?.content || '')
    setCategory(item?.category || 'poster')
    setTags(item?.tags.join(',') || '')
  }

  async function save() {
    if (!editing) return
    setError('')
    try {
      const body = {
        title: title.trim(),
        content: content.trim(),
        category,
        tags: tags.split(',').map(value => value.trim()).filter(Boolean),
      }
      await request(
        campaignPath(editing.id ? `/prompts/${editing.id}` : '/prompts/create'),
        jsonRequest(editing.id ? 'PUT' : 'POST', body),
      )
      setEditing(null)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '提示词保存失败')
    }
  }

  async function action(item: PromptItem, operation: 'publish' | 'fork' | 'delete') {
    setError('')
    setSuccess('')
    try {
      await request(
        campaignPath(operation === 'delete' ? `/prompts/${item.id}` : `/prompts/${item.id}/${operation}`),
        jsonRequest(operation === 'delete' ? 'DELETE' : 'POST'),
      )
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '提示词操作失败')
    }
  }

  async function usePrompt(item: PromptItem) {
    setError('')
    setSuccess('')
    try {
      await navigator.clipboard.writeText(item.content)
      await request(campaignPath(`/prompts/${item.id}/use`), jsonRequest('POST'))
      setItems(current => current.map(value => value.id === item.id ? { ...value, use_count: value.use_count + 1 } : value))
      setSuccess(`“${item.title}”已复制`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '提示词复制失败')
    }
  }

  const ownItems = useMemo(() => items.filter(item => !item.is_public), [items])

  return (
    <div>
      <SectionHeading title="提示词资产" action={<button onClick={() => edit()} className={iconButton} title="新建提示词" aria-label="新建提示词"><Plus size={15} /></button>} />
      <div className="mt-4 grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <select value={scope} onChange={event => setScope(event.target.value as typeof scope)} className="h-10 rounded-md border border-border bg-page px-3 text-xs"><option value="mine">我的</option><option value="public">公共</option><option value="all">全部</option></select>
        <input value={keyword} onChange={event => setKeyword(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void load() }} className="h-10 rounded-md border border-border bg-page px-3 text-sm" placeholder="搜索提示词" />
        <button onClick={() => void load()} className={secondaryButton}><Search size={13} /> 搜索</button>
      </div>
      <div className="mt-4"><ActionState loading={loading} error={error} success={success} /></div>
      <div className="mt-4 divide-y divide-border border-y border-border">
        {items.map(item => (
          <div key={item.id} className="py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><span className="text-sm text-text">{item.title}</span><span className="text-[10px] text-text-tertiary">{item.is_public ? '公共' : '个人'} · 使用 {item.use_count}</span></div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-text-secondary">{item.content}</p>
              </div>
              <div className="flex">
                <button onClick={() => void usePrompt(item)} className={iconButton} title="复制并使用" aria-label={`复制并使用 ${item.title}`}><ClipboardCopy size={13} /></button>
                {item.is_public ? (
                  <button onClick={() => void action(item, 'fork')} className={iconButton} title="收藏副本" aria-label="收藏副本"><Copy size={13} /></button>
                ) : (
                  <>
                    <button onClick={() => edit(item)} className={iconButton} title="编辑" aria-label="编辑"><Pencil size={13} /></button>
                    <button onClick={() => void action(item, 'publish')} className={iconButton} title="发布" aria-label="发布"><Send size={13} /></button>
                    <button onClick={() => void action(item, 'delete')} className={`${iconButton} hover:text-danger`} title="删除" aria-label="删除"><Trash2 size={13} /></button>
                  </>
                )}
              </div>
            </div>
            <div className="mt-2 flex gap-2 text-[10px] text-text-tertiary"><span>{item.category}</span>{item.tags.map(value => <span key={value}>#{value}</span>)}</div>
          </div>
        ))}
      </div>
      {!loading && ownItems.length === 0 && scope === 'mine' && <div className="py-8 text-center text-xs text-text-tertiary">暂无个人提示词</div>}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? '编辑提示词' : '新建提示词'}>
        <div className="space-y-4">
          <label className="block text-xs text-text-secondary">标题<input value={title} onChange={event => setTitle(event.target.value)} className={inputClass} autoFocus /></label>
          <label className="block text-xs text-text-secondary">提示词<textarea value={content} onChange={event => setContent(event.target.value)} className={textareaClass} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-text-secondary">分类<select value={category} onChange={event => setCategory(event.target.value)} className={inputClass}><option value="poster">海报</option><option value="workflow">内容工作流</option><option value="video">视频</option></select></label>
            <label className="block text-xs text-text-secondary">标签<input value={tags} onChange={event => setTags(event.target.value)} className={inputClass} placeholder="逗号分隔" /></label>
          </div>
          <button onClick={() => void save()} disabled={!title.trim() || !content.trim()} className={`${primaryButton} w-full`}>保存提示词</button>
        </div>
      </Modal>
    </div>
  )
}
