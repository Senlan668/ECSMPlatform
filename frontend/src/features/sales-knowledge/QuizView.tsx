import { useCallback, useEffect, useState } from 'react'
import { Check, ClipboardCheck, Eye, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import Modal from '../../components/Modal'
import { DependencyNotice } from '../../components/WorkspaceShell'
import { useAuth } from '../../contexts/AuthContext'
import { useBusinessApi } from '../../lib/businessApi'
import { jsonRequest } from '../../lib/http'
import type { QuizAttempt, QuizRecord, RuntimeCapabilities } from './types'
import { ActionMessage, fieldClass, IconAction, InlineEmpty, primaryButtonClass, secondaryButtonClass, SectionHeading, textareaClass } from './ui'

const API = '/api/v1/sales-knowledge'
const CATEGORIES = ['sales', 'objection', 'closing', 'course', 'followup']

export default function QuizView({ capabilities }: { capabilities: RuntimeCapabilities | null }) {
  const request = useBusinessApi()
  const { activeTenant } = useAuth()
  const [quizzes, setQuizzes] = useState<QuizRecord[]>([])
  const [attempts, setAttempts] = useState<QuizAttempt[]>([])
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('sales')
  const [count, setCount] = useState('5')
  const [activeQuiz, setActiveQuiz] = useState<QuizRecord | null>(null)
  const [attemptId, setAttemptId] = useState<number | null>(null)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [reviewTarget, setReviewTarget] = useState<QuizAttempt | null>(null)
  const [humanScore, setHumanScore] = useState('')
  const [humanFeedback, setHumanFeedback] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [quizResult, attemptResult] = await Promise.all([
        request<{ total: number; items: QuizRecord[] }>(`${API}/quiz/list?limit=100`),
        request<{ total: number; items: QuizAttempt[] }>(`${API}/quiz/attempts/list?limit=100`),
      ])
      setQuizzes(quizResult.items)
      setAttempts(attemptResult.items)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '销售测评加载失败')
    } finally {
      setLoading(false)
    }
  }, [request])

  useEffect(() => {
    setQuizzes([])
    setAttempts([])
    void load()
  }, [activeTenant?.id, load])

  async function generateQuiz() {
    const questionCount = Number(count)
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 20) {
      setError('题目数量必须是 1 到 20 的整数')
      return
    }
    setActionLoading(true)
    setError('')
    setSuccess('')
    try {
      const quiz = await request<QuizRecord>(`${API}/quiz/generate`, jsonRequest('POST', { category, count: questionCount, title: title.trim() || null }))
      setTitle('')
      setSuccess(`试卷“${quiz.title}”已生成`)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'AI 出题失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function openQuiz(quiz: QuizRecord) {
    setActionLoading(true)
    setError('')
    try {
      setActiveQuiz(await request<QuizRecord>(`${API}/quiz/${quiz.id}`))
      setAttemptId(null)
      setAnswers({})
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '试卷详情加载失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function startAttempt() {
    if (!activeQuiz) return
    setActionLoading(true)
    setError('')
    try {
      const result = await request<{ attempt_id: number }>(`${API}/quiz/${activeQuiz.id}/start`, jsonRequest('POST'))
      setAttemptId(result.attempt_id)
      setAnswers({})
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '创建作答记录失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function submitAttempt() {
    if (!activeQuiz || !attemptId) return
    const questions = activeQuiz.questions || []
    if (questions.some(question => !answers[question.id]?.trim())) {
      setError('请完成全部题目后再提交')
      return
    }
    setActionLoading(true)
    setError('')
    try {
      await request(`${API}/quiz/attempt/${attemptId}/submit`, jsonRequest('POST', { answers: questions.map(question => ({ question_id: question.id, answer: answers[question.id].trim() })) }))
      setSuccess('答案已提交，可进行 AI 评分或人工复核')
      setActiveQuiz(null)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '答案提交失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function aiGrade(attempt: QuizAttempt) {
    setActionLoading(true)
    setError('')
    try {
      const result = await request<{ ai_total_score: number }>(`${API}/quiz/attempt/${attempt.id}/ai-grade`, jsonRequest('POST'))
      setSuccess(`AI 候选评分 ${result.ai_total_score}，最终成绩仍需人工确认`)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'AI 评分失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function humanReview() {
    if (!reviewTarget) return
    const score = Number(humanScore)
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      setError('人工分数必须在 0 到 100 之间')
      return
    }
    setActionLoading(true)
    setError('')
    try {
      await request(`${API}/quiz/attempt/${reviewTarget.id}/human-review`, jsonRequest('PUT', { human_score: score, human_feedback: humanFeedback.trim() }))
      setReviewTarget(null)
      setHumanScore('')
      setHumanFeedback('')
      setSuccess('人工终审成绩已保存')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '人工复核保存失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function deleteQuiz(quiz: QuizRecord) {
    setActionLoading(true)
    setError('')
    try {
      await request(`${API}/quiz/${quiz.id}`, jsonRequest('DELETE'))
      setSuccess('试卷及其作答记录已删除')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '试卷删除失败')
    } finally {
      setActionLoading(false)
    }
  }

  const llmReady = capabilities?.capabilities.rag_answer === true

  return (
    <div className="space-y-8" data-testid="sales-quiz-view">
      {!llmReady && <DependencyNotice title="LLM 服务未配置" detail="无法生成新试卷或执行 AI 候选评分；已有试卷作答与人工终审仍可使用。" />}
      <ActionMessage loading={actionLoading} error={error} success={success} />

      <section>
        <SectionHeading title="AI 出题" detail="基于租户知识库生成销售场景题。生成内容作为候选试卷，不直接形成最终成绩。" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_160px_120px_auto] lg:items-end"><label className="text-[11px] text-text-tertiary">试卷标题<input className={`${fieldClass} mt-1`} value={title} onChange={event => setTitle(event.target.value)} placeholder="可选" /></label><label className="text-[11px] text-text-tertiary">分类<select className={`${fieldClass} mt-1`} value={category} onChange={event => setCategory(event.target.value)}>{CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label><label className="text-[11px] text-text-tertiary">题目数<input className={`${fieldClass} mt-1`} type="number" min="1" max="20" value={count} onChange={event => setCount(event.target.value)} /></label><button className={primaryButtonClass} disabled={!llmReady || actionLoading} onClick={() => void generateQuiz()}><Sparkles size={14} /> 生成试卷</button></div>
      </section>

      <section>
        <SectionHeading title="试卷库" detail="查看试卷、开始作答或删除试卷。" action={<button className={secondaryButtonClass} onClick={() => void load()}><RefreshCw size={14} /> 刷新</button>} />
        <div className="mt-4 border-y border-border">{loading ? <ActionMessage loading /> : !quizzes.length ? <InlineEmpty>暂无销售试卷</InlineEmpty> : quizzes.map(quiz => <article key={quiz.id} className="grid gap-3 border-b border-border px-3 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto]"><div><div className="flex flex-wrap items-center gap-2"><ClipboardCheck size={14} className="text-text-tertiary" /><span className="text-sm text-text">{quiz.title}</span><span className="text-[11px] text-text-tertiary">{quiz.category} · {quiz.question_count} 题 · {quiz.attempt_count || 0} 次作答</span></div></div><div className="flex items-start gap-1"><IconAction icon={Eye} label="查看并作答" onClick={() => void openQuiz(quiz)} /><IconAction icon={Trash2} label="删除试卷" danger onClick={() => void deleteQuiz(quiz)} /></div></article>)}</div>
      </section>

      <section>
        <SectionHeading title="作答与复核" detail="AI 分数只作参考，人工复核分才是最终业务结果。" />
        <div className="mt-4 border-y border-border">{!attempts.length ? <InlineEmpty>暂无作答记录</InlineEmpty> : attempts.map(attempt => <article key={attempt.id} className="grid gap-3 border-b border-border px-3 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto]"><div><div className="text-sm text-text">{attempt.quiz_title || `试卷 #${attempt.quiz_id}`}</div><div className="mt-1 text-[11px] text-text-tertiary">作答 #{attempt.id} · {attempt.status} · AI {attempt.ai_total_score ?? '-'} · 人工 {attempt.human_score ?? '-'}</div></div><div className="flex flex-wrap gap-2">{attempt.status === 'submitted' && <button className={secondaryButtonClass} disabled={!llmReady} onClick={() => void aiGrade(attempt)}><Sparkles size={14} /> AI 评分</button>}<button className={secondaryButtonClass} onClick={() => { setReviewTarget(attempt); setHumanScore(attempt.human_score?.toString() || ''); setHumanFeedback(attempt.human_feedback || '') }}><Check size={14} /> 人工复核</button></div></article>)}</div>
      </section>

      <Modal open={Boolean(activeQuiz)} onClose={() => setActiveQuiz(null)} title={activeQuiz?.title || '试卷详情'}>{activeQuiz && <div className="space-y-4">{!attemptId ? <><div className="max-h-[520px] space-y-4 overflow-y-auto">{activeQuiz.questions?.map((question, index) => <div key={question.id} className="border-y border-border px-3 py-3"><div className="text-xs text-text">{index + 1}. {question.question}</div><p className="mt-2 text-[11px] leading-5 text-text-tertiary">参考答案：{question.reference_answer}</p></div>)}</div><button className={`${primaryButtonClass} w-full`} onClick={() => void startAttempt()}><Plus size={14} /> 开始作答</button></> : <><div className="max-h-[520px] space-y-4 overflow-y-auto">{activeQuiz.questions?.map((question, index) => <label key={question.id} className="block text-xs text-text-secondary"><span>{index + 1}. {question.question}</span><textarea className={`${textareaClass} mt-2`} value={answers[question.id] || ''} onChange={event => setAnswers(current => ({ ...current, [question.id]: event.target.value }))} /></label>)}</div><button className={`${primaryButtonClass} w-full`} onClick={() => void submitAttempt()}><Check size={14} /> 提交答案</button></>}</div>}</Modal>

      <Modal open={Boolean(reviewTarget)} onClose={() => setReviewTarget(null)} title="人工终审"><div className="space-y-4"><label className="block text-xs text-text-secondary">最终分数<input autoFocus className={`${fieldClass} mt-2`} type="number" min="0" max="100" value={humanScore} onChange={event => setHumanScore(event.target.value)} /></label><label className="block text-xs text-text-secondary">人工评语<textarea className={`${textareaClass} mt-2`} value={humanFeedback} onChange={event => setHumanFeedback(event.target.value)} /></label><button className={`${primaryButtonClass} w-full`} onClick={() => void humanReview()}><Check size={14} /> 保存最终结果</button></div></Modal>
    </div>
  )
}

