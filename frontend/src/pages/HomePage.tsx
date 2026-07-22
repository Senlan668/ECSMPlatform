import { useState, useCallback, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createSession, listSessions } from '../lib/api'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import { useFileUpload } from '../hooks/useFileUpload'
import InputWithActions from '../components/InputWithActions'
import Spinner from '../components/Spinner'
import VoiceButton from '../components/VoiceButton'
import Modal from '../components/Modal'
import { SESSIONS_CHANGED_EVENT } from '../lib/events'
import { FileText, X, Paperclip, ArrowRight, Play } from 'lucide-react'
import type { SessionSummary } from '../types'

export default function HomePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const routeState = (location.state || {}) as { draft?: string }
  const [input, setInput] = useState(routeState.draft || '')
  const [conflict, setConflict] = useState<SessionSummary | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // ── 检查进行中的会话 ──
  const checkConflict = useCallback(() => {
    listSessions().then(all => {
      const active = all.filter(s => s.mode !== 'review' && s.status === 'active')
      setConflict(active.length > 0 ? active[0] : null)
    }).catch(() => {})
  }, [])

  useEffect(() => { checkConflict() }, [checkConflict])

  // 监听其他组件的会话变更通知
  useEffect(() => {
    window.addEventListener(SESSIONS_CHANGED_EVENT, checkConflict)
    return () => window.removeEventListener(SESSIONS_CHANGED_EVENT, checkConflict)
  }, [checkConflict])

  const handleSpeechResult = useCallback((text: string) => {
    setInput(prev => prev + text)
  }, [])

  const { listening, start: startVoice, stop: stopVoice } = useSpeechRecognition(handleSpeechResult)

  const handleFileText = useCallback((text: string) => {
    setInput(text)
  }, [])

  const { fileName, parsing, error: fileError, handleFile, clear: clearFile } = useFileUpload({ onText: handleFileText })

  const doStartSession = useCallback(async () => {
    if (!input.trim()) return
    const t = input
    const isFile = !!fileName
    setSubmitting(true)
    setError('')
    try {
      const r = await createSession({
        title: isFile ? fileName : t.slice(0, 40),
        mode: isFile ? 'upload' : 'topic',
        source_material: isFile ? t : '',
        source_type: isFile ? 'text' : 'generated',
        uploaded_file_name: isFile ? fileName : undefined,
        topic_query: isFile ? undefined : t,
      })
      setInput('')
      setConflict(null)
      navigate(`/study/session/${r.id}`, { state: { initialMessage: t } })
    } catch {
      setError('创建学习会话失败，请检查后端服务')
      setSubmitting(false)
    }
  }, [input, fileName, navigate])

  const startSession = useCallback(() => {
    if (!input.trim()) return
    // 有进行中的会话→弹窗
    if (conflict && conflict.status === 'active') {
      return // 弹窗已经显示，由用户选择
    }
    doStartSession()
  }, [input, conflict, doStartSession])

  const now = new Date()
  const h = now.getHours()
  const greeting = h < 6 ? '夜深了' : h < 12 ? '早上好' : h < 18 ? '下午好' : '晚上好'
  const isUpload = !!fileName

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <h2 className="font-display text-2xl text-text font-medium tracking-tight">
          {greeting}，今天学点什么？
        </h2>
      </div>

      <div className="w-full max-w-3xl mx-auto px-6 pb-8">
        {/* 进行中的会话提示 */}
        {conflict && conflict.status === 'active' && (
          <div className="mb-3 flex justify-center">
            <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-surface border border-border/60 rounded-2xl text-sm text-text-secondary">
              <Play size={14} className="text-accent shrink-0" />
              <span className="truncate max-w-[160px]">{conflict.title}</span>
              <span className="text-text-tertiary">进行中</span>
              <button onClick={() => { setConflict(null); navigate(`/study/session/${conflict.id}`) }}
                className="ml-1 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-glow transition-all shrink-0">
                继续 <ArrowRight size={11} />
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {/* File badge */}
          {isUpload && (
            <div className="flex items-center justify-center gap-2 text-xs text-accent">
              <FileText size={12} />
              <span className="truncate max-w-[240px]">{fileName}</span>
              <button onClick={() => { clearFile(); setInput('') }}
                className="text-text-tertiary hover:text-text" aria-label="移除文件"><X size={12} /></button>
            </div>
          )}

          <InputWithActions
            value={input}
            onChange={setInput}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (input.trim()) startSession()
              }
            }}
            placeholder="请输入想学习的内容..."
            multiline
            autoFocus
            disabled={submitting || parsing}
          >
            <label
              className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer text-text-tertiary hover:text-text hover:bg-accent/8 transition-all"
              title="上传文件"
              aria-label="上传文件"
            >
              {isUpload ? <FileText size={16} className="text-accent" /> : <Paperclip size={16} />}
              <input type="file" accept=".txt,.pdf,.md,.csv" onChange={handleFile} className="hidden" />
            </label>
            <VoiceButton listening={listening} onStart={startVoice} onStop={stopVoice} />
          </InputWithActions>

          {parsing && (
            <p className="text-xs text-text-tertiary text-center flex items-center justify-center gap-1.5">
              <Spinner size="sm" />解析文件中...
            </p>
          )}
          {(error || fileError) && (
            <p className="text-xs text-danger text-center" role="alert">{error || fileError}</p>
          )}
        </div>
      </div>

      {/* ── 冲突弹窗 ── */}
      <Modal
        open={!!(conflict && conflict.status === 'active' && input.trim())}
        onClose={() => setConflict(null)}
        title="你有进行中的学习"
      >
        {conflict && (
          <>
            <div className="text-center">
              <Play size={34} className="text-accent mx-auto mb-3" />
              <p className="text-sm text-text-secondary">
                「{conflict.title}」还在进行中。要继续上次的学习，还是开始新的？
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setConflict(null); navigate(`/study/session/${conflict.id}`) }} className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-glow transition-all">继续学习</button>
              <button onClick={doStartSession} disabled={submitting} className="flex-1 py-2.5 rounded-xl border border-border text-sm text-text-secondary hover:bg-accent/8 transition-all disabled:opacity-40">开始新的</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
