import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDueReviews, createReviewSession } from '../lib/api'
import { notifySessionsChanged } from '../lib/events'
import type { SessionSummary } from '../types'
import { Zap } from 'lucide-react'
import VoiceComposer from '../components/VoiceComposer'

export default function BatchReviewPage() {
  const navigate = useNavigate()

  const [queue, setQueue] = useState<SessionSummary[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const current = queue[0]

  const loadQueue = useCallback(() => {
    setLoading(true)
    setError('')
    getDueReviews().then(q => {
      setQueue(q)
    }).catch(() => {
      setQueue([])
      setError('复习队列加载失败，请检查后端服务')
    }).finally(() => {
      setLoading(false)
    })
  }, [])

  useEffect(() => { loadQueue() }, [loadQueue])

  const submit = useCallback(async () => {
    if (!input.trim() || !current || submitting) return
    const text = input; setInput('')
    setSubmitting(true)
    setError('')
    try {
      // 先创建无历史消息的复习会话，再把当前输入作为该会话的第一轮回忆。
      const newSession = await createReviewSession(current.id, text)
      notifySessionsChanged()
      navigate(`/study/review/${newSession.id}`, {
        state: { returnTo: 'review', initialMessage: text },
      })
    } catch {
      setInput(text)
      setError('创建复习会话失败，请稍后重试')
      setSubmitting(false)
    }
  }, [input, current, submitting, navigate])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-text-tertiary text-sm">加载复习队列...</p>
      </div>
    )
  }

  if (queue.length === 0) {
    if (error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <p className="text-sm text-danger mb-4" role="alert">{error}</p>
          <button onClick={loadQueue} className="px-4 py-2 rounded-xl border border-border text-sm text-text-secondary hover:bg-accent/8">重新加载</button>
        </div>
      )
    }
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-accent/6 flex items-center justify-center mb-5">
          <Zap size={26} className="text-accent/40" />
        </div>
        <h2 className="font-display text-xl text-text font-medium mb-2">暂无需要复习的内容</h2>
        <p className="text-sm text-text-secondary mb-6">所有内容都已安排好复习计划，先去学习新知识吧</p>
        <button onClick={() => navigate('/study')}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent-glow transition-all">
          回到首页
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-2xl text-text font-medium tracking-tight">
          {current?.title || '复习'}
        </h1>
      </div>

      <div className="w-full max-w-3xl mx-auto px-6 pb-8">
        <VoiceComposer
          value={input}
          onChange={setInput}
          onSubmit={submit}
          placeholder="请写出你记住的内容..."
          autoFocus
          disabled={submitting}
        />
        {error && <p className="mt-2 text-center text-xs text-danger">{error}</p>}
      </div>
    </div>
  )
}
