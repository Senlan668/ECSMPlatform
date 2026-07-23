import { useState, useEffect, useCallback } from 'react'
import {
  ClipboardList, Plus, Play, Send, Bot, UserCheck, ChevronLeft,
  Trash2, Loader2, CheckCircle2, XCircle, AlertCircle, Trophy,
  ArrowRight,
} from 'lucide-react'
import {
  generateQuiz, getQuizList, getQuiz, deleteQuiz,
  startQuizAttempt, submitQuizAnswers, aiGradeAttempt,
  humanReviewAttempt, getQuizAttempt, getQuizAttempts,
  QuizData, QuizAttemptData,
} from '../api'
import { cn } from '../utils'

interface QuizViewProps {
  onClose?: () => void
}

type Phase = 'list' | 'generating' | 'answering' | 'submitting' | 'ai_grading' | 'review' | 'history'

const CATEGORY_OPTIONS = [
  { value: 'sales', label: '销售话术' },
  { value: 'objection', label: '异议处理' },
  { value: 'closing', label: '成交转化' },
  { value: 'course', label: '课程咨询' },
  { value: 'followup', label: '客户跟进' },
]

const DIFFICULTY_LABELS: Record<string, { text: string; color: string }> = {
  easy: { text: '简单', color: 'text-green-400 bg-green-500/10' },
  medium: { text: '中等', color: 'text-yellow-400 bg-yellow-500/10' },
  hard: { text: '困难', color: 'text-red-400 bg-red-500/10' },
}

export default function QuizView(_props: QuizViewProps) {
  const [phase, setPhase] = useState<Phase>('list')
  const [quizzes, setQuizzes] = useState<QuizData[]>([])
  const [attempts, setAttempts] = useState<QuizAttemptData[]>([])
  const [currentQuiz, setCurrentQuiz] = useState<QuizData | null>(null)
  const [currentAttempt, setCurrentAttempt] = useState<QuizAttemptData | null>(null)
  const [attemptId, setAttemptId] = useState<number | null>(null)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [genCategory, setGenCategory] = useState('sales')
  const [genCount, setGenCount] = useState(10)
  const [humanScore, setHumanScore] = useState<number>(0)
  const [humanFeedback, setHumanFeedback] = useState('')
  const [activeTab, setActiveTab] = useState<'quizzes' | 'history'>('quizzes')

  const loadQuizzes = useCallback(async () => {
    try {
      const res = await getQuizList()
      setQuizzes(res.items)
    } catch { /* ignore */ }
  }, [])

  const loadAttempts = useCallback(async () => {
    try {
      const res = await getQuizAttempts()
      setAttempts(res.items)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    loadQuizzes()
    loadAttempts()
  }, [loadQuizzes, loadAttempts])

  const handleGenerate = async () => {
    setPhase('generating')
    setError('')
    setLoading(true)
    try {
      const res = await generateQuiz({ category: genCategory, count: genCount })
      const quiz = await getQuiz(res.id)
      setCurrentQuiz(quiz)
      await loadQuizzes()
      setPhase('list')
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message || '出题失败')
      setPhase('list')
    } finally {
      setLoading(false)
    }
  }

  const handleStartQuiz = async (quiz: QuizData) => {
    setLoading(true)
    setError('')
    try {
      const fullQuiz = await getQuiz(quiz.id)
      setCurrentQuiz(fullQuiz)
      const res = await startQuizAttempt(quiz.id)
      setAttemptId(res.attempt_id)
      setAnswers({})
      setPhase('answering')
    } catch (e: any) {
      setError(e?.response?.data?.detail || '开始考核失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitAnswers = async () => {
    if (!attemptId || !currentQuiz) return
    const unanswered = currentQuiz.questions.filter(q => !answers[q.id]?.trim())
    if (unanswered.length > 0) {
      setError(`还有 ${unanswered.length} 题未作答`)
      return
    }

    setPhase('submitting')
    setError('')
    setLoading(true)
    try {
      const answerList = currentQuiz.questions.map(q => ({
        question_id: q.id,
        answer: answers[q.id] || '',
      }))
      await submitQuizAnswers(attemptId, answerList)

      setPhase('ai_grading')
      const gradeRes = await aiGradeAttempt(attemptId)
      const attemptData = await getQuizAttempt(attemptId)
      setCurrentAttempt(attemptData)
      setHumanScore(gradeRes.ai_total_score)
      setHumanFeedback('')
      setPhase('review')
    } catch (e: any) {
      setError(e?.response?.data?.detail || '提交失败')
      setPhase('answering')
    } finally {
      setLoading(false)
    }
  }

  const handleHumanReview = async () => {
    if (!currentAttempt) return
    setLoading(true)
    try {
      await humanReviewAttempt(currentAttempt.id, {
        human_score: humanScore,
        human_feedback: humanFeedback,
      })
      const updated = await getQuizAttempt(currentAttempt.id)
      setCurrentAttempt(updated)
      await loadAttempts()
    } catch (e: any) {
      setError(e?.response?.data?.detail || '评测提交失败')
    } finally {
      setLoading(false)
    }
  }

  const handleViewAttempt = async (attempt: QuizAttemptData) => {
    setLoading(true)
    try {
      const full = await getQuizAttempt(attempt.id)
      setCurrentAttempt(full)
      if (full.quiz_id) {
        const quiz = await getQuiz(full.quiz_id)
        setCurrentQuiz(quiz)
      }
      setHumanScore(full.human_score ?? full.ai_total_score ?? 0)
      setHumanFeedback(full.human_feedback ?? '')
      setPhase('review')
    } catch (e: any) {
      setError('加载记录失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteQuiz = async (quizId: number) => {
    if (!confirm('确认删除该试卷及其所有作答记录？')) return
    try {
      await deleteQuiz(quizId)
      await loadQuizzes()
      await loadAttempts()
    } catch { /* ignore */ }
  }

  const handleBack = () => {
    setPhase('list')
    setCurrentQuiz(null)
    setCurrentAttempt(null)
    setAttemptId(null)
    setAnswers({})
    setError('')
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400'
    if (score >= 50) return 'text-yellow-400'
    return 'text-red-400'
  }

  // ========== 出题中 / AI评判中 加载态 ==========
  if (phase === 'generating' || phase === 'ai_grading' || phase === 'submitting') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-dark-900">
        <Loader2 size={48} className="animate-spin text-accent-primary mb-6" />
        <p className="text-lg text-gray-300">
          {phase === 'generating' ? 'AI 正在出题...' : phase === 'submitting' ? '正在提交答案...' : 'AI 正在评判答案...'}
        </p>
        <p className="text-sm text-gray-500 mt-2">请稍候，通常需要 10-30 秒</p>
      </div>
    )
  }

  // ========== 答题页 ==========
  if (phase === 'answering' && currentQuiz) {
    const answeredCount = Object.values(answers).filter(a => a.trim()).length
    const progress = Math.round((answeredCount / currentQuiz.questions.length) * 100)
    return (
      <div className="flex-1 flex flex-col bg-dark-900 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-600">
          <div className="flex items-center gap-3">
            <button onClick={handleBack} className="p-2 rounded-lg hover:bg-dark-700 text-gray-400">
              <ChevronLeft size={20} />
            </button>
            <div>
              <h2 className="text-lg font-bold text-white">{currentQuiz.title}</h2>
              <p className="text-sm text-gray-500">
                已完成 {answeredCount}/{currentQuiz.questions.length} 题
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-32 h-2 bg-dark-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-accent-primary to-accent-secondary rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <button
              onClick={handleSubmitAnswers}
              disabled={loading}
              className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/80 disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
            >
              <Send size={16} /> 提交答案
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Questions */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {currentQuiz.questions.map((q, idx) => {
            const diff = DIFFICULTY_LABELS[q.difficulty] || DIFFICULTY_LABELS.medium
            return (
              <div key={q.id} className="bg-dark-800 rounded-xl border border-dark-600 p-5">
                <div className="flex items-start gap-3 mb-4">
                  <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent-primary/20 text-accent-primary flex items-center justify-center text-sm font-bold">
                    {idx + 1}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full', diff.color)}>
                        {diff.text}
                      </span>
                    </div>
                    <p className="text-gray-200 leading-relaxed">{q.question}</p>
                  </div>
                </div>
                <textarea
                  value={answers[q.id] || ''}
                  onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                  placeholder="请输入你的回复话术..."
                  rows={3}
                  className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-accent-primary/50 resize-none text-sm"
                />
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ========== 评测结果页 ==========
  if (phase === 'review' && currentAttempt) {
    const questions = currentAttempt.questions || currentQuiz?.questions || []
    const answerMap = new Map(
      (currentAttempt.user_answers || []).map(a => [a.question_id, a.answer])
    )
    const evalMap = new Map(
      (currentAttempt.ai_evaluation || []).map(e => [e.question_id, e])
    )
    const isHumanReviewed = currentAttempt.status === 'human_reviewed'

    return (
      <div className="flex-1 flex flex-col bg-dark-900 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-600">
          <div className="flex items-center gap-3">
            <button onClick={handleBack} className="p-2 rounded-lg hover:bg-dark-700 text-gray-400">
              <ChevronLeft size={20} />
            </button>
            <div>
              <h2 className="text-lg font-bold text-white">
                {currentAttempt.quiz_title || '考核结果'}
              </h2>
              <p className="text-sm text-gray-500">
                {isHumanReviewed ? '已完成人工评测' : 'AI 已评判 · 等待人工评测'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Score Summary */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-dark-800 rounded-xl border border-dark-600 p-6 text-center">
              <Bot size={24} className="mx-auto mb-2 text-accent-primary" />
              <p className="text-sm text-gray-500 mb-1">AI 评分</p>
              <p className={cn('text-4xl font-bold', getScoreColor(currentAttempt.ai_total_score ?? 0))}>
                {currentAttempt.ai_total_score ?? '-'}
              </p>
              <p className="text-xs text-gray-600 mt-1">满分 100</p>
            </div>
            <div className="bg-dark-800 rounded-xl border border-dark-600 p-6 text-center">
              <UserCheck size={24} className="mx-auto mb-2 text-yellow-400" />
              <p className="text-sm text-gray-500 mb-1">人工评分</p>
              {isHumanReviewed ? (
                <>
                  <p className={cn('text-4xl font-bold', getScoreColor(currentAttempt.human_score ?? 0))}>
                    {currentAttempt.human_score}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">满分 100</p>
                </>
              ) : (
                <p className="text-2xl text-gray-600 mt-2">待评测</p>
              )}
            </div>
          </div>

          {/* Each question result */}
          {questions.map((q, idx) => {
            const userAns = answerMap.get(q.id) || '(未作答)'
            const ev = evalMap.get(q.id)
            const diff = DIFFICULTY_LABELS[q.difficulty] || DIFFICULTY_LABELS.medium
            return (
              <div key={q.id} className="bg-dark-800 rounded-xl border border-dark-600 p-5">
                <div className="flex items-start gap-3 mb-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent-primary/20 text-accent-primary flex items-center justify-center text-sm font-bold">
                    {idx + 1}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full', diff.color)}>
                        {diff.text}
                      </span>
                      {ev && (
                        <span className={cn(
                          'text-xs px-2 py-0.5 rounded-full',
                          ev.score >= 8 ? 'text-green-400 bg-green-500/10' :
                          ev.score >= 5 ? 'text-yellow-400 bg-yellow-500/10' :
                          'text-red-400 bg-red-500/10'
                        )}>
                          {ev.score}/10 分
                        </span>
                      )}
                    </div>
                    <p className="text-gray-200 leading-relaxed">{q.question}</p>
                  </div>
                </div>

                <div className="ml-11 space-y-3">
                  <div className="bg-dark-700/50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">你的回答</p>
                    <p className="text-gray-300 text-sm whitespace-pre-wrap">{userAns}</p>
                  </div>
                  <div className="bg-accent-primary/5 rounded-lg p-3 border border-accent-primary/10">
                    <p className="text-xs text-accent-primary/70 mb-1">参考答案</p>
                    <p className="text-gray-400 text-sm whitespace-pre-wrap">{q.reference_answer}</p>
                  </div>
                  {ev?.feedback && (
                    <div className={cn(
                      'rounded-lg p-3 border',
                      ev.is_reasonable
                        ? 'bg-green-500/5 border-green-500/10'
                        : 'bg-red-500/5 border-red-500/10'
                    )}>
                      <div className="flex items-center gap-1 mb-1">
                        {ev.is_reasonable
                          ? <CheckCircle2 size={14} className="text-green-400" />
                          : <XCircle size={14} className="text-red-400" />
                        }
                        <p className="text-xs text-gray-500">AI 点评</p>
                      </div>
                      <p className="text-gray-300 text-sm">{ev.feedback}</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* Human Review Form */}
          {!isHumanReviewed && (
            <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                <UserCheck size={18} className="text-yellow-400" />
                人工评测
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">总分 (0-100)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={humanScore}
                    onChange={e => setHumanScore(Number(e.target.value))}
                    className="w-32 bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent-primary/50"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">评语</label>
                  <textarea
                    value={humanFeedback}
                    onChange={e => setHumanFeedback(e.target.value)}
                    placeholder="输入评测意见..."
                    rows={3}
                    className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-accent-primary/50 resize-none text-sm"
                  />
                </div>
                <button
                  onClick={handleHumanReview}
                  disabled={loading}
                  className="px-4 py-2 bg-yellow-500 text-dark-900 rounded-lg hover:bg-yellow-400 disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
                >
                  <Trophy size={16} /> 提交评测结果
                </button>
              </div>
              {error && (
                <p className="text-red-400 text-sm mt-3">{error}</p>
              )}
            </div>
          )}

          {isHumanReviewed && currentAttempt.human_feedback && (
            <div className="bg-dark-800 rounded-xl border border-yellow-500/20 p-6">
              <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
                <Trophy size={18} className="text-yellow-400" />
                人工评语
              </h3>
              <p className="text-gray-300 text-sm whitespace-pre-wrap">{currentAttempt.human_feedback}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ========== 列表主页 ==========
  return (
    <div className="flex-1 flex flex-col bg-dark-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-dark-600">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <ClipboardList size={24} className="text-accent-primary" />
          AI 考核
        </h1>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/80 disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          AI 出题
        </button>
      </div>

      {/* Generate Config */}
      <div className="px-6 py-3 border-b border-dark-700 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">分类:</span>
          <select
            value={genCategory}
            onChange={e => setGenCategory(e.target.value)}
            className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none"
          >
            {CATEGORY_OPTIONS.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">题数:</span>
          <input
            type="number"
            min={1}
            max={20}
            value={genCount}
            onChange={e => setGenCount(Number(e.target.value))}
            className="w-16 bg-dark-700 border border-dark-500 rounded-lg px-2 py-1.5 text-sm text-gray-200 focus:outline-none text-center"
          />
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Tabs */}
      <div className="px-6 pt-4 flex gap-1">
        <button
          onClick={() => setActiveTab('quizzes')}
          className={cn(
            'px-4 py-2 rounded-t-lg text-sm font-medium transition-colors',
            activeTab === 'quizzes'
              ? 'bg-dark-800 text-white border-b-2 border-accent-primary'
              : 'text-gray-500 hover:text-gray-300'
          )}
        >
          试卷列表 ({quizzes.length})
        </button>
        <button
          onClick={() => { setActiveTab('history'); loadAttempts() }}
          className={cn(
            'px-4 py-2 rounded-t-lg text-sm font-medium transition-colors',
            activeTab === 'history'
              ? 'bg-dark-800 text-white border-b-2 border-accent-primary'
              : 'text-gray-500 hover:text-gray-300'
          )}
        >
          作答记录 ({attempts.length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 pt-2">
        {activeTab === 'quizzes' ? (
          quizzes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <ClipboardList size={48} className="mb-4 opacity-30" />
              <p className="text-base mb-2">还没有考核试卷</p>
              <p className="text-sm">点击右上角「AI 出题」生成第一份试卷</p>
            </div>
          ) : (
            <div className="space-y-3">
              {quizzes.map(quiz => (
                <div
                  key={quiz.id}
                  className="bg-dark-800 rounded-xl border border-dark-600 p-4 flex items-center justify-between hover:border-dark-500 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-white font-medium truncate">{quiz.title}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-accent-primary/10 text-accent-primary">
                        {CATEGORY_OPTIONS.find(c => c.value === quiz.category)?.label || quiz.category}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      {quiz.question_count} 题 · {quiz.attempt_count || 0} 次作答 · {quiz.created_at ? new Date(quiz.created_at).toLocaleDateString('zh-CN') : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleStartQuiz(quiz)}
                      className="px-3 py-1.5 bg-accent-primary/20 text-accent-primary rounded-lg hover:bg-accent-primary/30 text-sm flex items-center gap-1"
                    >
                      <Play size={14} /> 开始考核
                    </button>
                    <button
                      onClick={() => handleDeleteQuiz(quiz.id)}
                      className="p-1.5 rounded-lg hover:bg-dark-600 text-gray-500 hover:text-red-400"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          attempts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <Trophy size={48} className="mb-4 opacity-30" />
              <p className="text-base">暂无作答记录</p>
            </div>
          ) : (
            <div className="space-y-3">
              {attempts.map(attempt => {
                const statusLabels: Record<string, { text: string; color: string }> = {
                  answering: { text: '作答中', color: 'text-blue-400 bg-blue-500/10' },
                  submitted: { text: '已提交', color: 'text-yellow-400 bg-yellow-500/10' },
                  ai_graded: { text: 'AI已评判', color: 'text-purple-400 bg-purple-500/10' },
                  human_reviewed: { text: '已评测', color: 'text-green-400 bg-green-500/10' },
                }
                const st = statusLabels[attempt.status] || statusLabels.answering
                return (
                  <div
                    key={attempt.id}
                    onClick={() => handleViewAttempt(attempt)}
                    className="bg-dark-800 rounded-xl border border-dark-600 p-4 flex items-center justify-between hover:border-dark-500 transition-colors cursor-pointer"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-white font-medium truncate">{attempt.quiz_title}</h3>
                        <span className={cn('text-xs px-2 py-0.5 rounded-full', st.color)}>
                          {st.text}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">
                        {attempt.created_at ? new Date(attempt.created_at).toLocaleDateString('zh-CN') : ''}
                        {attempt.ai_total_score != null && ` · AI评分: ${attempt.ai_total_score}`}
                        {attempt.human_score != null && ` · 人工评分: ${attempt.human_score}`}
                      </p>
                    </div>
                    <ArrowRight size={18} className="text-gray-500 ml-3" />
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>
    </div>
  )
}
