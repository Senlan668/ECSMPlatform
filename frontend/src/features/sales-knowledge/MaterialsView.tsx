import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Eye, FileImage, Folder, FolderPlus, Pencil, RefreshCw, ScanLine, Trash2, Upload } from 'lucide-react'
import Modal from '../../components/Modal'
import { DependencyNotice } from '../../components/WorkspaceShell'
import { useAuth } from '../../contexts/AuthContext'
import { useBusinessApi, useBusinessBlobApi } from '../../lib/businessApi'
import { jsonRequest } from '../../lib/http'
import type { FolderRecord, Material, Paginated, RuntimeCapabilities } from './types'
import { ActionMessage, fieldClass, IconAction, InlineEmpty, Pager, primaryButtonClass, secondaryButtonClass, SectionHeading, textareaClass } from './ui'

const API = '/api/v1/sales-knowledge'

function saveDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function MaterialsView({ capabilities }: { capabilities: RuntimeCapabilities | null }) {
  const request = useBusinessApi()
  const blobRequest = useBusinessBlobApi()
  const { activeTenant } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [materials, setMaterials] = useState<Paginated<Material> | null>(null)
  const [folders, setFolders] = useState<FolderRecord[]>([])
  const [category, setCategory] = useState('course')
  const [folderId, setFolderId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadTitle, setUploadTitle] = useState('')
  const [folderDialog, setFolderDialog] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [editing, setEditing] = useState<Material | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editTags, setEditTags] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async (nextPage: number, nextCategory: string, nextFolderId: number | null, nextSearch: string) => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ page: String(nextPage), page_size: '24', category: nextCategory })
      if (nextFolderId !== null) query.set('folder_id', String(nextFolderId))
      if (nextSearch.trim()) query.set('search', nextSearch.trim())
      const [nextMaterials, nextFolders] = await Promise.all([
        request<Paginated<Material>>(`${API}/materials/list?${query}`),
        request<FolderRecord[]>(`${API}/materials/folders/list?category=${encodeURIComponent(nextCategory)}`),
      ])
      setMaterials(nextMaterials)
      setFolders(nextFolders)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '素材库加载失败')
    } finally {
      setLoading(false)
    }
  }, [request])

  useEffect(() => {
    setPage(1)
    setFolderId(null)
    void load(1, category, null, '')
  }, [activeTenant?.id, category, load])

  async function uploadMaterial() {
    if (!uploadFile) return
    setActionLoading(true)
    setError('')
    setSuccess('')
    try {
      const form = new FormData()
      form.append('file', uploadFile, uploadFile.name)
      form.append('category', category)
      if (uploadTitle.trim()) form.append('title', uploadTitle.trim())
      if (folderId !== null) form.append('folder_id', String(folderId))
      await request<Material>(`${API}/materials/upload/proxy`, { method: 'POST', body: form })
      setUploadFile(null)
      setUploadTitle('')
      if (fileRef.current) fileRef.current.value = ''
      setSuccess('素材已上传并记录到当前租户')
      await load(page, category, folderId, search)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '素材上传失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function createFolder() {
    if (!folderName.trim()) return
    setActionLoading(true)
    setError('')
    try {
      await request(`${API}/materials/folder`, jsonRequest('POST', { name: folderName.trim(), category, parent_folder_id: folderId }))
      setFolderName('')
      setFolderDialog(false)
      setSuccess('文件夹已创建')
      await load(page, category, folderId, search)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '文件夹创建失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function previewMaterial(material: Material) {
    setActionLoading(true)
    setError('')
    try {
      const result = await request<{ url: string }>(`${API}/materials/${material.id}/preview`)
      window.open(result.url, '_blank', 'noopener,noreferrer')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '素材预览失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function maskMaterial(material: Material) {
    setActionLoading(true)
    setError('')
    setSuccess('')
    try {
      await request(`${API}/materials/${material.id}/mask`, jsonRequest('POST'))
      setSuccess('自动打码素材已生成，原素材保持不变')
      await load(page, category, folderId, search)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '自动打码失败')
    } finally {
      setActionLoading(false)
    }
  }

  function beginEdit(material: Material) {
    setEditing(material)
    setEditTitle(material.title || material.filename)
    setEditDescription(material.description || '')
    setEditTags((material.tags || []).join('、'))
  }

  async function saveEdit() {
    if (!editing || !editTitle.trim()) return
    setActionLoading(true)
    setError('')
    try {
      await request(`${API}/materials/${editing.id}`, jsonRequest('PUT', {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        tags: editTags.split(/[、,，]/).map(tag => tag.trim()).filter(Boolean),
      }))
      setEditing(null)
      setSuccess('素材信息已更新')
      await load(page, category, folderId, search)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '素材信息保存失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function deleteMaterial() {
    if (!deleteTarget) return
    setActionLoading(true)
    setError('')
    try {
      await request(`${API}/materials/${deleteTarget.id}`, jsonRequest('DELETE'))
      setDeleteTarget(null)
      setSuccess('素材已删除')
      await load(page, category, folderId, search)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '素材删除失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function exportRag() {
    setActionLoading(true)
    setError('')
    try {
      const download = await blobRequest(`${API}/materials/export/rag?category=${encodeURIComponent(category)}&max_per_tag=5&upload_tos=false`)
      saveDownload(download.blob, download.filename === 'download' ? `materials_${category}_rag.csv` : download.filename)
      setSuccess('素材 RAG 数据已导出')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '素材 RAG 导出失败')
    } finally {
      setActionLoading(false)
    }
  }

  const storageReady = capabilities?.capabilities.object_storage === true

  return (
    <div className="space-y-7" data-testid="sales-materials-view">
      {!storageReady && <DependencyNotice kind="database" title="对象存储未配置" detail="素材元数据与文件夹仍可查看，但文件上传、预览和打码已停用；不会返回虚假地址。" />}
      <ActionMessage loading={actionLoading} error={error} success={success} />

      <section>
        <SectionHeading title="素材入库" detail="课程资料和学员喜报通过后端中转写入对象存储，元数据保存在当前租户数据库。" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
          <label className="text-[11px] text-text-tertiary">素材分类<select className={`${fieldClass} mt-1`} value={category} onChange={event => setCategory(event.target.value)}><option value="course">课程素材</option><option value="report">学员喜报</option></select></label>
          <label className="text-[11px] text-text-tertiary">文件<input ref={fileRef} className={`${fieldClass} mt-1 py-2`} type="file" disabled={!storageReady} onChange={event => setUploadFile(event.target.files?.[0] || null)} /></label>
          <label className="text-[11px] text-text-tertiary">标题<input className={`${fieldClass} mt-1`} value={uploadTitle} onChange={event => setUploadTitle(event.target.value)} placeholder={uploadFile?.name || '可选'} /></label>
          <button className={primaryButtonClass} disabled={!storageReady || !uploadFile || actionLoading} onClick={() => void uploadMaterial()}><Upload size={14} /> 上传</button>
        </div>
      </section>

      <section>
        <SectionHeading title="素材管理" detail="按文件夹和关键词管理素材、标签、打码版本及 RAG 导出。" action={<div className="flex gap-2"><button className={secondaryButtonClass} onClick={() => setFolderDialog(true)}><FolderPlus size={14} /> 文件夹</button><button className={secondaryButtonClass} onClick={() => void exportRag()}><Download size={14} /> RAG CSV</button><button className={secondaryButtonClass} onClick={() => void load(page, category, folderId, search)}><RefreshCw size={14} /> 刷新</button></div>} />
        <div className="mt-4 grid gap-3 md:grid-cols-[200px_minmax(0,1fr)_auto]">
          <select className={fieldClass} value={folderId ?? ''} onChange={event => { const next = event.target.value ? Number(event.target.value) : null; setFolderId(next); setPage(1); void load(1, category, next, search) }} aria-label="素材文件夹"><option value="">全部文件夹</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name} ({folder.file_count})</option>)}</select>
          <input className={fieldClass} value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索标题或文件名" aria-label="素材搜索" />
          <button className={secondaryButtonClass} onClick={() => { setPage(1); void load(1, category, folderId, search) }}>搜索</button>
        </div>

        <div className="mt-4 border-y border-border">
          {loading ? <ActionMessage loading /> : !materials?.items.length ? <InlineEmpty>当前目录暂无素材</InlineEmpty> : materials.items.map(material => (
            <article key={material.id} className="grid gap-3 border-b border-border px-3 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0"><div className="flex items-center gap-2"><FileImage size={14} className="shrink-0 text-text-tertiary" /><span className="truncate text-sm text-text">{material.title || material.filename}</span>{material.is_pre_masked && <span className="text-[11px] text-success">已打码</span>}</div><div className="mt-1 text-[11px] text-text-tertiary">{material.filename} · {sizeLabel(material.file_size)} · 下载 {material.download_count}</div>{material.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-text-secondary">{material.description}</p>}{material.tags?.length > 0 && <div className="mt-2 text-[11px] text-text-tertiary">标签：{material.tags.join('、')}</div>}</div>
              <div className="flex items-start gap-1"><IconAction icon={Eye} label="预览素材" disabled={!storageReady} onClick={() => void previewMaterial(material)} /><IconAction icon={ScanLine} label="自动打码" disabled={!storageReady} onClick={() => void maskMaterial(material)} /><IconAction icon={Pencil} label="编辑素材" onClick={() => beginEdit(material)} /><IconAction icon={Trash2} label="删除素材" danger onClick={() => setDeleteTarget(material)} /></div>
            </article>
          ))}
        </div>
        {materials && <Pager page={page} hasMore={materials.has_more} onChange={next => { setPage(next); void load(next, category, folderId, search) }} />}
      </section>

      <Modal open={folderDialog} onClose={() => setFolderDialog(false)} title="创建素材文件夹"><div className="space-y-4"><label className="block text-xs text-text-secondary">文件夹名称<input autoFocus className={`${fieldClass} mt-2`} value={folderName} onChange={event => setFolderName(event.target.value)} /></label><div className="flex items-center gap-2 text-[11px] text-text-tertiary"><Folder size={13} /> {folderId === null ? '创建在根目录' : `创建在文件夹 #${folderId} 下`}</div><button className={`${primaryButtonClass} w-full`} disabled={!folderName.trim()} onClick={() => void createFolder()}><FolderPlus size={14} /> 创建</button></div></Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="编辑素材信息"><div className="space-y-4"><label className="block text-xs text-text-secondary">标题<input autoFocus className={`${fieldClass} mt-2`} value={editTitle} onChange={event => setEditTitle(event.target.value)} /></label><label className="block text-xs text-text-secondary">描述<textarea className={`${textareaClass} mt-2`} value={editDescription} onChange={event => setEditDescription(event.target.value)} /></label><label className="block text-xs text-text-secondary">标签<input className={`${fieldClass} mt-2`} value={editTags} onChange={event => setEditTags(event.target.value)} placeholder="用逗号或顿号分隔" /></label><button className={`${primaryButtonClass} w-full`} disabled={!editTitle.trim()} onClick={() => void saveEdit()}><Pencil size={14} /> 保存</button></div></Modal>

      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="删除素材"><p className="text-sm leading-6 text-text-secondary">确认删除“{deleteTarget?.title || deleteTarget?.filename}”？该操作会删除租户内素材记录及对应对象。</p><button className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-danger text-sm text-white" onClick={() => void deleteMaterial()}><Trash2 size={15} /> 确认删除</button></Modal>
    </div>
  )
}

