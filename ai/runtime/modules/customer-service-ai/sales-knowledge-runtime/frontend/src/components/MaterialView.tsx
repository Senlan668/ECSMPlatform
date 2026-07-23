import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { FileText, Image as ImageIcon, Upload, Download, Search, X, FolderOpen, File, FileType2, Eye, Trash2, Loader2, AlertTriangle, Pencil, Check, ChevronLeft, ChevronRight, FolderPlus, Folder, Undo2, RotateCcw, Minus, Plus, Copy, ClipboardCheck, Tag, Link2, Unlink2 } from 'lucide-react'
import { Material } from '../types'
import { cn } from '../utils'
import { getErrorMessage } from '../utils/errorMessage'
import { useToast } from '../contexts/ToastContext'
import { getMaterialDisplayName, getMaterialUploadTime } from './materialDisplay'
import {
  bindStudentMainReport,
  getMaterials,
  getMaterialsStatus,
  getMaterialPreviewUrl,
  getMaterialDownloadUrl,
  deleteMaterial,
  getStudents,
  proxyUploadMaterial,
  unbindStudentMainReport,
  updateMaterial,
  manualMaskMaterial,
  getFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  getMaterialTags,
  moveMaterial,
  previewMaterialsRag,
  exportMaterialsRag,
} from '../api'
import type { FolderData } from '../api'
import { buildMaterialMoveSuccessState, canDragMaterialMove, getMoveTarget } from './materialFolderMove'
import { getMaterialPreviewNavigation } from './materialPreviewNavigation'

interface StudentBindingOption {
  id: number
  name: string
}

// 格式化文件大小
export const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

// 备注编辑器组件
function RemarkEditor({ value, onSave }: { value: string; onSave: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value)

  useEffect(() => { setText(value) }, [value])

  const handleSave = async () => {
    const trimmed = text.trim()
    if (trimmed !== value) {
      await onSave(trimmed)
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Pencil size={14} className="text-amber-500 shrink-0" />
        <input
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setText(value); setEditing(false) } }}
          onBlur={handleSave}
          placeholder="输入备注（如：班级群截图、1M薪资案例…）"
          className="flex-1 bg-black/30 border border-amber-500/30 text-gray-200 text-sm rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-amber-500/40 placeholder:text-gray-600"
        />
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-2 cursor-pointer group/remark rounded-lg px-1 py-0.5 -mx-1 hover:bg-white/5 transition-colors"
      onClick={() => setEditing(true)}
      title="点击编辑备注"
    >
      <Pencil size={14} className="text-amber-500/50 group-hover/remark:text-amber-500 transition-colors shrink-0" />
      {value ? (
        <span className="text-sm text-amber-400/80">📝 {value}</span>
      ) : (
        <span className="text-sm text-gray-600 group-hover/remark:text-gray-400 transition-colors">添加备注…</span>
      )}
    </div>
  )
}

// 标签编辑器组件
function TagEditor({
  tags,
  allSuggestions,
  onChange,
}: {
  tags: string[]
  allSuggestions: { name: string; count: number }[]
  onChange: (newTags: string[]) => void
}) {
  const [input, setInput] = useState('')
  const [showSuggest, setShowSuggest] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = allSuggestions.filter(
    s => !tags.includes(s.name) && s.name.toLowerCase().includes(input.toLowerCase())
  )

  const addTag = (name: string) => {
    const t = name.trim()
    if (t && !tags.includes(t)) {
      onChange([...tags, t])
    }
    setInput('')
    setShowSuggest(false)
    inputRef.current?.focus()
  }

  const removeTag = (name: string) => {
    onChange(tags.filter(t => t !== name))
  }

  // 点击外部时关闭下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggest(false)
      }
    }
    if (showSuggest) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showSuggest])

  // 是否有可以展示的内容（建议列表或创建新标签选项）
  const hasNewTagOption = input.trim() && !tags.includes(input.trim()) && !filtered.some(f => f.name === input.trim())

  return (
    <div className="flex flex-col gap-2" ref={containerRef}>
      {/* 已有标签 */}
      <div className="flex flex-wrap gap-1.5">
        {tags.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/15 text-purple-300 border border-purple-500/25"
          >
            #{tag}
            <button
              onClick={() => removeTag(tag)}
              className="ml-0.5 hover:text-red-400 transition-colors"
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      {/* 输入框 + suggest */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => { setInput(e.target.value); setShowSuggest(true) }}
          onFocus={() => setShowSuggest(true)}
          onKeyDown={e => {
            if (e.key === 'Enter' && input.trim()) {
              e.preventDefault()
              addTag(input)
            }
            if (e.key === 'Backspace' && !input && tags.length > 0) {
              removeTag(tags[tags.length - 1])
            }
            if (e.key === 'Escape') setShowSuggest(false)
          }}
          placeholder={allSuggestions.length > 0 ? `输入或选择已有标签（共${allSuggestions.length}个）...` : '输入标签后回车添加...'}
          className="w-full bg-black/40 border border-white/10 text-gray-200 text-xs rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/30 placeholder:text-gray-600"
        />
        {showSuggest && (
          <div className="absolute bottom-full left-0 right-0 mb-1 bg-dark-800 border border-white/10 rounded-lg shadow-xl max-h-40 overflow-y-auto z-10">
            {hasNewTagOption && (
              <button
                onClick={() => addTag(input)}
                className="w-full text-left px-3 py-2 text-xs text-purple-300 hover:bg-purple-500/10 transition-colors flex items-center gap-2 border-b border-white/5"
              >
                <Plus size={12} /> 创建「{input.trim()}」
              </button>
            )}
            {filtered.length > 0 ? (
              <>
                {!input && (
                  <div className="px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider border-b border-white/5">
                    已有标签（点击选择）
                  </div>
                )}
                {filtered.slice(0, 12).map(s => (
                  <button
                    key={s.name}
                    onClick={() => addTag(s.name)}
                    className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 transition-colors flex items-center justify-between"
                  >
                    <span>#{s.name}</span>
                    <span className="text-gray-600 text-[10px]">{s.count}个素材</span>
                  </button>
                ))}
                {filtered.length > 12 && (
                  <div className="px-3 py-1.5 text-[10px] text-gray-600 text-center">
                    还有 {filtered.length - 12} 个标签，输入关键字筛选...
                  </div>
                )}
              </>
            ) : !hasNewTagOption ? (
              <div className="px-3 py-3 text-xs text-gray-500 text-center">
                {input ? '无匹配标签，回车创建新标签' : '暂无已有标签，输入后回车创建'}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

function ImageThumbnail({ material }: { material: Material }) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    if (!material.oss_key || !material.file_type.startsWith('image/')) {
      setLoading(false)
      return
    }
    
    // 异步获取真实的预览 URL，用于在列表中展示缩略图
    getMaterialPreviewUrl(material.id)
      .then(res => {
        if (isMounted) {
          setUrl(res.url)
          setLoading(false)
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false)
      })
      
    return () => { isMounted = false }
  }, [material.id, material.oss_key, material.file_type])

  if (loading) {
    return <Loader2 size={32} className="animate-spin text-gray-700/50" />
  }

  if (url) {
    return <img src={url} alt={getMaterialDisplayName(material)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
  }

  return <ImageIcon size={48} className="text-gray-700/50 group-hover:scale-110 transition-transform duration-500" strokeWidth={1} />
}

// ==================== 手动打码编辑器（微信笔刷模式） ====================
type BrushPoint = { x: number; y: number }
interface BrushStroke { points: BrushPoint[]; size: number }

function drawStrokeOnCtx(ctx: CanvasRenderingContext2D, stroke: BrushStroke, s: number, ox: number, oy: number) {
  const pts = stroke.points
  if (pts.length === 0) return
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (pts.length === 1) {
    ctx.beginPath()
    ctx.arc(ox + pts[0].x * s, oy + pts[0].y * s, (stroke.size * s) / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  ctx.lineWidth = stroke.size * s
  ctx.beginPath()
  ctx.moveTo(ox + pts[0].x * s, oy + pts[0].y * s)
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(ox + pts[i].x * s, oy + pts[i].y * s)
  }
  ctx.stroke()
}

function ManualMaskEditor({ material, onConfirm, onCancel, showToast }: {
  material: Material
  onConfirm: (newMasked: Material) => void
  onCancel: () => void
  showToast: (msg: string, type: 'success' | 'error') => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const mosaicRef = useRef<HTMLCanvasElement | null>(null)
  const maskBufRef = useRef<HTMLCanvasElement | null>(null)

  const strokesRef = useRef<BrushStroke[]>([])
  const [strokeCount, setStrokeCount] = useState(0)
  const currentStrokeRef = useRef<BrushStroke | null>(null)
  const isDrawingRef = useRef(false)
  const [brushSize, setBrushSize] = useState(30)
  const brushSizeRef = useRef(30)
  const [imgLoaded, setImgLoaded] = useState(false)
  const scaleRef = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })
  const [submitting, setSubmitting] = useState(false)
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null)
  const rafRef = useRef(0)

  useEffect(() => { brushSizeRef.current = brushSize }, [brushSize])

  useEffect(() => {
    let cancelled = false
    getMaterialPreviewUrl(material.id).then(res => {
      if (cancelled) return
      const img = new window.Image()
      img.onload = () => {
        if (cancelled) return
        imgRef.current = img
        setImgLoaded(true)
      }
      img.onerror = () => {
        if (!cancelled) showToast('图片加载失败', 'error')
      }
      img.src = res.url
    }).catch(() => {
      if (!cancelled) showToast('获取预览链接失败', 'error')
    })
    return () => { cancelled = true }
  }, [material.id])

  // 图片加载后预生成马赛克版本（缩小到小画布再放大，产生像素块效果）
  useEffect(() => {
    if (!imgLoaded || !imgRef.current) return
    const img = imgRef.current
    const blockSize = 10
    const sw = Math.ceil(img.naturalWidth / blockSize)
    const sh = Math.ceil(img.naturalHeight / blockSize)
    // 先画到小画布
    const small = document.createElement('canvas')
    small.width = sw
    small.height = sh
    const sctx = small.getContext('2d')
    if (!sctx) return
    sctx.drawImage(img, 0, 0, sw, sh)
    // 再从小画布放大到原尺寸（关闭平滑 → 像素块）
    const mc = document.createElement('canvas')
    mc.width = img.naturalWidth
    mc.height = img.naturalHeight
    const mctx = mc.getContext('2d')
    if (!mctx) return
    mctx.imageSmoothingEnabled = false
    mctx.drawImage(small, 0, 0, mc.width, mc.height)
    mosaicRef.current = mc
  }, [imgLoaded])

  const computeLayout = useCallback(() => {
    if (!imgRef.current || !containerRef.current) return null
    const img = imgRef.current
    const cw = containerRef.current.clientWidth
    const ch = containerRef.current.clientHeight
    if (cw === 0 || ch === 0) return null
    const s = Math.min(cw / img.naturalWidth, ch / img.naturalHeight, 1)
    const dw = img.naturalWidth * s
    const dh = img.naturalHeight * s
    scaleRef.current = s
    offsetRef.current = { x: (cw - dw) / 2, y: (ch - dh) / 2 }
    return { cw, ch, s, dw, dh, ox: offsetRef.current.x, oy: offsetRef.current.y }
  }, [])

  const redraw = useCallback(() => {
    if (!imgRef.current || !canvasRef.current || !containerRef.current) return
    const layout = computeLayout()
    if (!layout) return
    const { cw, ch, s, dw, dh, ox, oy } = layout
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw
      canvas.height = ch
    }

    ctx.clearRect(0, 0, cw, ch)
    ctx.drawImage(imgRef.current, ox, oy, dw, dh)

    // 马赛克合成：先画全部笔刷蒙版，再用 source-in 一次性裁切马赛克图
    const hasStrokes = strokesRef.current.length > 0 || currentStrokeRef.current
    if (hasStrokes && mosaicRef.current) {
      if (!maskBufRef.current) maskBufRef.current = document.createElement('canvas')
      const buf = maskBufRef.current
      if (buf.width !== cw || buf.height !== ch) { buf.width = cw; buf.height = ch }
      const bctx = buf.getContext('2d')
      if (bctx) {
        bctx.clearRect(0, 0, cw, ch)
        // 第一步：把所有笔刷画成白色不透明区域（合并蒙版）
        bctx.globalCompositeOperation = 'source-over'
        bctx.fillStyle = '#fff'
        bctx.strokeStyle = '#fff'
        for (const stroke of strokesRef.current) {
          drawStrokeOnCtx(bctx, stroke, s, ox, oy)
        }
        if (currentStrokeRef.current) {
          drawStrokeOnCtx(bctx, currentStrokeRef.current, s, ox, oy)
        }
        // 第二步：source-in → 只在笔刷区域内绘制马赛克
        bctx.globalCompositeOperation = 'source-in'
        bctx.drawImage(mosaicRef.current, ox, oy, dw, dh)
        // 叠加到主画布
        ctx.drawImage(buf, 0, 0)
      }
    }
  }, [computeLayout])

  useEffect(() => {
    if (imgLoaded) redraw()
  }, [imgLoaded, strokeCount, redraw])

  const toImgCoords = (clientX: number, clientY: number) => {
    if (!canvasRef.current) return null
    const rect = canvasRef.current.getBoundingClientRect()
    const cx = clientX - rect.left
    const cy = clientY - rect.top
    const s = scaleRef.current
    const { x: ox, y: oy } = offsetRef.current
    return { x: (cx - ox) / s, y: (cy - oy) / s }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (submitting) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const pt = toImgCoords(e.clientX, e.clientY)
    if (!pt) return
    currentStrokeRef.current = { points: [pt], size: brushSizeRef.current }
    isDrawingRef.current = true
    redraw()
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (rect) {
      setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
    if (!isDrawingRef.current || !currentStrokeRef.current) return
    const pt = toImgCoords(e.clientX, e.clientY)
    if (!pt) return
    const pts = currentStrokeRef.current.points
    const last = pts[pts.length - 1]
    if (Math.hypot(pt.x - last.x, pt.y - last.y) < 2) return
    pts.push(pt)
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(redraw)
  }

  const handlePointerUp = () => {
    if (!isDrawingRef.current || !currentStrokeRef.current) {
      isDrawingRef.current = false
      return
    }
    strokesRef.current = [...strokesRef.current, currentStrokeRef.current]
    currentStrokeRef.current = null
    isDrawingRef.current = false
    setStrokeCount(c => c + 1)
  }

  const handleUndo = () => {
    strokesRef.current = strokesRef.current.slice(0, -1)
    currentStrokeRef.current = null
    setStrokeCount(c => c + 1)
  }

  const handleClear = () => {
    strokesRef.current = []
    currentStrokeRef.current = null
    setStrokeCount(c => c + 1)
  }

  const handleSubmit = async () => {
    if (strokesRef.current.length === 0) {
      showToast('请用笔刷涂抹需要打码的区域', 'error')
      return
    }
    if (!imgRef.current) return
    setSubmitting(true)
    try {
      const img = imgRef.current
      const maskCanvas = document.createElement('canvas')
      maskCanvas.width = img.naturalWidth
      maskCanvas.height = img.naturalHeight
      const ctx = maskCanvas.getContext('2d')
      if (!ctx) { showToast('生成 mask 失败', 'error'); setSubmitting(false); return }

      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height)
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#fff'
      for (const stroke of strokesRef.current) {
        drawStrokeOnCtx(ctx, stroke, 1, 0, 0)
      }

      const maskBlob = await new Promise<Blob | null>(resolve =>
        maskCanvas.toBlob(b => resolve(b), 'image/png')
      )
      if (!maskBlob) { showToast('生成 mask 失败', 'error'); setSubmitting(false); return }

      const newMasked = await manualMaskMaterial(material.id, maskBlob)
      showToast('手动打码完成', 'success')
      onConfirm(newMasked)
    } catch (err: any) {
      showToast(err?.response?.data?.detail || '打码失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/95 flex flex-col animate-in fade-in duration-200">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-6 py-3 bg-dark-900/90 border-b border-white/10 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-purple-500/10 px-3 py-1.5 rounded-lg border border-purple-500/20">
            <div className="w-4 h-4 rounded-full bg-purple-400/60 border-2 border-purple-400" />
            <span className="text-purple-300 font-medium text-sm">笔刷打码</span>
          </div>
          <span className="text-gray-500 text-xs">用笔刷涂抹需要模糊的区域</span>
        </div>

        <div className="flex items-center gap-3">
          {/* 笔刷大小调节 */}
          <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
            <button
              onClick={() => setBrushSize(s => Math.max(10, s - 5))}
              className="text-gray-400 hover:text-white transition-colors"
            ><Minus size={14} /></button>
            <input
              type="range"
              min={10}
              max={80}
              step={1}
              value={brushSize}
              onChange={e => setBrushSize(Number(e.target.value))}
              className="w-24 h-1 accent-purple-500 cursor-pointer"
            />
            <button
              onClick={() => setBrushSize(s => Math.min(80, s + 5))}
              className="text-gray-400 hover:text-white transition-colors"
            ><Plus size={14} /></button>
            <span className="text-gray-400 text-xs w-8 text-center tabular-nums">{brushSize}</span>
          </div>

          <div className="w-px h-6 bg-white/10" />

          <span className="text-gray-500 text-xs">{strokesRef.current.length} 笔</span>
          <button
            onClick={handleUndo}
            disabled={strokeCount === 0 || submitting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors text-sm disabled:opacity-30"
          >
            <Undo2 size={14} /> 撤销
          </button>
          <button
            onClick={handleClear}
            disabled={strokeCount === 0 || submitting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors text-sm disabled:opacity-30"
          >
            <RotateCcw size={14} /> 清空
          </button>
          <div className="w-px h-6 bg-white/10" />
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors text-sm"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={strokeCount === 0 || submitting}
            className="flex items-center gap-2 px-5 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-purple-500 text-white text-sm font-medium hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-purple-500/20"
          >
            {submitting ? (
              <><Loader2 size={14} className="animate-spin" /> 处理中...</>
            ) : (
              <>确认打码</>
            )}
          </button>
        </div>
      </div>

      {/* Canvas 区域 */}
      <div ref={containerRef} className="flex-1 overflow-hidden relative" style={{ cursor: 'none' }}>
        {!imgLoaded ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 size={40} className="animate-spin text-purple-400" />
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              className="w-full h-full touch-none"
              style={{ cursor: 'none' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={() => { handlePointerUp(); setCursorPos(null) }}
            />
            {cursorPos && (
              <div
                className="pointer-events-none absolute rounded-full border-2 border-purple-400/80 bg-purple-400/15"
                style={{
                  width: brushSize * scaleRef.current,
                  height: brushSize * scaleRef.current,
                  left: cursorPos.x - (brushSize * scaleRef.current) / 2,
                  top: cursorPos.y - (brushSize * scaleRef.current) / 2,
                }}
              />
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

// 通过后端代理下载图片并复制到剪贴板（规避 TOS CORS 限制）
// 在非安全上下文（HTTP）下降级为直接下载图片到本地
async function copyImageToClipboard(materialId: number): Promise<void> {
  // 检查 Clipboard API 是否可用（需要 HTTPS 或 localhost）
  const canUseClipboard = !!(navigator.clipboard?.write) && window.isSecureContext

  const resp = await fetch(`/api/materials/${materialId}/image`)
  if (!resp.ok) throw new Error('下载失败')
  const blob = await resp.blob()

  if (!canUseClipboard) {
    // 降级方案：通过 <a> 标签下载图片（不会被弹窗拦截）
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `image_${materialId}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    throw new Error('HTTP 环境不支持直接复制，已下载图片到本地')
  }

  // 将任意图片格式转换为 PNG Blob（Clipboard API 仅支持 image/png）
  const pngBlob: Blob = await new Promise<Blob>((resolve, reject) => {
    const img = new window.Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        const ctx = c.getContext('2d')
        if (!ctx) { URL.revokeObjectURL(url); reject(new Error('Canvas 不可用')); return }
        ctx.drawImage(img, 0, 0)
        c.toBlob(
          b => { URL.revokeObjectURL(url); b ? resolve(b) : reject(new Error('图片转换失败')) },
          'image/png',
        )
      } catch (e) {
        URL.revokeObjectURL(url)
        reject(e)
      }
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败')) }
    img.src = url
  })

  // 写入剪贴板
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
}

// 聊天素材打码视图
function ChatMaterialView({ materials, onPreview, onRefresh: _onRefresh, onMasked, showToast, editingId, editValue, setEditingId, setEditValue, saveRename }: { materials: Material[], onPreview: (m: Material) => void, onRefresh: () => void, onMasked: (m: Material) => void, showToast: (msg: string, type: 'success' | 'error') => void, editingId: number | null, editValue: string, setEditingId: (id: number | null) => void, setEditValue: (v: string) => void, saveRename: (item: Material) => void }) {
  const [manualMaskItem, setManualMaskItem] = useState<Material | null>(null)
  const [copyingId, setCopyingId] = useState<string | null>(null)
  // 备注编辑状态
  const [editingRemarkId, setEditingRemarkId] = useState<number | null>(null)
  const [remarkValue, setRemarkValue] = useState('')

  // 构建 原图id → 打码图 的映射（同一原图有多个打码版本时取最新的）
  const maskedMap = new Map<number, Material>()
  for (const m of materials) {
    if (m.category === 'masked' && m.source_material_id) {
      const existing = maskedMap.get(m.source_material_id)
      if (!existing || m.id > existing.id) {
        maskedMap.set(m.source_material_id, m)
      }
    }
  }

  const handleCopy = async (e: React.MouseEvent, materialId: number, key: string) => {
    e.stopPropagation()
    setCopyingId(key)
    try {
      await copyImageToClipboard(materialId)
      showToast('已复制到剪贴板', 'success')
    } catch (err: any) {
      const msg = err?.message || '未知错误'
      showToast(`复制失败: ${msg}`, 'error')
      console.error('复制图片失败:', err)
    } finally {
      setCopyingId(null)
    }
  }

  const saveRemark = async (item: Material) => {
    const nextRemark = remarkValue.trim()
    if (nextRemark === (item.remark || '')) {
      setEditingRemarkId(null)
      return
    }
    try {
      await updateMaterial(item.id, { remark: nextRemark || '' })
      showToast('备注已保存', 'success')
      // 更新本地状态 - 通过修改 materials 数组中的对象
      item.remark = nextRemark || null
    } catch (err: any) {
      showToast(`保存失败: ${err?.response?.data?.detail || '请稍后重试'}`, 'error')
    } finally {
      setEditingRemarkId(null)
    }
  }

  // 只展示非 masked 的原始图片
  const displayList = materials.filter(m => m.category !== 'masked')

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* 瀑布流内容 */}
      <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 gap-4 space-y-4">
        {displayList.map(item => {
          const maskedItem = maskedMap.get(item.id)
          const hasMasked = !!maskedItem || item.is_pre_masked
          return (
            <div 
              key={item.id} 
              className="break-inside-avoid relative group rounded-2xl overflow-hidden bg-[#00225a]/20 backdrop-blur-md border border-[#2b4680]/30 transition-all hover:border-accent-primary/50 cursor-pointer shadow-lg" 
              onClick={() => onPreview(item)}
            >
              <div className="relative">
                <div className="w-full relative aspect-[3/4] bg-black/80 flex items-center justify-center overflow-hidden">
                  <ImageThumbnail material={item} />
                </div>
                {hasMasked && (
                  <div className="absolute top-2.5 right-2.5 z-10">
                    <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2.5 py-1 rounded-full border border-emerald-500/30 backdrop-blur-md flex items-center gap-1">
                      <Check size={10} /> 已打码
                    </span>
                  </div>
                )}
                
                {/* 悬浮操作 */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4 gap-2">
                  {/* 复制按钮行 */}
                  <div className="flex gap-2 transform translate-y-4 group-hover:translate-y-0 transition-all duration-200">
                    <button
                      onClick={(e) => handleCopy(e, item.id, `orig-${item.id}`)}
                      disabled={copyingId === `orig-${item.id}`}
                      className="flex-1 bg-white/10 backdrop-blur-sm text-white py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-white/20 active:scale-95 border border-white/10 disabled:opacity-50"
                    >
                      {copyingId === `orig-${item.id}` ? <ClipboardCheck size={13} /> : <Copy size={13} />}
                      复制原图
                    </button>
                    {hasMasked && (
                      <>
                        <button
                          onClick={(e) => handleCopy(e, maskedItem!.id, `mask-${item.id}`)}
                          disabled={copyingId === `mask-${item.id}`}
                          className="flex-1 bg-purple-500/20 backdrop-blur-sm text-purple-200 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-purple-500/30 active:scale-95 border border-purple-500/20 disabled:opacity-50"
                        >
                          {copyingId === `mask-${item.id}` ? <ClipboardCheck size={13} /> : <Copy size={13} />}
                          复制打码图
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onPreview(maskedItem!) }}
                          className="px-3 bg-white/10 backdrop-blur-sm text-white py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-white/20 active:scale-95 border border-white/10"
                          title="查看打码图"
                        >
                          <Eye size={13} />
                        </button>
                      </>
                    )}
                  </div>
                  {/* 打码操作行 */}
                  <div className="flex gap-2 transform translate-y-4 group-hover:translate-y-0 transition-all duration-300">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setManualMaskItem(item) }}
                      className="flex-1 bg-gradient-to-r from-purple-500 to-accent-primary text-white py-2.5 rounded-xl font-bold text-sm shadow-[0_0_20px_rgba(175,92,254,0.3)] flex items-center justify-center gap-2 hover:brightness-110 active:scale-95"
                    >
                      ✏️ 笔刷打码
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-4 flex flex-col gap-1 bg-[#0a1632]/90 border-t border-white/5">
                {editingId === item.id ? (
                  <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveRename(item); if (e.key === 'Escape') setEditingId(null) }}
                      className="bg-black/50 border border-purple-500/50 text-gray-200 text-sm rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-purple-500 flex-1 min-w-0"
                    />
                    <button onClick={() => saveRename(item)} className="p-1 text-green-400 hover:bg-green-400/20 rounded shrink-0">
                      <Check size={14} />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1 text-red-400 hover:bg-red-400/20 rounded shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between group/title">
                    <span className="text-sm font-semibold text-gray-200 truncate flex-1 pr-1" title={getMaterialDisplayName(item)}>{getMaterialDisplayName(item)}</span>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingId(item.id)
                        setEditValue(getMaterialDisplayName(item))
                      }}
                      className="text-gray-500 hover:text-purple-400 opacity-0 group-hover/title:opacity-100 transition-opacity p-1 shrink-0"
                      title="修改名称"
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                )}

                {/* 备注区域 */}
                {editingRemarkId === item.id ? (
                  <div className="flex items-center gap-1.5 mt-0.5" onClick={e => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={remarkValue}
                      onChange={e => setRemarkValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveRemark(item); if (e.key === 'Escape') setEditingRemarkId(null) }}
                      placeholder="输入备注（如：班级群截图）"
                      className="bg-black/50 border border-amber-500/40 text-gray-300 text-[11px] rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-amber-500/50 flex-1 min-w-0 placeholder:text-gray-600"
                    />
                    <button onClick={() => saveRemark(item)} className="p-0.5 text-green-400 hover:bg-green-400/20 rounded shrink-0">
                      <Check size={12} />
                    </button>
                    <button onClick={() => setEditingRemarkId(null)} className="p-0.5 text-red-400 hover:bg-red-400/20 rounded shrink-0">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-1 group/remark cursor-text mt-0.5"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingRemarkId(item.id)
                      setRemarkValue(item.remark || '')
                    }}
                    title="点击编辑备注"
                  >
                    {item.remark ? (
                      <span className="text-[11px] text-amber-400/70 truncate flex-1">📝 {item.remark}</span>
                    ) : (
                      <span className="text-[11px] text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity truncate flex-1">+ 添加备注</span>
                    )}
                    <Pencil size={10} className="text-gray-600 opacity-0 group-hover/remark:opacity-100 transition-opacity shrink-0" />
                  </div>
                )}

                <span className="text-[10px] text-gray-400">{formatFileSize(item.file_size)} • 上传于 {getMaterialUploadTime(item)}</span>
              </div>
            </div>
          )
        })}
      </div>
      
      {displayList.length === 0 && (
        <div className="py-24 flex flex-col items-center justify-center text-gray-500 bg-black/20 rounded-2xl border border-white/5">
          <FolderOpen size={48} className="mb-4 opacity-20" />
          <p className="text-lg text-gray-400 font-medium">暂无素材</p>
          <p className="text-sm mt-2 opacity-60">请先上传图片</p>
        </div>
      )}

      {/* 手动打码编辑器 */}
      {manualMaskItem && (
        <ManualMaskEditor
          material={manualMaskItem}
          onConfirm={(newMasked) => { setManualMaskItem(null); onMasked(newMasked) }}
          onCancel={() => setManualMaskItem(null)}
          showToast={showToast}
        />
      )}
    </div>
  )
}

export default function MaterialView({ onClose }: { onClose: () => void }) {
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tosConfigured, setTosConfigured] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'home' | 'course' | 'report' | 'brand' | 'upload'>('home')
  const [uploading, setUploading] = useState(false)
  const [previewItem, setPreviewItem] = useState<Material | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  
  // 新增：重命名和删除二次确认状态
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [deletingItem, setDeletingItem] = useState<Material | null>(null)

  // 文件夹功能状态（支持嵌套）
  const [folderPath, setFolderPath] = useState<FolderData[]>([])
  const currentFolder = useMemo(() => folderPath.length > 0 ? folderPath[folderPath.length - 1] : null, [folderPath])
  const currentFolderId = currentFolder?.id ?? null
  const [folders, setFolders] = useState<FolderData[]>([]) // 当前层级的文件夹列表
  const [showNewFolderModal, setShowNewFolderModal] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [deletingFolder, setDeletingFolder] = useState<FolderData | null>(null) // 删除文件夹确认
  const [renamingFolderId, setRenamingFolderId] = useState<number | null>(null) // 重命名文件夹
  const [renameFolderValue, setRenameFolderValue] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const dragCounter = useRef(0)
  const [draggingMaterialId, setDraggingMaterialId] = useState<number | null>(null)
  const [dropFolderId, setDropFolderId] = useState<number | null>(null)
  const [dropOnRoot, setDropOnRoot] = useState(false)
  const [movingMaterialId, setMovingMaterialId] = useState<number | null>(null)

  // 标签筛选相关状态
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [allTags, setAllTags] = useState<{ name: string; count: number }[]>([])

  // RAG 导出状态
  const [showRagExport, setShowRagExport] = useState(false)
  const [ragPreview, setRagPreview] = useState<{
    total_materials: number; tagged_materials: number; untagged_materials: number;
    unmasked_materials?: number;
    masked_materials?: number;
    total_tags: number; total_rows: number;
    tag_stats: { tag: string; material_count: number; question_count: number; sample_questions: string[] }[]
  } | null>(null)
  const [ragExporting, setRagExporting] = useState(false)
  const [ragLoading, setRagLoading] = useState(false)
  const [studentOptions, setStudentOptions] = useState<StudentBindingOption[]>([])
  const [studentOptionsLoading, setStudentOptionsLoading] = useState(false)
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [bindingStudent, setBindingStudent] = useState(false)

  const withOriginalExtension = (newName: string, originalFilename: string) => {
    if (newName.includes('.')) return newName
    const dotIndex = originalFilename.lastIndexOf('.')
    if (dotIndex <= 0 || dotIndex === originalFilename.length - 1) return newName
    const ext = originalFilename.slice(dotIndex + 1)
    return `${newName}.${ext}`
  }

  const fetchFolders = useCallback(async (category: string, parentId?: number | null) => {
    try {
      const data = await getFolders(category, parentId)
      setFolders(data)
    } catch {
      setFolders([])
    }
  }, [])

  const navigateToFolder = useCallback((folder: FolderData) => {
    setFolderPath(prev => [...prev, folder])
    const cat = activeTab === 'brand' ? 'brand' : 'report'
    fetchFolders(cat, folder.id)
  }, [activeTab, fetchFolders])

  const navigateToRoot = useCallback(() => {
    setFolderPath([])
    const cat = activeTab === 'brand' ? 'brand' : 'report'
    fetchFolders(cat)
  }, [activeTab, fetchFolders])

  const navigateToBreadcrumb = useCallback((idx: number) => {
    const newPath = folderPath.slice(0, idx + 1)
    setFolderPath(newPath)
    const cat = activeTab === 'brand' ? 'brand' : 'report'
    const parentId = newPath[newPath.length - 1]?.id
    fetchFolders(cat, parentId)
  }, [activeTab, fetchFolders, folderPath])

  const loadStudentOptions = useCallback(async () => {
    setStudentOptionsLoading(true)
    try {
      const res = await getStudents({ page: 1, page_size: 200 })
      const items = Array.isArray(res.items) ? res.items : []
      setStudentOptions(items.map(item => ({ id: item.id, name: item.name })))
    } catch {
      setStudentOptions([])
    } finally {
      setStudentOptionsLoading(false)
    }
  }, [])

  // 从后端拉取素材列表
  const fetchMaterials = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const reqCategory = activeTab === 'home' || activeTab === 'brand' || activeTab === 'upload' ? undefined : activeTab
      // 标签筛选或搜索时不限文件夹（全局查找）；否则按当前文件夹
      const hasGlobalFilter = !!(selectedTag || searchQuery)
      const folderId = !hasGlobalFilter && (activeTab === 'report' || activeTab === 'brand') && currentFolderId ? currentFolderId : undefined
      // 首页需要跨文件夹展示所有素材（文档+喜报）
      const allFolders = activeTab === 'home' || hasGlobalFilter
      const res = await getMaterials({ category: reqCategory, search: searchQuery || undefined, tag: selectedTag || undefined, folder_id: folderId, all_folders: allFolders || undefined, page_size: 200 })
      setMaterials(res.items)
    } catch (err: any) {
      console.error('获取素材列表失败', err)
      setError(err?.response?.data?.detail || '加载失败，请检查后端服务是否启动')
    } finally {
      setLoading(false)
    }
  }, [activeTab, searchQuery, selectedTag, currentFolderId])

  // 拉取标签列表（按当前 Tab 分类筛选）
  const fetchTags = useCallback(async (tab: typeof activeTab) => {
    try {
      // 每个板块只显示自己分类下的标签；首页/上传不限
      const category = (tab === 'report' || tab === 'brand' || tab === 'course') ? tab : undefined
      const data = await getMaterialTags(category)
      setAllTags(data)
    } catch {
      setAllTags([])
    }
  }, [])

  // 初始化 + Tab/搜索变化时重新拉取
  useEffect(() => {
    fetchMaterials()
  }, [fetchMaterials])

  // 切换 Tab 时回到根目录并加载根文件夹
  useEffect(() => {
    setFolderPath([])
    if (activeTab === 'report') {
      fetchFolders('report')
    } else if (activeTab === 'brand') {
      fetchFolders('brand')
    }
  }, [activeTab, fetchFolders])

  // 检查 TOS 配置
  useEffect(() => {
    getMaterialsStatus().then(r => setTosConfigured(r.configured)).catch(() => setTosConfigured(false))
  }, [])

  useEffect(() => {
    setSelectedStudentId('')
    if (previewItem?.category === 'report' && !previewItem.bound_student_id) {
      loadStudentOptions()
    }
  }, [previewItem?.id, previewItem?.category, previewItem?.bound_student_id, loadStudentOptions])

  // 切换 Tab 时重新拉取对应分类的标签 & 清除标签筛选
  useEffect(() => {
    setSelectedTag(null)
    fetchTags(activeTab)
  }, [activeTab, fetchTags])

  // 过滤数据（服务端已按 category 过滤，此处仅做本地搜索兜底）
  const filteredMaterials = materials.filter(item => {
    const matchesSearch = item.filename.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (item.title && item.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
                          item.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
    
    const matchesCategory = activeTab === 'home' || activeTab === 'brand' || activeTab === 'upload' || item.category === activeTab
    
    return matchesSearch && matchesCategory
  })
  const previewNavigation = getMaterialPreviewNavigation(filteredMaterials, previewItem?.id)
  const canUseFolderDragMove = activeTab === 'report' && canDragMaterialMove(searchQuery) && movingMaterialId == null

  const resetFolderDragState = useCallback(() => {
    setDraggingMaterialId(null)
    setDropFolderId(null)
    setDropOnRoot(false)
  }, [])

  const handleMoveMaterialToFolder = useCallback(async (targetFolderId: number | null, folderName?: string) => {
    if (draggingMaterialId == null) return

    const moveTarget = getMoveTarget({
      currentFolderId,
      targetFolderId,
      searchQuery,
    })
    if (!moveTarget) {
      resetFolderDragState()
      return
    }

    setMovingMaterialId(draggingMaterialId)
    try {
      await moveMaterial(draggingMaterialId, moveTarget.folder_id)
      setMaterials(prev => buildMaterialMoveSuccessState(prev, draggingMaterialId).materials)
      await Promise.all([
        fetchMaterials(),
        fetchFolders('report', currentFolder?.id),
      ])
      showToast(folderName ? `已移动到「${folderName}」` : moveTarget.successMessage, 'success')
    } catch (err: any) {
      showToast(getErrorMessage(err, '移动喜报失败'), 'error')
    } finally {
      setMovingMaterialId(null)
      resetFolderDragState()
    }
  }, [currentFolder?.id, currentFolderId, draggingMaterialId, fetchFolders, fetchMaterials, resetFolderDragState, searchQuery, showToast])

  const handleMaterialDragStart = useCallback((event: React.DragEvent, material: Material) => {
    if (!canUseFolderDragMove || material.file_type === 'folder') {
      event.preventDefault()
      return
    }

    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(material.id))
    setDraggingMaterialId(material.id)
  }, [canUseFolderDragMove])

  const handleMaterialDragEnd = useCallback(() => {
    if (movingMaterialId == null) {
      resetFolderDragState()
    }
  }, [movingMaterialId, resetFolderDragState])

  const handleFolderDragOver = useCallback((event: React.DragEvent, folder: FolderData) => {
    if (!canUseFolderDragMove || draggingMaterialId == null) return

    const moveTarget = getMoveTarget({
      currentFolderId,
      targetFolderId: folder.id,
      searchQuery,
    })
    if (!moveTarget) return

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (dropFolderId !== folder.id) {
      setDropFolderId(folder.id)
    }
    if (dropOnRoot) {
      setDropOnRoot(false)
    }
  }, [canUseFolderDragMove, currentFolderId, draggingMaterialId, dropFolderId, dropOnRoot, searchQuery])

  const handleFolderDragLeave = useCallback((event: React.DragEvent, folderId: number) => {
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && event.currentTarget.contains(nextTarget)) {
      return
    }
    if (dropFolderId === folderId) {
      setDropFolderId(null)
    }
  }, [dropFolderId])

  const handleFolderDrop = useCallback(async (event: React.DragEvent, folder: FolderData) => {
    event.preventDefault()
    event.stopPropagation()
    await handleMoveMaterialToFolder(folder.id, folder.name)
  }, [handleMoveMaterialToFolder])

  const handleRootDragOver = useCallback((event: React.DragEvent) => {
    if (!canUseFolderDragMove || draggingMaterialId == null) return

    const moveTarget = getMoveTarget({
      currentFolderId,
      targetFolderId: null,
      searchQuery,
    })
    if (!moveTarget) return

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (!dropOnRoot) {
      setDropOnRoot(true)
    }
    if (dropFolderId != null) {
      setDropFolderId(null)
    }
  }, [canUseFolderDragMove, currentFolderId, draggingMaterialId, dropFolderId, dropOnRoot, searchQuery])

  const handleRootDragLeave = useCallback((event: React.DragEvent) => {
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && event.currentTarget.contains(nextTarget)) {
      return
    }
    if (dropOnRoot) {
      setDropOnRoot(false)
    }
  }, [dropOnRoot])

  const handleRootDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    await handleMoveMaterialToFolder(null)
  }, [handleMoveMaterialToFolder])

  // 获取文件图标 (针对文档视图)
  const getFileIcon = (fileType: string) => {
    if (fileType.includes('pdf')) return <FileText size={24} className="text-red-400" />
    if (fileType.includes('presentation') || fileType.includes('powerpoint')) return <FileType2 size={24} className="text-orange-400" />
    return <File size={24} className="text-gray-400" />
  }

  // 核心上传逻辑（input 和拖拽共用）
  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return
    if (!tosConfigured) {
      showToast('TOS 未配置，无法上传。请联系管理员配置 TOS 环境变量。', 'error')
      return
    }
    setUploading(true)
    let successCount = 0
    try {
      for (const file of files) {
        const isImage = file.type.startsWith('image/')
        const category = activeTab === 'brand' ? 'brand' : (isImage ? 'report' : 'course')
        const uploadFolderId = ((activeTab === 'report' || activeTab === 'brand') && currentFolder) ? currentFolder.id : undefined
        await proxyUploadMaterial(file, category, file.name.replace(/\.[^/.]+$/, ''), uploadFolderId)
        successCount++
      }
      showToast(`成功上传 ${successCount} 个文件`, 'success')
      fetchMaterials()
    } catch (err: any) {
      console.error('上传失败', err)
      const detail = err?.response?.data?.detail || err?.message || '未知错误'
      showToast(`上传失败: ${detail}`, 'error')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // 通过 input 上传
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return
    await uploadFiles(Array.from(e.target.files))
  }

  // 拖拽上传事件
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer.types.includes('Files')) {
      setDragOver(true)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setDragOver(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      await uploadFiles(files)
    }
  }

  // 真实下载处理
  const handleDownload = async (item: Material) => {
    try {
      showToast(`正在获取下载链接: ${getMaterialDisplayName(item)}`, 'info')
      const res = await getMaterialDownloadUrl(item.id)
      window.open(res.url, '_blank')
      // 本地更新下载计数
      setMaterials(prev => prev.map(m =>
        m.id === item.id ? { ...m, download_count: m.download_count + 1 } : m
      ))
    } catch (err: any) {
      showToast(`下载失败: ${err?.response?.data?.detail || '请稍后重试'}`, 'error')
    }
  }

  // 保存重命名
  const saveRename = async (item: Material) => {
    const nextName = editValue.trim()
    const currentDisplayName = getMaterialDisplayName(item)
    if (!nextName || nextName === currentDisplayName) {
      setEditingId(null)
      return
    }
    try {
      const nextFilename = withOriginalExtension(nextName, item.filename)
      await updateMaterial(item.id, { title: nextName, filename: nextFilename })
      showToast('名称修改成功', 'success')
      setMaterials(prev => prev.map(m => m.id === item.id ? { ...m, title: nextName, filename: nextFilename } : m))
      setPreviewItem(prev => prev && prev.id === item.id ? { ...prev, title: nextName, filename: nextFilename } : prev)
    } catch (err: any) {
      showToast(`修改失败: ${err?.response?.data?.detail || '请稍后重试'}`, 'error')
    } finally {
      setEditingId(null)
    }
  }

  // 触发删除操作（弹出确认框）
  const handleDelete = (item: Material) => {
    setDeletingItem(item)
  }

  // 确认删除素材
  const confirmDelete = async () => {
    if (!deletingItem) return
    try {
      await deleteMaterial(deletingItem.id)
      showToast('素材已删除', 'success')
      setMaterials(prev => prev.filter(m => m.id !== deletingItem.id))
      if (previewItem?.id === deletingItem.id) setPreviewItem(null)
    } catch (err: any) {
      showToast(`删除失败: ${err?.response?.data?.detail || '请稍后重试'}`, 'error')
    } finally {
      setDeletingItem(null)
    }
  }

  // 预览素材（获取预览 URL）
  const handlePreview = async (item: Material) => {
    setPreviewItem(item)
    setPreviewUrl(null)
    if (!item.oss_key) return
    setPreviewLoading(true)
    try {
      const res = await getMaterialPreviewUrl(item.id)
      setPreviewUrl(res.url)
    } catch {
      // 预览 URL 获取失败时静默处理，用户仍可下载
    } finally {
      setPreviewLoading(false)
    }
  }

  const syncMaterialState = useCallback((nextMaterial: Material) => {
    setMaterials(prev => prev.map(material => material.id === nextMaterial.id ? nextMaterial : material))
    setPreviewItem(prev => prev && prev.id === nextMaterial.id ? nextMaterial : prev)
  }, [])

  const handleBindStudent = async () => {
    if (!previewItem || previewItem.category !== 'report' || !selectedStudentId) return
    setBindingStudent(true)
    try {
      const updatedStudent = await bindStudentMainReport(Number(selectedStudentId), previewItem.id)
      const nextMaterial: Material = {
        ...previewItem,
        bound_student_id: updatedStudent.id,
        bound_student_name: updatedStudent.name,
      }
      syncMaterialState(nextMaterial)
      setSelectedStudentId('')
      showToast(`已关联学生「${updatedStudent.name}」`, 'success')
    } catch (err: any) {
      showToast(getErrorMessage(err, '关联学生失败'), 'error')
    } finally {
      setBindingStudent(false)
    }
  }

  const handleUnbindStudent = async () => {
    if (!previewItem?.bound_student_id) return
    setBindingStudent(true)
    try {
      await unbindStudentMainReport(previewItem.bound_student_id)
      const nextMaterial: Material = {
        ...previewItem,
        bound_student_id: null,
        bound_student_name: null,
      }
      syncMaterialState(nextMaterial)
      showToast('学生关联已解除', 'success')
      loadStudentOptions()
    } catch (err: any) {
      showToast(getErrorMessage(err, '解除关联失败'), 'error')
    } finally {
      setBindingStudent(false)
    }
  }

  return (
    <div
      className="flex flex-col h-full bg-[#060e20] text-gray-200 overflow-hidden relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 拖拽上传 overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center pointer-events-none animate-in fade-in duration-200">
          <div className="flex flex-col items-center gap-4 p-10 rounded-3xl border-2 border-dashed border-purple-400/60 bg-purple-500/10">
            <div className="w-20 h-20 rounded-full bg-purple-500/20 flex items-center justify-center animate-bounce">
              <Upload size={36} className="text-purple-400" />
            </div>
            <p className="text-xl font-semibold text-white">松开文件即可上传</p>
            <p className="text-sm text-gray-400">支持图片、文档等多种格式</p>
          </div>
        </div>
      )}

      {/* 装饰性背景 */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-accent-primary/5 blur-[120px] rounded-full pointer-events-none z-0" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-500/5 blur-[100px] rounded-full pointer-events-none z-0" />

      {/* Top Header */}
      <header className="flex-shrink-0 z-10 sticky top-0 bg-[#060e20]/90 backdrop-blur-md flex justify-between items-center w-full px-8 py-6">
        <div className="flex flex-col">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-white tracking-tight">素材库</h1>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10 text-gray-400 transition ml-2">
              <X size={20} />
            </button>
          </div>
          <p className="text-gray-400 text-sm mt-1">课程文档、话术脚本、成交海报下载区</p>
        </div>
        
        <div className="flex items-center space-x-6">
          <div className="relative group">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="搜索资源内容..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-black/50 border border-dark-600/50 text-gray-200 text-sm rounded-full pl-11 pr-6 py-2.5 w-[280px] focus:ring-1 focus:ring-accent-primary/50 focus:border-accent-primary/30 outline-none transition-all placeholder:text-gray-600"
            />
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleUpload} 
            className="hidden" 
            multiple 
          />
          {(activeTab === 'report' || activeTab === 'brand') && (
            <button
              onClick={async () => {
                const cat = activeTab === 'brand' ? 'brand' : 'report'
                setShowRagExport(true)
                setRagLoading(true)
                try {
                  const data = await previewMaterialsRag(cat)
                  setRagPreview(data)
                } catch (err: any) {
                  showToast(err?.response?.data?.detail || '预览失败', 'error')
                  setShowRagExport(false)
                } finally {
                  setRagLoading(false)
                }
              }}
              className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 font-medium px-4 py-2.5 rounded-xl text-sm flex items-center space-x-2 hover:bg-emerald-500/25 transition-all active:scale-95"
            >
              <Download size={16} />
              <span>导出RAG知识库</span>
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="bg-gradient-to-r from-accent-primary to-blue-600 text-white font-medium px-5 py-2.5 rounded-xl text-sm flex items-center space-x-2 shadow-lg shadow-accent-primary/20 hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? (
              <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-1" />
            ) : (
              <Upload size={18} />
            )}
            <span>上传到 OSS</span>
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="px-8 flex-shrink-0 z-10 w-full mb-6 relative">
        <div className="flex items-center space-x-8 border-b border-dark-600/50 overflow-x-auto no-scrollbar relative">
          <button 
            onClick={() => setActiveTab('home')}
            className={cn(
              "pb-4 font-medium transition-all text-sm whitespace-nowrap relative",
              activeTab === 'home' ? "text-white" : "text-gray-400 hover:text-gray-200"
            )}
          >
            首页
            {activeTab === 'home' && <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white rounded-t"></div>}
          </button>
          <button 
            onClick={() => setActiveTab('course')}
            className={cn(
              "pb-4 font-medium transition-all text-sm whitespace-nowrap relative",
              activeTab === 'course' ? "text-white" : "text-gray-400 hover:text-gray-200"
            )}
          >
            课程文档
            {activeTab === 'course' && <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white rounded-t"></div>}
          </button>
          <button 
            onClick={() => setActiveTab('report')}
            className={cn(
              "pb-4 font-medium transition-all text-sm whitespace-nowrap relative",
              activeTab === 'report' ? "text-white" : "text-gray-400 hover:text-gray-200"
            )}
          >
            成交喜报
            {activeTab === 'report' && <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white rounded-t"></div>}
          </button>
          <button 
            onClick={() => setActiveTab('brand')}
            className={cn(
              "pb-4 font-medium transition-all text-sm whitespace-nowrap relative",
              activeTab === 'brand' ? "text-white" : "text-gray-400 hover:text-gray-200"
            )}
          >
            聊天素材
            {activeTab === 'brand' && <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white rounded-t"></div>}
          </button>
        </div>
      </div>

      {/* 标签筛选栏 */}
      {allTags.length > 0 && activeTab !== 'home' && (
        <div className="px-8 flex-shrink-0 z-10 mb-4">
          <div className="flex items-center gap-2 overflow-x-auto tag-scrollbar py-1 pb-2">
            <Tag size={14} className="text-gray-500 shrink-0" />
            <button
              onClick={() => setSelectedTag(null)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap border",
                !selectedTag
                  ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                  : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-gray-200"
              )}
            >
              全部
            </button>
            {allTags.map(t => (
              <button
                key={t.name}
                onClick={() => setSelectedTag(selectedTag === t.name ? null : t.name)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap border flex items-center gap-1",
                  selectedTag === t.name
                    ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                    : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-gray-200"
                )}
              >
                #{t.name}
                <span className="text-[10px] opacity-60">({t.count})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-8 pb-12 z-10 no-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full py-20">
            <Loader2 size={40} className="animate-spin text-accent-primary mb-4" />
            <p className="text-gray-400">加载素材中...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full py-20">
            <AlertTriangle size={40} className="text-yellow-500 mb-4" />
            <p className="text-gray-400 text-lg mb-2">加载失败</p>
            <p className="text-gray-500 text-sm mb-4">{error}</p>
            <button onClick={fetchMaterials} className="px-4 py-2 bg-accent-primary/10 text-accent-primary rounded-lg hover:bg-accent-primary/20 transition-colors text-sm">重试</button>
          </div>
        ) : filteredMaterials.length === 0 && activeTab !== 'report' && activeTab !== 'brand' ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 py-20">
            <FolderOpen size={48} className="mb-4 opacity-30" />
            <p className="text-lg text-gray-400">没有找到对应的素材</p>
          </div>
        ) : activeTab === 'home' ? (
          /* Home View */
          <div className="space-y-12 pb-12 animate-in fade-in duration-500">
            {/* 推荐文档 */}
            <section className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center">
                  <FileText className="mr-2 text-white" size={20} />
                  推荐文档
                </h2>
                <button onClick={() => setActiveTab('course')} className="text-gray-400 hover:text-white transition-colors text-sm flex items-center">
                  查看全部 <ChevronRight size={16} />
                </button>
              </div>
              <div className="space-y-3">
                {filteredMaterials.filter(m => m.category === 'course').slice(0, 3).map(item => (
                  <div key={item.id} className="group flex items-center justify-between p-4 bg-[#0a1632]/50 hover:bg-[#0c1a3b] rounded-xl transition-all border border-transparent hover:border-accent-primary/20 cursor-pointer" onClick={() => handlePreview(item)}>
                    <div className="flex items-center space-x-4 flex-1">
                      <div className="w-12 h-12 rounded-xl bg-black/40 flex items-center justify-center flex-shrink-0 border border-white/5">
                        {getFileIcon(item.file_type)}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-gray-200 font-medium tracking-wide group-hover:text-accent-primary transition-colors">{getMaterialDisplayName(item)}</h3>
                        <div className="flex items-center space-x-3 mt-1.5 flex-wrap">
                          <span className="text-xs text-gray-500">{formatFileSize(item.file_size)}</span>
                          {item.tags.map(tag => (
                            <span key={tag} onClick={(e) => { e.stopPropagation(); setSelectedTag(tag) }} className="text-[10px] px-2 py-0.5 bg-accent-primary/10 text-accent-primary border border-accent-primary/20 rounded-full cursor-pointer hover:bg-accent-primary/20 transition-colors">#{tag}</span>
                          ))}
                          <span className="text-xs text-gray-500">上传于 {getMaterialUploadTime(item)}</span>
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDownload(item); }}
                      className="flex items-center justify-center w-10 h-10 rounded-lg text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors border border-transparent hover:border-white/20"
                    >
                      <Download size={16} />
                    </button>
                  </div>
                ))}
                {filteredMaterials.filter(m => m.category === 'course').length === 0 && (
                  <div className="p-8 text-center text-gray-500 bg-black/20 rounded-xl">暂无推荐文档</div>
                )}
              </div>
            </section>

            {/* 最近喜报 */}
            <section className="space-y-4 mt-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center">
                  <ImageIcon className="mr-2 text-purple-400" size={20} />
                  最近喜报
                </h2>
                <button onClick={() => setActiveTab('report')} className="text-gray-400 hover:text-white transition-colors text-sm flex items-center">
                  查看全部 <ChevronRight size={16} />
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredMaterials.filter(m => m.category === 'report').slice(0, 6).map(item => (
                  <div key={item.id} className="bg-[#0a1632]/50 rounded-xl overflow-hidden border border-white/5 group transition-all hover:border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/10 cursor-pointer" onClick={() => handlePreview(item)}>
                    <div className="aspect-[3/4] relative bg-black/60 overflow-hidden flex items-center justify-center">
                      <ImageThumbnail material={item} />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0a1632] via-transparent to-transparent z-10 opacity-80" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20">
                        <button className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white border border-white/20 bg-purple-500">
                          <Eye size={18} />
                        </button>
                      </div>
                    </div>
                    <div className="p-4 flex items-center justify-between relative z-20 bg-[#0a1632]">
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="text-gray-200 text-xs font-medium truncate" title={getMaterialDisplayName(item)}>{getMaterialDisplayName(item)}</p>
                        <p className="text-[10px] text-gray-500 mt-1 truncate">上传于 {getMaterialUploadTime(item)}</p>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); handleDownload(item); }} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all border border-transparent shrink-0">
                        <Download size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {filteredMaterials.filter(m => m.category === 'report').length === 0 && (
                  <div className="col-span-full p-8 text-center text-gray-500 bg-black/20 rounded-xl">暂无最新喜报</div>
                )}
              </div>
            </section>
          </div>
        ) : activeTab === 'course' ? (
          /* Course Documents View - List Layout */
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-white flex items-center">
                <FileText className="mr-2 text-accent-primary" size={20} />
                课程文档
              </h2>
              <span className="text-gray-500 text-sm">共 {filteredMaterials.length} 个文件</span>
            </div>
            
            <div className="space-y-3">
              {filteredMaterials.map(item => (
                <div key={item.id} className="group flex items-center justify-between p-4 bg-[#0a1632]/50 hover:bg-[#0c1a3b] rounded-xl transition-all border border-transparent hover:border-accent-primary/20">
                  <div className="flex items-center space-x-4 cursor-pointer flex-1" onClick={() => handlePreview(item)}>
                    <div className="w-12 h-12 rounded-xl bg-black/40 flex items-center justify-center flex-shrink-0 border border-white/5">
                      {getFileIcon(item.file_type)}
                    </div>
                    <div className="flex-1">
                      {editingId === item.id ? (
                        <div className="flex items-center space-x-2" onClick={e => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveRename(item)
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                            autoFocus
                            className="bg-black/50 border border-accent-primary/50 text-gray-200 text-sm rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-accent-primary w-64"
                          />
                          <button onClick={() => saveRename(item)} className="p-1 text-green-400 hover:bg-green-400/20 rounded">
                            <Check size={16} />
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-1 text-red-400 hover:bg-red-400/20 rounded">
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2 group/title">
                          <h3 className="text-gray-200 font-medium tracking-wide group-hover:text-accent-primary transition-colors">{getMaterialDisplayName(item)}</h3>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingId(item.id)
                              setEditValue(getMaterialDisplayName(item))
                            }}
                            className="text-gray-500 hover:text-accent-primary opacity-0 group-hover/title:opacity-100 transition-opacity p-1"
                            title="修改名称"
                          >
                            <Pencil size={14} />
                          </button>
                        </div>
                      )}
                      <div className="flex items-center space-x-3 mt-1.5 flex-wrap">
                        <span className="text-xs text-gray-500">{formatFileSize(item.file_size)}</span>
                        {item.tags.map(tag => (
                          <span key={tag} onClick={(e) => { e.stopPropagation(); setSelectedTag(tag) }} className="text-[10px] px-2 py-0.5 bg-accent-primary/10 text-accent-primary border border-accent-primary/20 rounded-full cursor-pointer hover:bg-accent-primary/20 transition-colors">
                            #{tag}
                          </span>
                        ))}
                        <span className="text-xs text-gray-500">上传于 {getMaterialUploadTime(item)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handlePreview(item); }}
                      className="flex items-center space-x-2 px-3 py-2 border border-transparent hover:border-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                      title="在线预览"
                    >
                      <Eye size={16} />
                      <span className="text-sm font-medium">预览</span>
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDownload(item); }}
                      className="flex items-center space-x-2 px-4 py-2 rounded-lg text-accent-primary bg-accent-primary/5 hover:bg-accent-primary/10 transition-colors border border-accent-primary/20"
                    >
                      <Download size={16} />
                      <span className="text-sm font-medium">下载</span>
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                      className="flex items-center space-x-2 px-3 py-2 border border-transparent rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="删除素材"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : activeTab === 'report' ? (
          /* Success Posters View - Grid Layout with Folders */
          <div className="space-y-6">
            {/* Header: breadcrumb + actions */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={navigateToRoot}
                  onDragOver={handleRootDragOver}
                  onDragLeave={handleRootDragLeave}
                  onDrop={handleRootDrop}
                  className={cn(
                    "text-sm flex items-center gap-1.5 transition-colors rounded-lg px-2 py-1.5",
                    currentFolder ? "text-gray-400 hover:text-white" : "text-white font-semibold text-lg",
                    dropOnRoot && "bg-purple-500/15 text-white ring-1 ring-purple-400/60",
                  )}
                >
                  <ImageIcon className="text-purple-400" size={currentFolder ? 18 : 20} />
                  成交喜报
                </button>
                {folderPath.map((f, idx) => (
                  <span key={f.id} className="flex items-center gap-1">
                    <ChevronRight size={14} className="text-gray-600" />
                    {idx < folderPath.length - 1 ? (
                      <button onClick={() => navigateToBreadcrumb(idx)} className="text-gray-400 hover:text-white text-sm transition-colors">
                        {f.name}
                      </button>
                    ) : (
                      <span className="text-white font-medium text-sm flex items-center gap-1.5">
                        <Folder size={14} className="text-purple-400" />{f.name}
                      </span>
                    )}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-3">
                {!searchQuery && (
                  <button
                    onClick={() => { setNewFolderName(''); setShowNewFolderModal(true); }}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 transition-colors text-sm border border-purple-500/20 hover:border-purple-500/40"
                  >
                    <FolderPlus size={16} />
                    <span>新建文件夹</span>
                  </button>
                )}
                <span className="text-gray-500 text-sm">共 {filteredMaterials.length} 个文件</span>
              </div>
            </div>

            {/* Folder cards */}
            {!searchQuery && folders.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                {folders.map(folder => (
                  <div
                    key={`folder-${folder.id}`}
                    className={cn(
                      "group relative bg-[#0a1632]/60 rounded-xl p-4 flex flex-col items-center gap-2 border border-white/5 hover:border-purple-500/30 hover:bg-[#0c1a3b] transition-all cursor-pointer",
                      dropFolderId === folder.id && "border-purple-400/70 bg-[#132552] shadow-lg shadow-purple-500/20",
                    )}
                    onClick={() => navigateToFolder(folder)}
                    onDragOver={(event) => handleFolderDragOver(event, folder)}
                    onDragLeave={(event) => handleFolderDragLeave(event, folder.id)}
                    onDrop={(event) => void handleFolderDrop(event, folder)}
                  >
                    {renamingFolderId === folder.id ? (
                      <div className="w-full flex flex-col items-center gap-2" onClick={e => e.stopPropagation()}>
                        <Folder size={32} className="text-purple-400" />
                        <input
                          type="text"
                          value={renameFolderValue}
                          onChange={e => setRenameFolderValue(e.target.value)}
                          onKeyDown={async e => {
                            if (e.key === 'Enter') {
                              const n = renameFolderValue.trim()
                              if (n && n !== folder.name) {
                                try { await renameFolder(folder.id, n); showToast('重命名成功', 'success'); fetchFolders('report', currentFolder?.id) } catch (err: any) { showToast(err?.response?.data?.detail || '重命名失败', 'error') }
                              }
                              setRenamingFolderId(null)
                            }
                            if (e.key === 'Escape') setRenamingFolderId(null)
                          }}
                          autoFocus
                          className="bg-black/80 border border-purple-500/50 text-gray-200 text-xs rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-purple-500 w-full text-center"
                        />
                      </div>
                    ) : (
                      <>
                        <Folder size={32} className="text-purple-400 group-hover:text-purple-300 transition-colors group-hover:scale-110 duration-300" />
                        <span className="text-sm text-gray-300 text-center truncate w-full font-medium" title={folder.name}>{folder.name}</span>
                        <span className="text-[10px] text-gray-500">{folder.file_count} 个文件</span>
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={e => { e.stopPropagation(); setRenamingFolderId(folder.id); setRenameFolderValue(folder.name) }}
                            className="p-1.5 rounded-lg bg-black/60 text-gray-400 hover:text-purple-400 hover:bg-purple-500/20 transition-colors backdrop-blur-sm"
                            title="重命名"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setDeletingFolder(folder) }}
                            className="p-1.5 rounded-lg bg-black/60 text-gray-400 hover:text-red-400 hover:bg-red-500/20 transition-colors backdrop-blur-sm"
                            title="删除文件夹"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* File cards grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filteredMaterials.map(item => (
                <div
                  key={item.id}
                  draggable={canUseFolderDragMove && item.file_type !== 'folder'}
                  onDragStart={(event) => handleMaterialDragStart(event, item)}
                  onDragEnd={handleMaterialDragEnd}
                  className={cn(
                    "bg-[#0a1632]/50 rounded-xl overflow-hidden border border-white/5 group transition-all hover:border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/10 cursor-pointer",
                    draggingMaterialId === item.id && "opacity-50 ring-1 ring-purple-400/50",
                    movingMaterialId === item.id && "pointer-events-none opacity-60",
                  )}
                  onClick={() => handlePreview(item)}
                >
                  <div className="aspect-[3/4] relative bg-black/60 overflow-hidden flex items-center justify-center">
                    <ImageThumbnail material={item} />
                    
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a1632] via-transparent to-transparent z-10 opacity-80" />
                    
                    {/* Hover actions */}
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20">
                      <div className="flex items-center gap-3">
                         <button 
                           onClick={(e) => { e.stopPropagation(); handlePreview(item); }}
                           className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-purple-500 transition-colors border border-white/20 hover:border-purple-400"
                           title="预览大图"
                         >
                           <Eye size={18} />
                         </button>
                         <button 
                           onClick={async (e) => {
                             e.stopPropagation()
                             try {
                               await copyImageToClipboard(item.id)
                               showToast('已复制到剪贴板', 'success')
                             } catch {
                               showToast('复制失败', 'error')
                             }
                           }}
                           className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-purple-500 transition-colors border border-white/20 hover:border-purple-400"
                           title="复制图片"
                         >
                           <Copy size={18} />
                         </button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 flex flex-col justify-between relative z-20 bg-[#0a1632]/80 h-full">
                    <div className="mb-3">
                      {editingId === item.id ? (
                        <div className="flex items-center space-x-1 mb-1" onClick={e => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveRename(item)
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                            autoFocus
                            className="bg-black/80 border border-purple-500/50 text-gray-200 text-xs rounded px-2 py-1 outline-none focus:ring-1 focus:ring-purple-500 w-full min-w-0"
                          />
                          <button onClick={() => saveRename(item)} className="p-1 text-green-400 hover:bg-green-400/20 rounded shrink-0">
                            <Check size={14} />
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-1 text-red-400 hover:bg-red-400/20 rounded shrink-0">
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between group/title mb-1">
                          <p className="text-gray-200 text-sm font-medium truncate group-hover:text-purple-400 transition-colors pr-2 flex-1" title={getMaterialDisplayName(item)}>
                            {getMaterialDisplayName(item)}
                          </p>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingId(item.id)
                              setEditValue(getMaterialDisplayName(item))
                            }}
                            className="text-gray-500 hover:text-purple-400 opacity-0 group-hover/title:opacity-100 transition-opacity p-1 shrink-0 bg-black/40 rounded"
                            title="修改名称"
                          >
                            <Pencil size={12} />
                          </button>
                        </div>
                      )}
                      {/* 备注 */}
                      <div onClick={e => e.stopPropagation()} className="mb-1">
                        <RemarkEditor
                          value={item.remark || ''}
                          onSave={async (newRemark) => {
                            await updateMaterial(item.id, { remark: newRemark })
                            setMaterials(prev => prev.map(m => m.id === item.id ? { ...m, remark: newRemark || null } : m))
                            setPreviewItem(prev => prev && prev.id === item.id ? { ...prev, remark: newRemark || null } : prev)
                            showToast('备注已保存', 'success')
                          }}
                        />
                      </div>
                      {item.bound_student_name ? (
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/20 text-[10px] font-medium mb-1">
                          <Link2 size={11} />
                          {item.bound_student_name}
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-dark-700/70 text-gray-400 border border-dark-500 text-[10px] font-medium mb-1">
                          <Unlink2 size={11} />
                          未关联学生
                        </div>
                      )}
                      <p className="text-gray-500 text-[10px]">上传于 {getMaterialUploadTime(item)}</p>
                    </div>
                    
                    <div className="flex items-center justify-between mt-auto">
                      <span className="text-gray-500 text-xs">{formatFileSize(item.file_size)}</span>
                      <div className="flex space-x-1">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDownload(item); }}
                          className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-purple-400 hover:bg-purple-500 hover:text-white transition-all focus:scale-95 border border-transparent hover:border-purple-400 group/btn"
                          title="下载文件"
                        >
                          <Download size={14} className="group-hover/btn:-translate-y-0.5 transition-transform" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                          className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-500 hover:bg-red-500/20 hover:text-red-400 transition-all focus:scale-95 border border-transparent hover:border-red-500/30"
                          title="删除素材"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Empty state for report tab */}
            {filteredMaterials.length === 0 && (
              <div className="py-16 flex flex-col items-center justify-center text-gray-500 bg-black/20 rounded-2xl border border-white/5">
                <FolderOpen size={48} className="mb-4 opacity-20" />
                {currentFolder ? (
                  <>
                    <p className="text-lg text-gray-400 font-medium">该文件夹内暂无文件</p>
                    <p className="text-sm mt-2 opacity-60">点击右上角「上传到 OSS」按钮添加文件</p>
                  </>
                ) : (
                  <>
                    <p className="text-lg text-gray-400 font-medium">暂无喜报素材</p>
                    <p className="text-sm mt-2 opacity-60">请上传成交喜报图片</p>
                  </>
                )}
              </div>
            )}
          </div>
        ) : activeTab === 'brand' ? (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header: breadcrumb + new folder */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={navigateToRoot}
                  className={cn("text-sm flex items-center gap-1.5 transition-colors", currentFolder ? "text-gray-400 hover:text-white" : "text-white font-semibold")}
                >
                  聊天素材
                </button>
                {folderPath.map((f, idx) => (
                  <span key={f.id} className="flex items-center gap-1">
                    <ChevronRight size={14} className="text-gray-600" />
                    {idx < folderPath.length - 1 ? (
                      <button onClick={() => navigateToBreadcrumb(idx)} className="text-gray-400 hover:text-white text-sm transition-colors">
                        {f.name}
                      </button>
                    ) : (
                      <span className="text-white font-medium text-sm flex items-center gap-1.5">
                        <Folder size={14} className="text-purple-400" />{f.name}
                      </span>
                    )}
                  </span>
                ))}
              </div>
              {!searchQuery && (
                <button onClick={() => { setNewFolderName(''); setShowNewFolderModal(true); }} className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 transition-colors text-sm border border-purple-500/20 hover:border-purple-500/40">
                  <FolderPlus size={16} /><span>新建文件夹</span>
                </button>
              )}
            </div>

            {/* Folder cards */}
            {!searchQuery && folders.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                {folders.map(folder => (
                  <div key={`folder-${folder.id}`} className="group relative bg-[#0a1632]/60 rounded-xl p-4 flex flex-col items-center gap-2 border border-white/5 hover:border-purple-500/30 hover:bg-[#0c1a3b] transition-all cursor-pointer" onClick={() => navigateToFolder(folder)}>
                    {renamingFolderId === folder.id ? (
                      <div className="w-full flex flex-col items-center gap-2" onClick={e => e.stopPropagation()}>
                        <Folder size={32} className="text-purple-400" />
                        <input type="text" value={renameFolderValue} onChange={e => setRenameFolderValue(e.target.value)} onKeyDown={async e => { if (e.key === 'Enter') { const n = renameFolderValue.trim(); if (n && n !== folder.name) { try { await renameFolder(folder.id, n); showToast('重命名成功', 'success'); fetchFolders('brand', currentFolder?.id) } catch (err: any) { showToast(err?.response?.data?.detail || '重命名失败', 'error') } } setRenamingFolderId(null) } if (e.key === 'Escape') setRenamingFolderId(null) }} autoFocus className="bg-black/80 border border-purple-500/50 text-gray-200 text-xs rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-purple-500 w-full text-center" />
                      </div>
                    ) : (
                      <>
                        <Folder size={32} className="text-purple-400 group-hover:text-purple-300 transition-colors group-hover:scale-110 duration-300" />
                        <span className="text-sm text-gray-300 text-center truncate w-full font-medium" title={folder.name}>{folder.name}</span>
                        <span className="text-[10px] text-gray-500">{folder.file_count} 个文件</span>
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={e => { e.stopPropagation(); setRenamingFolderId(folder.id); setRenameFolderValue(folder.name) }} className="p-1.5 rounded-lg bg-black/60 text-gray-400 hover:text-purple-400 hover:bg-purple-500/20 transition-colors backdrop-blur-sm" title="重命名"><Pencil size={12} /></button>
                          <button onClick={e => { e.stopPropagation(); setDeletingFolder(folder) }} className="p-1.5 rounded-lg bg-black/60 text-gray-400 hover:text-red-400 hover:bg-red-500/20 transition-colors backdrop-blur-sm" title="删除文件夹"><Trash2 size={12} /></button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <ChatMaterialView 
              materials={filteredMaterials.filter(m => m.file_type?.startsWith('image/') && m.category !== 'report')} 
              onPreview={handlePreview} 
              onRefresh={fetchMaterials}
              onMasked={(newMasked) => { setMaterials(prev => [...prev, newMasked]); fetchMaterials() }}
              showToast={showToast}
              editingId={editingId}
              editValue={editValue}
              setEditingId={setEditingId}
              setEditValue={setEditValue}
              saveRename={saveRename}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 py-20 animate-in fade-in">
            <FolderOpen size={48} className="mb-4 opacity-30" />
            <p className="text-lg text-gray-400">该分类正在建设中</p>
          </div>
        )}
      </div>
      
      {/* 预览 Modal 弹窗 */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-10" onClick={() => setPreviewItem(null)}>
          <div 
            className="relative bg-dark-900 border border-dark-600 rounded-2xl w-full max-w-5xl h-full flex flex-col shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-600 bg-dark-800">
              <div className="flex items-center gap-3">
                {getFileIcon(previewItem.file_type)}
                <div>
                  <h3 className="text-white font-medium">{getMaterialDisplayName(previewItem)}</h3>
                  <p className="text-gray-500 text-xs mt-0.5">{formatFileSize(previewItem.file_size)} • 上传于 {getMaterialUploadTime(previewItem)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => handleDownload(previewItem)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 transition-colors text-sm"
                >
                  <Download size={16} /> 保存到本地
                </button>
                <button 
                  onClick={() => handleDelete(previewItem)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-sm"
                >
                  <Trash2 size={16} /> 删除
                </button>
                <button onClick={() => setPreviewItem(null)} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors ml-2">
                  <X size={20} />
                </button>
              </div>
            </div>
            
            {/* Modal Content */}
            <div className="relative flex-1 bg-black/50 p-6 flex items-center justify-center overflow-hidden">
              {previewItem.category === 'report' && previewItem.file_type.startsWith('image/') && previewNavigation.previous && (
                <button
                  type="button"
                  onClick={() => void handlePreview(previewNavigation.previous!)}
                  className="absolute left-5 top-1/2 z-10 -translate-y-1/2 w-12 h-16 rounded-2xl border border-white/10 bg-dark-900/80 text-gray-300 hover:text-white hover:border-purple-400/50 hover:bg-purple-500/20 transition-all shadow-xl backdrop-blur"
                  title="上一张"
                  aria-label="上一张喜报"
                >
                  <ChevronLeft size={32} className="mx-auto" />
                </button>
              )}
              {previewItem.category === 'report' && previewItem.file_type.startsWith('image/') && previewNavigation.next && (
                <button
                  type="button"
                  onClick={() => void handlePreview(previewNavigation.next!)}
                  className="absolute right-5 top-1/2 z-10 -translate-y-1/2 w-12 h-16 rounded-2xl border border-white/10 bg-dark-900/80 text-gray-300 hover:text-white hover:border-purple-400/50 hover:bg-purple-500/20 transition-all shadow-xl backdrop-blur"
                  title="下一张"
                  aria-label="下一张喜报"
                >
                  <ChevronRight size={32} className="mx-auto" />
                </button>
              )}
              <div className="w-full h-full flex items-center justify-center overflow-auto">
              {previewLoading ? (
                <div className="flex flex-col items-center">
                  <Loader2 size={40} className="animate-spin text-accent-primary mb-4" />
                  <p className="text-gray-400">加载预览中...</p>
                </div>
              ) : previewItem.file_type.startsWith('image/') ? (
                previewUrl ? (
                  <img src={previewUrl} alt={getMaterialDisplayName(previewItem)} className="max-w-full max-h-full object-contain rounded-lg" />
                ) : (
                  <div className="max-w-full max-h-full flex flex-col items-center">
                    <ImageIcon size={64} className="text-gray-700 mb-4 opacity-50" />
                    <p className="text-gray-400">暂无预览（TOS 未配置或文件无 OSS 关联）</p>
                  </div>
                )
              ) : previewItem.file_type.includes('pdf') ? (
                previewUrl ? (
                  <iframe src={previewUrl} className="w-full h-full rounded-xl border border-dark-600" title={getMaterialDisplayName(previewItem)} />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center border-2 border-dashed border-dark-600 rounded-xl bg-dark-800/50">
                    <FileText size={64} className="text-red-900 mb-4 opacity-50" />
                    <p className="text-gray-400 text-lg">PDF 文档在线预览</p>
                    <p className="text-gray-600 text-sm mt-2">暂无预览（TOS 未配置），请下载到本地查看</p>
                  </div>
                )
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center border-2 border-dashed border-dark-600 rounded-xl bg-dark-800/50">
                  <FileType2 size={64} className="text-orange-900 mb-4 opacity-50" />
                  <p className="text-gray-400 text-lg">系统暂不支持直接预览 PPT/Word</p>
                  <p className="text-gray-600 text-sm mt-2">请点击右上角按钮下载到本地查看</p>
                </div>
              )}
              </div>
            </div>

            {/* 备注编辑区 */}
            {previewItem.category === 'report' && (
              <div className="flex-shrink-0 px-6 py-4 border-t border-dark-600 bg-dark-800/60">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-white">学生关联</p>
                    <p className="text-xs text-gray-500 mt-1">一张喜报只能绑定一个学生。已绑定时不可改绑，需先解除关联。</p>
                  </div>
                  {previewItem.bound_student_name ? (
                    <div className="flex items-center gap-3">
                      <div className="px-3 py-2 rounded-lg bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/20 text-sm">
                        已关联学生：{previewItem.bound_student_name}
                      </div>
                      <button
                        onClick={() => void handleUnbindStudent()}
                        disabled={bindingStudent}
                        className="px-3 py-2 rounded-lg bg-red-500/10 text-red-300 border border-red-500/20 hover:bg-red-500/20 transition-colors text-sm disabled:opacity-40"
                      >
                        <Unlink2 size={14} className="inline mr-1.5" />
                        解除关联
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <select
                        value={selectedStudentId}
                        onChange={(e) => setSelectedStudentId(e.target.value)}
                        disabled={studentOptionsLoading || bindingStudent}
                        className="min-w-[220px] bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-fuchsia-500/40 disabled:opacity-40"
                      >
                        <option value="">{studentOptionsLoading ? '正在加载学生...' : '选择学生后绑定'}</option>
                        {studentOptions.map((option) => (
                          <option key={option.id} value={option.id}>{option.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => void handleBindStudent()}
                        disabled={!selectedStudentId || bindingStudent || studentOptionsLoading}
                        className="px-3 py-2 rounded-lg bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/25 hover:bg-fuchsia-500/25 transition-colors text-sm disabled:opacity-40"
                      >
                        <Link2 size={14} className="inline mr-1.5" />
                        绑定学生
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 备注编辑区 */}
            <div className="flex-shrink-0 px-6 py-2.5 border-t border-dark-600 bg-dark-800/50">
              <RemarkEditor
                value={previewItem.remark || ''}
                onSave={async (newRemark) => {
                  try {
                    await updateMaterial(previewItem.id, { remark: newRemark })
                    setPreviewItem(prev => prev ? { ...prev, remark: newRemark || null } : prev)
                    setMaterials(prev => prev.map(m => m.id === previewItem.id ? { ...m, remark: newRemark || null } : m))
                    showToast('备注已保存', 'success')
                  } catch {
                    showToast('备注保存失败', 'error')
                  }
                }}
              />
            </div>

            {/* 标签编辑区 */}
            <div className="flex-shrink-0 px-6 py-3 border-t border-dark-600 bg-dark-800/50">
              <div className="flex items-center gap-3">
                <Tag size={14} className="text-gray-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <TagEditor
                    tags={previewItem.tags || []}
                    allSuggestions={allTags}
                    onChange={async (newTags) => {
                      try {
                        await updateMaterial(previewItem.id, { tags: newTags })
                        // 更新本地状态
                        setPreviewItem(prev => prev ? { ...prev, tags: newTags } : prev)
                        setMaterials(prev => prev.map(m => m.id === previewItem.id ? { ...m, tags: newTags } : m))
                        // 刷新标签列表
                        fetchTags(activeTab)
                      } catch {
                        showToast('标签更新失败', 'error')
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 删除二次确认 Modal */}
      {deletingItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div 
            className="bg-dark-900 border border-dark-600 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                <Trash2 size={28} />
              </div>
              <h3 className="text-xl font-medium text-white mb-2">确认删除素材？</h3>
              <p className="text-sm text-gray-400 break-all leading-relaxed px-4">
                您将永久删除「<span className="text-gray-200 font-medium">{getMaterialDisplayName(deletingItem)}</span>」。此操作不可恢复，是否继续？
              </p>
            </div>
            <div className="flex border-t border-dark-600/50 bg-dark-800/50">
              <button 
                onClick={() => setDeletingItem(null)}
                className="flex-1 py-4 text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors border-r border-dark-600/50"
              >
                取消
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 py-4 text-sm font-medium text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新建文件夹 Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowNewFolderModal(false)}>
          <div
            className="bg-dark-900 border border-dark-600 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center mx-auto mb-4 border border-purple-500/20">
                <FolderPlus size={24} />
              </div>
              <h3 className="text-lg font-medium text-white text-center mb-4">新建文件夹</h3>
              <input
                type="text"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === 'Enter' && newFolderName.trim() && !creatingFolder) {
                    setCreatingFolder(true)
                    try {
                      await createFolder(newFolderName.trim(), activeTab, currentFolderId)
                      showToast(`文件夹「${newFolderName.trim()}」创建成功`, 'success')
                      fetchFolders(activeTab, currentFolderId ?? undefined)
                      setShowNewFolderModal(false)
                    } catch (err: any) {
                      showToast(err?.response?.data?.detail || '创建失败', 'error')
                    } finally {
                      setCreatingFolder(false)
                    }
                  }
                  if (e.key === 'Escape') setShowNewFolderModal(false)
                }}
                placeholder="请输入文件夹名称"
                autoFocus
                className="w-full bg-black/50 border border-dark-600/50 text-gray-200 text-sm rounded-xl px-4 py-3 outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/30 placeholder:text-gray-600"
              />
            </div>
            <div className="flex border-t border-dark-600/50 bg-dark-800/50">
              <button
                onClick={() => setShowNewFolderModal(false)}
                className="flex-1 py-3.5 text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors border-r border-dark-600/50"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  const name = newFolderName.trim()
                  if (!name || creatingFolder) return
                  setCreatingFolder(true)
                  try {
                    await createFolder(name, activeTab, currentFolderId)
                    showToast(`文件夹「${name}」创建成功`, 'success')
                    fetchFolders(activeTab, currentFolderId ?? undefined)
                    setShowNewFolderModal(false)
                  } catch (err: any) {
                    showToast(err?.response?.data?.detail || '创建失败', 'error')
                  } finally {
                    setCreatingFolder(false)
                  }
                }}
                disabled={!newFolderName.trim()}
                className="flex-1 py-3.5 text-sm font-medium text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                确认创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除文件夹确认 Modal */}
      {deletingFolder && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="bg-dark-900 border border-dark-600 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                <Trash2 size={28} />
              </div>
              <h3 className="text-xl font-medium text-white mb-2">确认删除文件夹？</h3>
              <p className="text-sm text-gray-400 leading-relaxed px-4">
                您将永久删除文件夹「<span className="text-gray-200 font-medium">{deletingFolder.name}</span>」
                {deletingFolder.file_count > 0 && (
                  <span className="text-red-400">及其中的 {deletingFolder.file_count} 个文件</span>
                )}
                。此操作不可恢复。
              </p>
            </div>
            <div className="flex border-t border-dark-600/50 bg-dark-800/50">
              <button
                onClick={() => setDeletingFolder(null)}
                className="flex-1 py-4 text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors border-r border-dark-600/50"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  try {
                    await deleteFolder(deletingFolder.id)
                    showToast(`文件夹「${deletingFolder.name}」已删除`, 'success')
                    if (currentFolder?.id === deletingFolder.id) {
                      const parentPath = folderPath.slice(0, -1)
                      setFolderPath(parentPath)
                      fetchFolders(activeTab, parentPath[parentPath.length - 1]?.id)
                    } else {
                      fetchFolders(activeTab, currentFolderId ?? undefined)
                    }
                  } catch (err: any) {
                    showToast(err?.response?.data?.detail || '删除失败', 'error')
                  } finally {
                    setDeletingFolder(null)
                  }
                }}
                className="flex-1 py-4 text-sm font-medium text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 隐藏滚动条样式 */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        /* 标签栏细滚动条 */
        .tag-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(168, 85, 247, 0.25) transparent;
        }
        .tag-scrollbar:hover {
          scrollbar-color: rgba(168, 85, 247, 0.5) transparent;
        }
        .tag-scrollbar::-webkit-scrollbar {
          height: 4px;
        }
        .tag-scrollbar::-webkit-scrollbar-track {
          background: transparent;
          border-radius: 4px;
        }
        .tag-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(168, 85, 247, 0.25);
          border-radius: 4px;
          transition: background 0.2s;
        }
        .tag-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(168, 85, 247, 0.5);
        }
      `}</style>

      {/* RAG 知识库导出弹窗 */}
      {showRagExport && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => { setShowRagExport(false); setRagPreview(null) }}>
          <div className="bg-[#0d1a35] border border-white/10 rounded-2xl shadow-2xl w-[520px] max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* 头部 */}
            <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                  <Download size={20} className="text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-lg">导出 RAG 知识库</h3>
                  <p className="text-gray-500 text-xs mt-0.5">将{activeTab === 'brand' ? '聊天' : '喜报'}素材按标签导出为火山引擎知识库 CSV</p>
                </div>
              </div>
              <button onClick={() => { setShowRagExport(false); setRagPreview(null) }} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 transition">
                <X size={18} />
              </button>
            </div>

            {/* 内容 */}
            <div className="px-6 py-5 overflow-y-auto max-h-[50vh]">
              {ragLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 size={28} className="animate-spin text-emerald-400" />
                  <p className="text-gray-400 text-sm">正在分析素材标签...</p>
                </div>
              ) : ragPreview ? (
                <div className="space-y-5">
                  {/* 统计卡片 */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white/5 rounded-xl p-3 text-center">
                      <div className="text-2xl font-bold text-white">{ragPreview.total_materials}</div>
                      <div className="text-xs text-gray-500 mt-1">总素材</div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 text-center">
                      <div className="text-2xl font-bold text-emerald-400">{ragPreview.total_tags}</div>
                      <div className="text-xs text-gray-500 mt-1">标签覆盖</div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 text-center">
                      <div className="text-2xl font-bold text-purple-400">{ragPreview.total_rows}</div>
                      <div className="text-xs text-gray-500 mt-1">生成条目</div>
                    </div>
                  </div>

                  {ragPreview.untagged_materials > 0 && (
                    <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                      <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                      <span className="text-xs text-amber-300">{ragPreview.untagged_materials} 个素材未打标签，不会包含在导出中</span>
                    </div>
                  )}

                  {ragPreview.unmasked_materials != null && ragPreview.unmasked_materials > 0 && (
                    <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
                      <AlertTriangle size={14} className="text-blue-400 shrink-0" />
                      <span className="text-xs text-blue-300">
                        已打码 {ragPreview.masked_materials || 0} 个，未打码 {ragPreview.unmasked_materials} 个（未打码素材将使用原图导出）
                      </span>
                    </div>
                  )}

                  {/* 标签列表 */}
                  <div>
                    <h4 className="text-gray-400 text-xs font-medium mb-2 uppercase tracking-wider">标签详情</h4>
                    <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                      {ragPreview.tag_stats.map(ts => (
                        <div key={ts.tag} className="flex items-center justify-between bg-white/[0.03] rounded-lg px-3 py-2 hover:bg-white/[0.06] transition">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/15 text-purple-300 border border-purple-500/20">
                              #{ts.tag}
                            </span>
                            <span className="text-gray-500 text-[10px]">{ts.material_count} 张</span>
                          </div>
                          <span className="text-gray-400 text-[10px] truncate max-w-[180px]" title={ts.sample_questions.join(' / ')}>
                            {ts.sample_questions[0]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* 底部操作 */}
            <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
              <div className="text-xs text-gray-600">
                CSV 格式 · 含图片链接 · 自动上传至 TOS
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setShowRagExport(false); setRagPreview(null) }}
                  className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/10 transition"
                >
                  取消
                </button>
                <button
                  disabled={ragLoading || ragExporting || !ragPreview || ragPreview.total_rows === 0}
                  onClick={async () => {
                    setRagExporting(true)
                    try {
                      const ragCat = activeTab === 'brand' ? 'brand' : 'report'
                      const { blob, tosKey } = await exportMaterialsRag(ragCat, 5)
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `rag_materials_${ragCat}.csv`
                      document.body.appendChild(a)
                      a.click()
                      document.body.removeChild(a)
                      URL.revokeObjectURL(url)
                      if (tosKey) {
                        showToast(`已导出 ${ragPreview?.total_rows} 条并上传到 TOS: ${tosKey}，可在火山知识库「从 TOS 中导入」`, 'success')
                      } else {
                        showToast(`成功导出 ${ragPreview?.total_rows} 条知识库条目`, 'success')
                      }
                      setShowRagExport(false)
                      setRagPreview(null)
                    } catch (err: any) {
                      showToast(err?.response?.data?.detail || '导出失败', 'error')
                    } finally {
                      setRagExporting(false)
                    }
                  }}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-sm font-medium hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
                >
                  {ragExporting ? (
                    <><Loader2 size={14} className="animate-spin" /> 导出中...</>
                  ) : (
                    <><Download size={14} /> 下载 CSV</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
