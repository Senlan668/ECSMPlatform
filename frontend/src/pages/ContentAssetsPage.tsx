import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, AudioLines, Check, ChevronRight, CloudUpload, Download, FilePlus2, FileStack, Film, FolderOpen, Link2, ListChecks, LoaderCircle, PackageOpen, Pencil, Plus, RefreshCw, RotateCcw, Scissors, Send, Trash2, Upload, WandSparkles, X } from 'lucide-react'
import Modal from '../components/Modal'
import { CollectionState, DependencyNotice, EmptyWorkspace, StatusText, WorkspaceShell, type WorkspaceTab } from '../components/WorkspaceShell'
import { extractAudio, type ExtractedAudio } from '../features/media/audioExtractor'
import { buildClipArchiveName } from '../features/media/localClipExport'
import { downloadBlob, exportVideoClipsLocally } from '../features/media/videoClipExporter'
import { useBusinessCollection } from '../lib/businessApi'
import { jsonRequest } from '../lib/http'
import { formatWorkspaceDate } from '../lib/tenantStorage'

type AssetTab = 'overview' | 'clipping' | 'materials'
type ClipStatus = 'queued' | 'transcribing' | 'analyzing' | 'review' | 'failed'
type AudioStatus = 'pending' | 'processing' | 'ready' | 'cancelled' | 'failed'

interface ClipSegment {
  id: string
  clipIndex: number
  source: 'manual' | 'ai'
  runtimeClipId: string | null
  title: string
  summary: string
  clipType: string
  startTime: number
  endTime: number
  viralityScore: number | null
  suggestedCaption: string
  viralTitles: string[]
  editingGuide: Record<string, unknown>
  createdAt: string
}

interface ClipExportRecord {
  succeeded: number
  failed: number
  createdAt: string
}

interface ClipTask {
  id: string
  fileName: string
  fileSize: number
  scene: string
  status: ClipStatus
  executionMode: string
  runtimeTaskId: string | null
  runtimeProgress: number
  runtimeMessage: string | null
  audioStatus: AudioStatus
  audioFileName: string | null
  audioFileSize: number | null
  videoStartOffset: number
  videoDuration: number | null
  segments: ClipSegment[]
  lastExport: ClipExportRecord | null
  error: string | null
  createdAt: string
  updatedAt: string
}

interface MaterialRecord {
  id: string
  name: string
  kind: string
  purpose: string
  status: 'draft' | 'ready'
  createdAt: string
}

interface LocalProcess {
  taskId: string
  kind: 'audio' | 'export'
  ratio: number
  message: string
}

const tabs: WorkspaceTab<AssetTab>[] = [
  { id: 'overview', label: '资产总览' },
  { id: 'clipping', label: '直播切片' },
  { id: 'materials', label: '销售素材' },
]

const clipStatusLabel: Record<ClipStatus, string> = {
  queued: '待派发 ASR',
  transcribing: '转写中',
  analyzing: '片段分析中',
  review: '待审核',
  failed: '运行失败',
}

const audioStatusLabel: Record<AudioStatus, string> = {
  pending: '音频未提取',
  processing: '音频提取中',
  ready: '音频已就绪',
  cancelled: '音频提取已取消',
  failed: '音频提取失败',
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatTimecode(value: number) {
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const seconds = value % 60
  const secondText = seconds.toFixed(seconds % 1 === 0 ? 0 : 2).padStart(2, '0')
  return `${hours > 0 ? `${String(hours).padStart(2, '0')}:` : ''}${String(minutes).padStart(2, '0')}:${secondText}`
}

function parseTimecode(value: string): number | null {
  const parts = value.trim().split(':')
  if (parts.length > 3 || parts.some(part => part === '' || !/^\d+(\.\d+)?$/.test(part))) return null
  const numbers = parts.map(Number)
  if (numbers.some(number => !Number.isFinite(number))) return null
  if (numbers.length === 1) return numbers[0]
  if (numbers.length === 2) return numbers[0] * 60 + numbers[1]
  return numbers[0] * 3600 + numbers[1] * 60 + numbers[2]
}

function processRatio(stage: string, current: number, total: number) {
  if (stage === 'loading') return 0.05
  if (stage === 'reading') return 0.1
  if (stage === 'clipping') return 0.1 + (total === 0 ? 0 : current / total) * 0.75
  if (stage === 'zipping') return 0.92
  return 1
}

export default function ContentAssetsPage() {
  const [activeTab, setActiveTab] = useState<AssetTab>('overview')
  const clips = useBusinessCollection<ClipTask>('/api/v1/assets/clip-tasks')
  const materialRecords = useBusinessCollection<MaterialRecord>('/api/v1/assets/materials')
  const clipTasks = clips.items
  const materials = materialRecords.items
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [scene, setScene] = useState('电商直播')
  const [localFiles, setLocalFiles] = useState<Record<string, File>>({})
  const [localAudio, setLocalAudio] = useState<Record<string, ExtractedAudio>>({})
  const [activeProcess, setActiveProcess] = useState<LocalProcess | null>(null)
  const [networkTaskId, setNetworkTaskId] = useState<string | null>(null)
  const processController = useRef<AbortController | null>(null)
  const runtimeSyncing = useRef(false)
  const [segmentTaskId, setSegmentTaskId] = useState<string | null>(null)
  const [renameTaskId, setRenameTaskId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [segmentTitle, setSegmentTitle] = useState('')
  const [segmentStart, setSegmentStart] = useState('00:00')
  const [segmentEnd, setSegmentEnd] = useState('00:30')
  const [materialDialogOpen, setMaterialDialogOpen] = useState(false)
  const [materialName, setMaterialName] = useState('')
  const [materialKind, setMaterialKind] = useState('销售报告')
  const [materialPurpose, setMaterialPurpose] = useState('销售训练')
  const [actionError, setActionError] = useState('')

  useEffect(() => () => processController.current?.abort(), [])

  const metrics = useMemo(() => [
    { label: '租户资产记录', value: materials.length + clipTasks.length, detail: '控制面内存适配器' },
    { label: '切片任务', value: clipTasks.length, detail: `${clipTasks.filter(task => task.audioStatus === 'ready').length} 个音频已就绪` },
    { label: '可用销售素材', value: materials.filter(material => material.status === 'ready').length, detail: '对象存储未接入' },
  ], [clipTasks, materials])

  const pollingTaskIds = useMemo(() => clipTasks
    .filter(task => task.runtimeTaskId && (task.status === 'transcribing' || task.status === 'analyzing'))
    .map(task => task.id)
    .join(','), [clipTasks])

  useEffect(() => {
    if (!pollingTaskIds) return
    const taskIds = pollingTaskIds.split(',')
    let stopped = false
    const sync = async () => {
      if (runtimeSyncing.current) return
      runtimeSyncing.current = true
      try {
        const updates = await Promise.all(taskIds.map(taskId => clips.request<ClipTask>(
          `/api/v1/assets/clip-tasks/${taskId}/sync`, jsonRequest('POST'),
        )))
        if (!stopped) clips.setItems(current => current.map(item => updates.find(update => update.id === item.id) ?? item))
      } catch (reason) {
        if (!stopped) setActionError(errorMessage(reason, 'Live Clip 运行时状态同步失败'))
      } finally {
        runtimeSyncing.current = false
      }
    }
    const timer = window.setInterval(() => void sync(), 2000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [pollingTaskIds, clips.request, clips.setItems])

  function replaceTask(updated: ClipTask) {
    clips.setItems(current => current.map(item => item.id === updated.id ? updated : item))
  }

  function errorMessage(reason: unknown, fallback: string) {
    return reason instanceof Error && reason.message ? reason.message : fallback
  }

  async function createClipTask() {
    if (!selectedFile) return
    const sourceFile = selectedFile
    setActionError('')
    try {
      const created = await clips.request<ClipTask>('/api/v1/assets/clip-tasks', jsonRequest('POST', {
        fileName: sourceFile.name,
        fileSize: sourceFile.size,
        scene,
      }))
      clips.setItems(current => [created, ...current])
      setLocalFiles(current => ({ ...current, [created.id]: sourceFile }))
      setSelectedFile(null)
      setFileInputKey(current => current + 1)
    } catch (reason) {
      setActionError(errorMessage(reason, '切片任务创建失败'))
    }
  }

  function bindLocalFile(task: ClipTask, file: File | undefined) {
    if (!file) return
    if (file.name !== task.fileName || file.size !== task.fileSize) {
      setActionError(`所选文件与任务登记的源文件不一致：应为 ${task.fileName}（${formatBytes(task.fileSize)}）`)
      return
    }
    setActionError('')
    setLocalFiles(current => ({ ...current, [task.id]: file }))
  }

  async function registerAudioState(taskId: string, body: Record<string, unknown>) {
    const updated = await clips.request<ClipTask>(`/api/v1/assets/clip-tasks/${taskId}/audio-extraction`, jsonRequest('POST', body))
    replaceTask(updated)
    return updated
  }

  async function startAudioExtraction(task: ClipTask) {
    const file = localFiles[task.id]
    if (!file || activeProcess) return
    setActionError('')
    const controller = new AbortController()
    processController.current = controller
    setActiveProcess({ taskId: task.id, kind: 'audio', ratio: 0, message: '正在登记本地处理...' })

    try {
      await registerAudioState(task.id, { status: 'processing' })
      const result = await extractAudio(file, progress => {
        setActiveProcess(current => current?.taskId === task.id
          ? { ...current, ratio: progress.ratio, message: progress.message }
          : current)
      }, controller.signal)
      setLocalAudio(current => ({ ...current, [task.id]: result }))
      await registerAudioState(task.id, {
        status: 'ready',
        audioFileName: result.filename,
        audioFileSize: result.blob.size,
        videoStartOffset: result.startOffset,
        videoDuration: result.videoDuration,
      })
    } catch (reason) {
      const cancelled = controller.signal.aborted || (reason instanceof DOMException && reason.name === 'AbortError')
      const message = errorMessage(reason, '音频提取失败')
      try {
        await registerAudioState(task.id, { status: cancelled ? 'cancelled' : 'failed', error: cancelled ? null : message })
      } catch (registrationReason) {
        setActionError(`${message}；控制面状态登记失败：${errorMessage(registrationReason, '未知错误')}`)
      }
      if (!cancelled) setActionError(message)
    } finally {
      if (processController.current === controller) processController.current = null
      setActiveProcess(current => current?.taskId === task.id ? null : current)
    }
  }

  function cancelLocalProcess() {
    processController.current?.abort()
  }

  function downloadAudio(task: ClipTask) {
    const audio = localAudio[task.id]
    if (!audio) return
    downloadBlob(audio.blob, audio.filename)
  }

  async function dispatchToRuntime(task: ClipTask) {
    const audio = localAudio[task.id]
    if (!audio || networkTaskId || activeProcess) return
    setActionError('')
    setNetworkTaskId(task.id)
    const body = new FormData()
    body.append('audio', audio.blob, audio.filename)
    try {
      const updated = await clips.request<ClipTask>(`/api/v1/assets/clip-tasks/${task.id}/dispatch`, {
        method: 'POST', body,
      })
      replaceTask(updated)
    } catch (reason) {
      setActionError(errorMessage(reason, 'Live Clip 任务派发失败'))
    } finally {
      setNetworkTaskId(null)
    }
  }

  async function dispatchVideoToRuntime(task: ClipTask) {
    const video = localFiles[task.id]
    if (!video || networkTaskId || activeProcess) return
    setActionError('')
    setNetworkTaskId(task.id)
    const body = new FormData()
    body.append('video', video, video.name)
    try {
      const updated = await clips.request<ClipTask>(`/api/v1/assets/clip-tasks/${task.id}/dispatch-video`, {
        method: 'POST', body,
      })
      replaceTask(updated)
    } catch (reason) {
      setActionError(errorMessage(reason, '完整视频兜底派发失败'))
    } finally {
      setNetworkTaskId(null)
    }
  }

  async function renameTask() {
    if (!renameTaskId || !renameValue.trim()) return
    setActionError('')
    try {
      const updated = await clips.request<ClipTask>(
        `/api/v1/assets/clip-tasks/${renameTaskId}`,
        jsonRequest('PATCH', { fileName: renameValue.trim() }),
      )
      replaceTask(updated)
      setRenameTaskId(null)
      setRenameValue('')
    } catch (reason) {
      setActionError(errorMessage(reason, '任务重命名失败'))
    }
  }

  async function syncRuntime(task: ClipTask) {
    if (!task.runtimeTaskId || networkTaskId) return
    setActionError('')
    setNetworkTaskId(task.id)
    try {
      replaceTask(await clips.request<ClipTask>(`/api/v1/assets/clip-tasks/${task.id}/sync`, jsonRequest('POST')))
    } catch (reason) {
      setActionError(errorMessage(reason, 'Live Clip 状态同步失败'))
    } finally {
      setNetworkTaskId(null)
    }
  }

  async function retryRuntime(task: ClipTask) {
    if (!task.runtimeTaskId || networkTaskId) return
    setActionError('')
    setNetworkTaskId(task.id)
    try {
      replaceTask(await clips.request<ClipTask>(`/api/v1/assets/clip-tasks/${task.id}/retry`, jsonRequest('POST')))
    } catch (reason) {
      setActionError(errorMessage(reason, 'Live Clip 任务重试失败'))
    } finally {
      setNetworkTaskId(null)
    }
  }

  async function addSegment() {
    if (!segmentTaskId || !segmentTitle.trim()) return
    const startTime = parseTimecode(segmentStart)
    const endTime = parseTimecode(segmentEnd)
    if (startTime === null || endTime === null || endTime <= startTime) {
      setActionError('片段时间码无效，结束时间必须晚于开始时间')
      return
    }
    setActionError('')
    try {
      const updated = await clips.request<ClipTask>(`/api/v1/assets/clip-tasks/${segmentTaskId}/segments`, jsonRequest('POST', {
        title: segmentTitle.trim(), startTime, endTime,
      }))
      replaceTask(updated)
      setSegmentTaskId(null)
      setSegmentTitle('')
      setSegmentStart('00:00')
      setSegmentEnd('00:30')
    } catch (reason) {
      setActionError(errorMessage(reason, '片段保存失败'))
    }
  }

  async function deleteSegment(taskId: string, segmentId: string) {
    setActionError('')
    try {
      const updated = await clips.request<ClipTask>(`/api/v1/assets/clip-tasks/${taskId}/segments/${segmentId}`, jsonRequest('DELETE'))
      replaceTask(updated)
    } catch (reason) {
      setActionError(errorMessage(reason, '片段删除失败'))
    }
  }

  async function enhanceSegment(taskId: string, segmentId: string, capability: 'viral-titles' | 'editing-guide') {
    setActionError('')
    setNetworkTaskId(taskId)
    try {
      const updated = await clips.request<ClipTask>(
        `/api/v1/assets/clip-tasks/${taskId}/segments/${segmentId}/${capability}`,
        jsonRequest('POST'),
      )
      replaceTask(updated)
    } catch (reason) {
      setActionError(errorMessage(reason, capability === 'viral-titles' ? '爆款标题生成失败' : '剪辑指南生成失败'))
    } finally {
      setNetworkTaskId(null)
    }
  }

  async function exportClips(task: ClipTask) {
    const file = localFiles[task.id]
    if (!file || task.segments.length === 0 || activeProcess) return
    setActionError('')
    const controller = new AbortController()
    processController.current = controller
    setActiveProcess({ taskId: task.id, kind: 'export', ratio: 0, message: '正在准备本地导出...' })
    try {
      const result = await exportVideoClipsLocally({
        videoFile: file,
        clips: task.segments,
        videoStartOffset: task.videoStartOffset,
        signal: controller.signal,
        onProgress: progress => setActiveProcess(current => current?.taskId === task.id ? {
          ...current,
          ratio: processRatio(progress.stage, progress.currentClip, progress.totalClips),
          message: progress.message,
        } : current),
      })
      const updated = await clips.request<ClipTask>(`/api/v1/assets/clip-tasks/${task.id}/exports`, jsonRequest('POST', {
        succeeded: result.succeeded,
        failed: result.failed.length,
      }))
      replaceTask(updated)
      downloadBlob(result.blob, buildClipArchiveName(task.fileName))
      if (result.failed.length > 0) setActionError(`已导出 ${result.succeeded} 段，另有 ${result.failed.length} 段失败`)
    } catch (reason) {
      const cancelled = controller.signal.aborted || (reason instanceof DOMException && reason.name === 'AbortError')
      if (!cancelled) setActionError(errorMessage(reason, '本地切片导出失败'))
    } finally {
      if (processController.current === controller) processController.current = null
      setActiveProcess(current => current?.taskId === task.id ? null : current)
    }
  }

  async function deleteClipTask(taskId: string) {
    if (activeProcess?.taskId === taskId) return
    setActionError('')
    try {
      await clips.request<void>(`/api/v1/assets/clip-tasks/${taskId}`, jsonRequest('DELETE'))
      clips.setItems(current => current.filter(item => item.id !== taskId))
      setLocalFiles(current => { const next = { ...current }; delete next[taskId]; return next })
      setLocalAudio(current => { const next = { ...current }; delete next[taskId]; return next })
    } catch (reason) {
      setActionError(errorMessage(reason, '任务删除失败'))
    }
  }

  async function createMaterial() {
    if (!materialName.trim()) return
    setActionError('')
    try {
      const created = await materialRecords.request<MaterialRecord>('/api/v1/assets/materials', jsonRequest('POST', {
        name: materialName.trim(), kind: materialKind, purpose: materialPurpose,
      }))
      materialRecords.setItems(current => [created, ...current])
      setMaterialName('')
      setMaterialDialogOpen(false)
    } catch (reason) {
      setActionError(errorMessage(reason, '素材登记失败'))
    }
  }

  async function confirmMaterial(materialId: string) {
    setActionError('')
    try {
      const updated = await materialRecords.request<MaterialRecord>(`/api/v1/assets/materials/${materialId}/confirm`, jsonRequest('POST'))
      materialRecords.setItems(current => current.map(item => item.id === materialId ? updated : item))
    } catch (reason) {
      setActionError(errorMessage(reason, '素材确认失败'))
    }
  }

  async function deleteMaterial(materialId: string) {
    setActionError('')
    try {
      await materialRecords.request<void>(`/api/v1/assets/materials/${materialId}`, jsonRequest('DELETE'))
      materialRecords.setItems(current => current.filter(item => item.id !== materialId))
    } catch (reason) {
      setActionError(errorMessage(reason, '素材删除失败'))
    }
  }

  return (
    <WorkspaceShell
      eyebrow="项目四"
      title="内容资产与多模态加工"
      description="统一管理原始素材、版本、版权和 AI 衍生物。媒体二进制留在本地浏览器，任务事件、片段时间码和导出记录由租户控制面管理。"
      icon={FileStack}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === 'overview' && (
        <section aria-label="资产资源概况">
          <DependencyNotice kind="database" title="外部资产仓储未接入" detail="元数据暂存于服务内存；关系库和对象存储端口保留，视频与音频不会写入浏览器持久化存储。" />
          {actionError && <div className="mt-4"><CollectionState loading={false} error={actionError} /></div>}
          <div className="mt-6 grid divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {metrics.map(metric => <div key={metric.label} className="py-5 sm:px-5 sm:first:pl-0"><div className="font-display text-3xl text-text">{metric.value}</div><div className="mt-2 text-xs font-medium text-text">{metric.label}</div><div className="mt-1 text-[11px] text-text-tertiary">{metric.detail}</div></div>)}
          </div>
          <div className="mt-9 grid gap-8 lg:grid-cols-2">
            <div className="border-t border-border pt-4"><div className="flex items-center gap-2 text-sm font-medium text-text"><Film size={15} /> 媒体加工链</div><div className="mt-4 divide-y divide-border border-y border-border">{['原视频登记', '浏览器提取音频', 'ASR 与切片规划', '人工审核时间码', '浏览器导出 ZIP'].map((step, index) => <div key={step} className="flex items-center gap-3 py-3 text-xs"><span className="w-5 text-text-tertiary">0{index + 1}</span><span className="flex-1 text-text-secondary">{step}</span><ChevronRight size={13} className="text-text-tertiary" /></div>)}</div></div>
            <div className="border-t border-border pt-4"><div className="flex items-center gap-2 text-sm font-medium text-text"><Archive size={15} /> 资产不变量</div><div className="mt-4 space-y-3 text-xs leading-5 text-text-secondary"><p>原始证据保持不可变；转写、标签、片段计划和媒体导出均作为可追溯衍生版本。</p><p>控制面只接收文件元数据和处理结果，不接收本地视频或音频二进制。</p></div></div>
          </div>
        </section>
      )}

      {activeTab === 'clipping' && (
        <section aria-label="直播切片工作台">
          <DependencyNotice title="浏览器媒体引擎已接入" detail="音频提取与视频切片由 FFmpeg.wasm 本地执行；云端 ASR 尚未派发时，任务会保持待派发状态。" />
          {actionError && <div className="mt-4"><CollectionState loading={false} error={actionError} /></div>}
          <div className="mt-6 grid gap-4 border-y border-border py-5 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end">
            <label className="block text-xs text-text-secondary">本地视频<span className="mt-2 flex h-10 items-center gap-2 rounded-md border border-border bg-page px-3 text-sm text-text-secondary"><FolderOpen size={15} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{selectedFile?.name || '未选择文件'}</span><input key={fileInputKey} type="file" accept="video/*" className="sr-only" aria-label="选择本地视频" onChange={event => setSelectedFile(event.target.files?.[0] || null)} /></span></label>
            <label className="block text-xs text-text-secondary">场景<select value={scene} onChange={event => setScene(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-page px-3 text-sm text-text outline-none"><option>电商直播</option><option>知识分享</option><option>访谈播客</option><option>课程精华</option></select></label>
            <button onClick={() => void createClipTask()} disabled={!selectedFile || Boolean(activeProcess) || Boolean(networkTaskId)} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm text-page disabled:opacity-40"><Upload size={15} /> 登记源视频</button>
          </div>

          <div className="mt-6 border-y border-border">
            <CollectionState loading={clips.loading} error={clips.error} />
            {!clips.loading && !clips.error && (clipTasks.length === 0 ? <EmptyWorkspace title="暂无切片任务" detail="登记本地视频后即可执行音频提取与片段导出。" /> : clipTasks.map(task => {
              const taskProcess = activeProcess?.taskId === task.id ? activeProcess : null
              const sourceFile = localFiles[task.id]
              const audio = localAudio[task.id]
              const networkBusy = networkTaskId === task.id
              const audioTone = task.audioStatus === 'ready' ? 'success' : task.audioStatus === 'failed' ? 'danger' : 'neutral'
              return (
                <article key={task.id} className="border-b border-border py-5 last:border-b-0">
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><Film size={14} className="shrink-0 text-text-tertiary" /><span className="truncate text-sm text-text">{task.fileName}</span><StatusText tone={task.status === 'review' ? 'success' : task.status === 'failed' ? 'danger' : 'neutral'}>{clipStatusLabel[task.status]}</StatusText><StatusText tone={audioTone}>{audioStatusLabel[task.audioStatus]}</StatusText></div>
                      <div className="mt-1 text-xs text-text-tertiary">{task.scene} · {formatBytes(task.fileSize)} · {formatWorkspaceDate(task.createdAt)}</div>
                      {task.audioStatus === 'ready' && <div className="mt-2 text-[11px] text-text-secondary">{task.audioFileName} · {formatBytes(task.audioFileSize ?? 0)}{task.videoDuration ? ` · 时长 ${formatTimecode(task.videoDuration)}` : ''}{!audio ? ' · 本地音频已随页面刷新释放' : ''}</div>}
                      {task.error && <div className="mt-2 text-[11px] text-danger">{task.error}</div>}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <label className="flex h-8 w-8 cursor-pointer items-center justify-center text-text-tertiary hover:text-text" title={sourceFile ? '重新关联源文件' : '关联源文件'}><Link2 size={14} /><input type="file" accept="video/*" className="sr-only" aria-label={`关联 ${task.fileName}`} onChange={event => { bindLocalFile(task, event.target.files?.[0]); event.target.value = '' }} /></label>
                      <button onClick={() => { setRenameTaskId(task.id); setRenameValue(task.fileName) }} disabled={Boolean(activeProcess) || Boolean(networkTaskId)} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text disabled:opacity-30" title="重命名任务" aria-label={`重命名 ${task.fileName}`}><Pencil size={14} /></button>
                      <button onClick={() => void startAudioExtraction(task)} disabled={!sourceFile || Boolean(activeProcess) || Boolean(networkTaskId) || Boolean(task.runtimeTaskId)} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text disabled:opacity-30" title={task.audioStatus === 'ready' ? '重新提取音频' : '提取音频'} aria-label={`提取 ${task.fileName} 音频`}><AudioLines size={15} /></button>
                      <button onClick={() => downloadAudio(task)} disabled={!audio || task.audioStatus !== 'ready'} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text disabled:opacity-30" title="下载本地音频" aria-label={`下载 ${task.fileName} 音频`}><Download size={15} /></button>
                      {!task.runtimeTaskId && <button onClick={() => void dispatchToRuntime(task)} disabled={!audio || task.audioStatus !== 'ready' || Boolean(activeProcess) || Boolean(networkTaskId)} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text disabled:opacity-30" title="派发 ASR 与 AI 分析" aria-label={`派发 ${task.fileName} 到 AI 运行时`}>{networkBusy ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}</button>}
                      {!task.runtimeTaskId && <button onClick={() => void dispatchVideoToRuntime(task)} disabled={!sourceFile || Boolean(activeProcess) || Boolean(networkTaskId)} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text disabled:opacity-30" title="服务器整视频兜底处理" aria-label={`整视频派发 ${task.fileName}`}>{networkBusy ? <LoaderCircle size={15} className="animate-spin" /> : <CloudUpload size={15} />}</button>}
                      {task.runtimeTaskId && task.status !== 'failed' && <button onClick={() => void syncRuntime(task)} disabled={Boolean(networkTaskId)} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text disabled:opacity-30" title="同步运行时状态" aria-label={`同步 ${task.fileName} 状态`}>{networkBusy ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={14} />}</button>}
                      {task.runtimeTaskId && task.status === 'failed' && <button onClick={() => void retryRuntime(task)} disabled={Boolean(networkTaskId)} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text disabled:opacity-30" title="重试 AI 任务" aria-label={`重试 ${task.fileName}`}>{networkBusy ? <LoaderCircle size={15} className="animate-spin" /> : <RotateCcw size={14} />}</button>}
                      <button onClick={() => setSegmentTaskId(task.id)} disabled={Boolean(activeProcess) || Boolean(networkTaskId)} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text disabled:opacity-30" title="添加片段时间码" aria-label={`为 ${task.fileName} 添加片段`}><Scissors size={15} /></button>
                      <button onClick={() => void exportClips(task)} disabled={!sourceFile || task.segments.length === 0 || Boolean(activeProcess) || Boolean(networkTaskId)} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text disabled:opacity-30" title="导出切片 ZIP" aria-label={`导出 ${task.fileName} 切片`}><PackageOpen size={15} /></button>
                      <button onClick={() => void deleteClipTask(task.id)} disabled={Boolean(taskProcess) || Boolean(networkTaskId)} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-danger disabled:opacity-30" title="删除任务" aria-label={`删除 ${task.fileName}`}><Trash2 size={14} /></button>
                    </div>
                  </div>

                  {taskProcess && <div className="mt-4 border-y border-border bg-surface px-3 py-3"><div className="flex items-center gap-2 text-xs text-text-secondary"><LoaderCircle size={14} className="animate-spin" /><span className="min-w-0 flex-1 truncate">{taskProcess.message}</span><span className="font-mono text-[11px] text-text-tertiary">{Math.round(taskProcess.ratio * 100)}%</span><button onClick={cancelLocalProcess} className="flex h-7 w-7 items-center justify-center text-text-tertiary hover:text-danger" title="取消本地处理" aria-label="取消本地处理"><X size={14} /></button></div><div className="mt-2 h-1 overflow-hidden bg-border"><div className="h-full bg-accent transition-[width]" style={{ width: `${Math.max(2, taskProcess.ratio * 100)}%` }} /></div></div>}

                  {!taskProcess && task.runtimeTaskId && (task.status === 'transcribing' || task.status === 'analyzing') && <div className="mt-4 border-y border-border bg-surface px-3 py-3"><div className="flex items-center gap-2 text-xs text-text-secondary"><LoaderCircle size={14} className="animate-spin" /><span className="min-w-0 flex-1 truncate">{task.runtimeMessage || 'AI 运行时处理中'}</span><span className="font-mono text-[11px] text-text-tertiary">{task.runtimeProgress}%</span></div><div className="mt-2 h-1 overflow-hidden bg-border"><div className="h-full bg-accent transition-[width]" style={{ width: `${Math.max(2, task.runtimeProgress)}%` }} /></div></div>}

                  {!sourceFile && <div className="mt-3 text-[11px] text-text-tertiary">源文件仅保留在当前浏览器会话中；继续处理前需重新关联同名、同大小文件。</div>}

                  {task.segments.length > 0 && (
                    <div className="mt-4 border-y border-border" aria-label={`${task.fileName}片段时间码`}>
                      {task.segments.map(segment => (
                        <div key={segment.id} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-3 border-b border-border py-3 last:border-b-0">
                          <span className="pt-0.5 font-mono text-[10px] text-text-tertiary">{String(segment.clipIndex).padStart(2, '0')}</span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2"><span className="truncate text-xs text-text">{segment.title}</span><StatusText tone={segment.source === 'ai' ? 'success' : 'neutral'}>{segment.source === 'ai' ? `AI 片段${segment.viralityScore === null ? '' : ` · 热度 ${segment.viralityScore}`}` : '人工片段'}</StatusText></div>
                            <div className="mt-1 font-mono text-[10px] text-text-tertiary">{formatTimecode(segment.startTime)} - {formatTimecode(segment.endTime)} · {formatTimecode(segment.endTime - segment.startTime)}</div>
                            {segment.summary && <p className="mt-1.5 text-[11px] leading-5 text-text-secondary">{segment.summary}</p>}
                            {segment.suggestedCaption && <p className="mt-1 text-[11px] leading-5 text-text-tertiary">{segment.suggestedCaption}</p>}
                            {segment.viralTitles.length > 0 && <div className="mt-2 text-[11px] leading-5 text-text-secondary"><span className="text-text-tertiary">候选标题：</span>{segment.viralTitles.join(' / ')}</div>}
                            {Object.keys(segment.editingGuide).length > 0 && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-secondary">{Object.entries(segment.editingGuide).map(([key, value]) => <span key={key}><span className="text-text-tertiary">{key}：</span>{typeof value === 'string' ? value : JSON.stringify(value)}</span>)}</div>}
                          </div>
                          <div className="flex items-center gap-1">
                            {segment.source === 'ai' && <button onClick={() => void enhanceSegment(task.id, segment.id, 'viral-titles')} disabled={Boolean(activeProcess) || Boolean(networkTaskId)} className="flex h-7 w-7 items-center justify-center text-text-tertiary hover:text-text disabled:opacity-30" title="生成爆款标题" aria-label={`为 ${segment.title} 生成爆款标题`}><WandSparkles size={13} /></button>}
                            {segment.source === 'ai' && <button onClick={() => void enhanceSegment(task.id, segment.id, 'editing-guide')} disabled={Boolean(activeProcess) || Boolean(networkTaskId)} className="flex h-7 w-7 items-center justify-center text-text-tertiary hover:text-text disabled:opacity-30" title="生成剪辑指南" aria-label={`为 ${segment.title} 生成剪辑指南`}><ListChecks size={13} /></button>}
                            <button onClick={() => void deleteSegment(task.id, segment.id)} disabled={Boolean(activeProcess) || Boolean(networkTaskId)} className="flex h-7 w-7 items-center justify-center text-text-tertiary hover:text-danger disabled:opacity-30" title="删除片段" aria-label={`删除片段 ${segment.title}`}><Trash2 size={13} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {task.lastExport && <div className="mt-3 text-[11px] text-text-tertiary">最近导出：成功 {task.lastExport.succeeded} 段，失败 {task.lastExport.failed} 段 · {formatWorkspaceDate(task.lastExport.createdAt)}</div>}
                </article>
              )
            }))}
          </div>
        </section>
      )}

      {activeTab === 'materials' && (
        <section aria-label="销售素材工作台">
          <div className="flex items-center justify-between gap-4"><DependencyNotice kind="database" title="素材库未接入" detail="报告文件、学员绑定和脱敏状态目前只登记元数据。" /><button onClick={() => setMaterialDialogOpen(true)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-page" title="登记素材" aria-label="登记素材"><Plus size={17} /></button></div>
          {actionError && <div className="mt-4"><CollectionState loading={false} error={actionError} /></div>}
          <div className="mt-6 border-y border-border"><CollectionState loading={materialRecords.loading} error={materialRecords.error} />{!materialRecords.loading && !materialRecords.error && (materials.length === 0 ? <EmptyWorkspace title="暂无销售素材" detail="可先登记报告、话术或商品资料的元数据。" /> : materials.map(material => <div key={material.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border py-4 last:border-b-0"><div className="min-w-0"><div className="flex items-center gap-2"><FilePlus2 size={14} className="text-text-tertiary" /><span className="truncate text-sm text-text">{material.name}</span><StatusText tone={material.status === 'ready' ? 'success' : 'neutral'}>{material.status === 'ready' ? '元数据就绪' : '草稿'}</StatusText></div><div className="mt-1 text-xs text-text-tertiary">{material.kind} · {material.purpose} · {formatWorkspaceDate(material.createdAt)}</div></div><div className="flex items-center gap-1">{material.status === 'draft' && <button onClick={() => void confirmMaterial(material.id)} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-success" title="确认元数据" aria-label={`确认 ${material.name}`}><Check size={14} /></button>}<button onClick={() => void deleteMaterial(material.id)} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-danger" title="删除素材" aria-label={`删除 ${material.name}`}><Trash2 size={14} /></button></div></div>))}</div>
        </section>
      )}

      <Modal open={Boolean(segmentTaskId)} onClose={() => setSegmentTaskId(null)} title="添加片段时间码">
        <div className="space-y-4">
          <label className="block text-xs text-text-secondary">片段标题<input value={segmentTitle} onChange={event => setSegmentTitle(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-page px-3 text-sm outline-none" autoFocus aria-label="片段标题" placeholder="例如：商品核心卖点" /></label>
          <div className="grid grid-cols-2 gap-3"><label className="block text-xs text-text-secondary">开始时间<input value={segmentStart} onChange={event => setSegmentStart(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-page px-3 font-mono text-sm outline-none" aria-label="片段开始时间" placeholder="00:00" /></label><label className="block text-xs text-text-secondary">结束时间<input value={segmentEnd} onChange={event => setSegmentEnd(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-page px-3 font-mono text-sm outline-none" aria-label="片段结束时间" placeholder="00:30" /></label></div>
          <button onClick={() => void addSegment()} disabled={!segmentTitle.trim()} className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent text-sm text-page disabled:opacity-40"><Scissors size={15} /> 保存片段</button>
        </div>
      </Modal>

      <Modal open={Boolean(renameTaskId)} onClose={() => { setRenameTaskId(null); setRenameValue('') }} title="重命名切片任务">
        <label className="block text-xs text-text-secondary">任务名称<input value={renameValue} onChange={event => setRenameValue(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-page px-3 text-sm outline-none" autoFocus maxLength={255} aria-label="切片任务名称" /></label>
        <button onClick={() => void renameTask()} disabled={!renameValue.trim()} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent text-sm text-page disabled:opacity-40"><Pencil size={14} /> 保存名称</button>
      </Modal>

      <Modal open={materialDialogOpen} onClose={() => setMaterialDialogOpen(false)} title="登记销售素材">
        <div className="space-y-4"><label className="block text-xs text-text-secondary">素材名称<input value={materialName} onChange={event => setMaterialName(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-page px-3 text-sm outline-none" autoFocus aria-label="素材名称" placeholder="例如：七月销售复盘报告" /></label><label className="block text-xs text-text-secondary">类型<select value={materialKind} onChange={event => setMaterialKind(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-page px-3 text-sm"><option>销售报告</option><option>成交话术</option><option>商品资料</option><option>培训文档</option></select></label><label className="block text-xs text-text-secondary">用途<select value={materialPurpose} onChange={event => setMaterialPurpose(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-page px-3 text-sm"><option>销售训练</option><option>客服知识</option><option>内容创作</option><option>经营分析</option></select></label><button onClick={() => void createMaterial()} disabled={!materialName.trim()} className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent text-sm text-page disabled:opacity-40"><Plus size={15} /> 保存素材</button></div>
      </Modal>
    </WorkspaceShell>
  )
}
