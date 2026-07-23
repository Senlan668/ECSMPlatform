import { useCallback, useEffect, useState } from 'react'
import { Heart, Pencil, Search, Tag, Trash2 } from 'lucide-react'
import Modal from '../../components/Modal'
import { useAuth } from '../../contexts/AuthContext'
import { useBusinessApi } from '../../lib/businessApi'
import { jsonRequest } from '../../lib/http'
import { campaignPath, type GalleryWork } from './api'
import PromptPanel from './PromptPanel'
import TemplatePanel from './TemplatePanel'
import {
  ActionState,
  CampaignMedia,
  RefreshButton,
  SectionHeading,
  ViewTabs,
  iconButton,
  inputClass,
  primaryButton,
  secondaryButton,
} from './ui'

type LibraryTab = 'gallery' | 'templates' | 'prompts'

const libraryTabs = [
  { id: 'gallery' as const, label: '作品库' },
  { id: 'templates' as const, label: '模板中心' },
  { id: 'prompts' as const, label: '提示词库' },
]

export default function ContentLibraryView() {
  const [tab, setTab] = useState<LibraryTab>('gallery')
  return (
    <section aria-label="内容资产">
      <ViewTabs items={libraryTabs} value={tab} onChange={setTab} label="内容资产视图" />
      {tab === 'gallery' && <GalleryPanel />}
      {tab === 'templates' && <TemplatePanel />}
      {tab === 'prompts' && <PromptPanel />}
    </section>
  )
}

function GalleryPanel() {
  const request = useBusinessApi()
  const { activeTenant } = useAuth()
  const [items, setItems] = useState<GalleryWork[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [keyword, setKeyword] = useState('')
  const [tag, setTag] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<GalleryWork | null>(null)
  const [title, setTitle] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ only_mine: 'true', page_size: '50' })
      if (keyword.trim()) query.set('keyword', keyword.trim())
      const response = await request<{ items: GalleryWork[] }>(campaignPath(`/gallery/list?${query}`))
      setItems(response.items)
      setSelected([])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '作品库加载失败')
    } finally {
      setLoading(false)
    }
  }, [keyword, request])

  useEffect(() => { void load() }, [activeTenant?.id, load])

  async function itemAction(item: GalleryWork, action: 'favorite' | 'template' | 'delete') {
    setError('')
    try {
      if (action === 'delete') {
        await request(campaignPath(`/gallery/${item.id}`), jsonRequest('DELETE'))
        setItems(current => current.filter(work => work.id !== item.id))
      } else if (action === 'favorite') {
        const updated = await request<{ is_favorite: boolean }>(campaignPath(`/gallery/${item.id}/favorite`), jsonRequest('POST'))
        setItems(current => current.map(work => work.id === item.id ? { ...work, is_favorite: updated.is_favorite } : work))
      } else {
        await request(campaignPath(`/gallery/${item.id}/save-as-template`), jsonRequest('POST'))
        setItems(current => current.map(work => work.id === item.id ? { ...work, is_template: true } : work))
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '作品操作失败')
    }
  }

  async function rename() {
    if (!editing || !title.trim()) return
    try {
      const updated = await request<{ title: string }>(campaignPath(`/gallery/${editing.id}/rename`), jsonRequest('PATCH', { new_title: title.trim() }))
      setItems(current => current.map(work => work.id === editing.id ? { ...work, title: updated.title } : work))
      setEditing(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '重命名失败')
    }
  }

  async function bulkAction(action: 'tag' | 'delete') {
    if (!selected.length) return
    try {
      const body = action === 'delete'
        ? { ids: selected }
        : { ids: selected, tags: tag.split(',').map(item => item.trim()).filter(Boolean) }
      await request(
        campaignPath(action === 'delete' ? '/gallery/batch-delete' : '/gallery/batch-tag'),
        jsonRequest('POST', body),
      )
      setTag('')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '批量操作失败')
    }
  }

  return (
    <div>
      <SectionHeading title="租户作品库" action={<RefreshButton onClick={() => void load()} />} />
      <div className="mt-4 flex flex-wrap items-center gap-2 border-y border-border py-3">
        <div className="relative min-w-52 flex-1">
          <Search size={14} className="absolute left-3 top-3 text-text-tertiary" />
          <input
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') void load() }}
            className="h-10 w-full rounded-md border border-border bg-page pl-9 pr-3 text-sm outline-none"
            placeholder="搜索标题、提示词或标签"
          />
        </div>
        {selected.length > 0 && (
          <>
            <input value={tag} onChange={event => setTag(event.target.value)} className="h-10 w-40 rounded-md border border-border bg-page px-3 text-xs" placeholder="标签，逗号分隔" />
            <button onClick={() => void bulkAction('tag')} disabled={!tag.trim()} className={secondaryButton}><Tag size={13} /> 批量标签</button>
            <button onClick={() => void bulkAction('delete')} className={secondaryButton}><Trash2 size={13} /> 删除 {selected.length} 项</button>
          </>
        )}
      </div>
      <div className="mt-5"><ActionState loading={loading} error={error} /></div>
      {!loading && !error && (
        items.length === 0 ? (
          <div className="border-y border-border py-14 text-center text-sm text-text-tertiary">暂无作品</div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map(item => (
              <article key={item.id} className="overflow-hidden rounded-md border border-border bg-page">
                <div className="relative aspect-[4/3] overflow-hidden bg-surface">
                  <CampaignMedia url={item.thumbnail_url || item.image_url} alt={item.title || '内容作品'} />
                  <label className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-page/90">
                    <input
                      type="checkbox"
                      checked={selected.includes(item.id)}
                      onChange={() => setSelected(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])}
                      aria-label={`选择 ${item.title || item.id}`}
                    />
                  </label>
                </div>
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm text-text">{item.title || '未命名作品'}</h3>
                      <p className="mt-1 text-[11px] text-text-tertiary">{item.mode} · {item.aspect_ratio || '未知比例'}</p>
                    </div>
                    <div className="flex">
                      <button onClick={() => void itemAction(item, 'favorite')} className={`${iconButton} ${item.is_favorite ? 'text-danger' : ''}`} title="收藏" aria-label="切换收藏"><Heart size={14} fill={item.is_favorite ? 'currentColor' : 'none'} /></button>
                      <button onClick={() => { setEditing(item); setTitle(item.title || '') }} className={iconButton} title="重命名" aria-label="重命名"><Pencil size={13} /></button>
                      <button onClick={() => void itemAction(item, 'delete')} className={`${iconButton} hover:text-danger`} title="删除" aria-label="删除"><Trash2 size={13} /></button>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex min-w-0 gap-1 overflow-hidden">{item.tags.slice(0, 3).map(value => <span key={value} className="shrink-0 text-[10px] text-text-tertiary">#{value}</span>)}</div>
                    <button onClick={() => void itemAction(item, 'template')} disabled={item.is_template} className="text-[11px] text-text-tertiary hover:text-text disabled:text-success">{item.is_template ? '已存模板' : '存为模板'}</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )
      )}
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="重命名作品">
        <label className="block text-xs text-text-secondary">作品名称<input value={title} onChange={event => setTitle(event.target.value)} className={inputClass} autoFocus /></label>
        <button onClick={() => void rename()} disabled={!title.trim()} className={`${primaryButton} mt-4 w-full`}>保存</button>
      </Modal>
    </div>
  )
}
