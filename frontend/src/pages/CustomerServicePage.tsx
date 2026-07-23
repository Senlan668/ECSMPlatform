import { lazy, Suspense, useMemo, useState } from 'react'
import { Check, Headphones, MessageSquare, Plus, Send, Square, Trash2, UserRoundCheck } from 'lucide-react'
import Modal from '../components/Modal'
import { CollectionState, DependencyNotice, EmptyWorkspace, StatusText, WorkspaceShell, type WorkspaceTab } from '../components/WorkspaceShell'
import { useBusinessCollection } from '../lib/businessApi'
import { jsonRequest } from '../lib/http'
import { formatWorkspaceDate } from '../lib/tenantStorage'

type CustomerTab = 'conversations' | 'knowledge' | 'voice' | 'training'

interface KnowledgeRelease {
  id: string
  name: string
  source: string
  purpose: string
  status: 'draft' | 'published'
  indexStatus: 'not_connected'
  createdAt: string
}

interface ConversationMessage {
  id: string
  role: 'customer' | 'operator' | 'system'
  content: string
  createdAt: string
}

interface ConversationRecord {
  id: string
  customer: string
  status: 'bot' | 'human' | 'closed'
  messages: ConversationMessage[]
  createdAt: string
}

interface AssessmentRecord {
  id: string
  title: string
  releaseId: string
  question: string
  referenceAnswer: string
  answer: string
  status: 'draft' | 'published' | 'submitted' | 'reviewed'
  humanScore?: number
  createdAt: string
}

const tabs: WorkspaceTab<CustomerTab>[] = [
  { id: 'conversations', label: '会话工作台' },
  { id: 'knowledge', label: '销售知识' },
  { id: 'voice', label: '实时语音' },
  { id: 'training', label: '销售训练' },
]

const conversationStatus: Record<ConversationRecord['status'], string> = { bot: '机器人', human: '人工接管', closed: '已结束' }
const assessmentStatus: Record<AssessmentRecord['status'], string> = { draft: '草稿', published: '已发布', submitted: '待复核', reviewed: '已完成' }
const VoiceWorkspace = lazy(() => import('../features/voice/VoiceWorkspace'))
const SalesKnowledgeWorkspace = lazy(() => import('../features/sales-knowledge/SalesKnowledgeWorkspace'))

export default function CustomerServicePage() {
  const [activeTab, setActiveTab] = useState<CustomerTab>('conversations')
  const releaseRecords = useBusinessCollection<KnowledgeRelease>('/api/v1/customer-service/knowledge-releases')
  const conversationRecords = useBusinessCollection<ConversationRecord>('/api/v1/customer-service/conversations')
  const assessmentRecords = useBusinessCollection<AssessmentRecord>('/api/v1/customer-service/assessments')
  const releases = releaseRecords.items
  const conversations = conversationRecords.items
  const assessments = assessmentRecords.items
  const [activeConversationId, setActiveConversationId] = useState('')
  const [customerMessage, setCustomerMessage] = useState('')
  const [operatorMessage, setOperatorMessage] = useState('')
  const [assessmentDialogOpen, setAssessmentDialogOpen] = useState(false)
  const [assessmentTitle, setAssessmentTitle] = useState('')
  const [assessmentReleaseId, setAssessmentReleaseId] = useState('')
  const [assessmentQuestion, setAssessmentQuestion] = useState('')
  const [referenceAnswer, setReferenceAnswer] = useState('')
  const [reviewScores, setReviewScores] = useState<Record<string, string>>({})
  const [actionError, setActionError] = useState('')

  const activeConversation = conversations.find(item => item.id === activeConversationId) || conversations[0]
  const publishedReleases = useMemo(() => releases.filter(release => release.status === 'published'), [releases])

  function replaceConversation(updated: ConversationRecord) {
    conversationRecords.setItems(current => current.map(conversation => conversation.id === updated.id ? updated : conversation))
  }

  async function createConversation() {
    setActionError('')
    try {
      const conversation = await conversationRecords.request<ConversationRecord>('/api/v1/customer-service/conversations', jsonRequest('POST'))
      conversationRecords.setItems(current => [conversation, ...current])
      setActiveConversationId(conversation.id)
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '客服会话创建失败')
    }
  }

  async function appendMessage(role: 'customer' | 'operator', content: string) {
    if (!activeConversation || !content.trim() || activeConversation.status === 'closed') return
    setActionError('')
    try {
      const updated = await conversationRecords.request<ConversationRecord>(`/api/v1/customer-service/conversations/${activeConversation.id}/messages`, jsonRequest('POST', { role, content: content.trim() }))
      replaceConversation(updated)
      if (role === 'customer') setCustomerMessage('')
      else setOperatorMessage('')
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '消息发送失败')
    }
  }

  function appendCustomerMessage() {
    if (!activeConversation || !customerMessage.trim() || activeConversation.status === 'closed') return
    void appendMessage('customer', customerMessage)
  }

  function appendOperatorMessage() {
    if (!activeConversation || !operatorMessage.trim() || activeConversation.status === 'closed') return
    void appendMessage('operator', operatorMessage)
  }

  async function actOnConversation(conversationId: string, action: 'handoff' | 'close') {
    setActionError('')
    try {
      const updated = await conversationRecords.request<ConversationRecord>(`/api/v1/customer-service/conversations/${conversationId}/actions`, jsonRequest('POST', { action }))
      replaceConversation(updated)
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '会话状态更新失败')
    }
  }

  async function createAssessment() {
    if (!assessmentTitle.trim() || !assessmentQuestion.trim() || !referenceAnswer.trim()) return
    setActionError('')
    try {
      const created = await assessmentRecords.request<AssessmentRecord>('/api/v1/customer-service/assessments', jsonRequest('POST', {
        title: assessmentTitle.trim(), releaseId: assessmentReleaseId, question: assessmentQuestion.trim(), referenceAnswer: referenceAnswer.trim(),
      }))
      assessmentRecords.setItems(current => [created, ...current])
      setAssessmentTitle('')
      setAssessmentQuestion('')
      setReferenceAnswer('')
      setAssessmentDialogOpen(false)
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '考核创建失败')
    }
  }

  async function assessmentAction(assessment: AssessmentRecord, action: 'publish' | 'submit' | 'review' | 'delete') {
    const rawScore = reviewScores[assessment.id]
    const score = Number(rawScore)
    if (action === 'review' && (rawScore === undefined || rawScore.trim() === '' || !Number.isFinite(score) || score < 0 || score > 100)) return
    setActionError('')
    try {
      if (action === 'delete') {
        await assessmentRecords.request<void>(`/api/v1/customer-service/assessments/${assessment.id}`, jsonRequest('DELETE'))
        assessmentRecords.setItems(current => current.filter(item => item.id !== assessment.id))
        return
      }
      const body = action === 'submit'
        ? { answer: `演示作答：围绕“${assessment.question}”说明事实、适用条件与限制。` }
        : action === 'review' ? { humanScore: score } : undefined
      const updated = await assessmentRecords.request<AssessmentRecord>(`/api/v1/customer-service/assessments/${assessment.id}/${action}`, jsonRequest('POST', body))
      assessmentRecords.setItems(current => current.map(item => item.id === assessment.id ? updated : item))
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '考核状态更新失败')
    }
  }

  return (
    <WorkspaceShell
      eyebrow="项目六"
      title="智能客服与销售训练"
      description="把聊天证据、知识发布、实时语音、人工接管、工单前置状态和销售考核放进一个受控服务域。模型回答与 AI 评分始终是候选，资源归属和最终业务状态由控制面负责。"
      icon={Headphones}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {actionError && <div className="mb-5"><CollectionState loading={false} error={actionError} /></div>}
      {activeTab === 'conversations' && (
        <section aria-label="客服会话工作台">
          <DependencyNotice title="受控问答未连接" detail="收到客户消息后不会伪造 AI 回答，当前流程会自动转入人工接管。" />
          <div className="mt-6 flex justify-end"><button onClick={createConversation} className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-xs text-page"><Plus size={14} /> 新建会话</button></div>
          <div className="mt-4"><CollectionState loading={conversationRecords.loading} error={conversationRecords.error} /></div>
          {conversationRecords.loading || conversationRecords.error ? null : conversations.length === 0 ? <div className="mt-4"><EmptyWorkspace title="暂无客户会话" detail="新建会话可验证客户消息、依赖降级与人工接管。" /></div> : (
            <div className="mt-4 grid min-h-[430px] border-y border-border md:grid-cols-[240px_minmax(0,1fr)]">
              <div className="border-b border-border md:border-b-0 md:border-r">
                {conversations.map(conversation => (
                  <button key={conversation.id} onClick={() => setActiveConversationId(conversation.id)} className={`w-full border-b border-border px-3 py-3 text-left last:border-b-0 ${activeConversation?.id === conversation.id ? 'bg-surface' : 'hover:bg-surface'}`}>
                    <div className="flex items-center gap-2"><MessageSquare size={13} className="text-text-tertiary" /><span className="min-w-0 flex-1 truncate text-xs text-text">{conversation.customer}</span></div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-text-tertiary"><span>{conversationStatus[conversation.status]}</span><span>{conversation.messages.length} 条</span></div>
                  </button>
                ))}
              </div>
              {activeConversation && (
                <div className="flex min-w-0 flex-col">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3"><div><div className="text-sm text-text">{activeConversation.customer}</div><div className="mt-0.5 text-[10px] text-text-tertiary">{conversationStatus[activeConversation.status]} · {formatWorkspaceDate(activeConversation.createdAt)}</div></div><div className="flex gap-1">{activeConversation.status === 'bot' && <button onClick={() => void actOnConversation(activeConversation.id, 'handoff')} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text" title="人工接管" aria-label="人工接管"><UserRoundCheck size={14} /></button>}{activeConversation.status !== 'closed' && <button onClick={() => void actOnConversation(activeConversation.id, 'close')} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-danger" title="结束会话" aria-label="结束会话"><Square size={13} /></button>}</div></div>
                  <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                    {activeConversation.messages.map(message => <div key={message.id} className={`max-w-[86%] ${message.role === 'customer' ? 'ml-auto text-right' : ''}`}><div className="text-[10px] text-text-tertiary">{message.role === 'customer' ? '客户' : message.role === 'operator' ? '人工客服' : '系统'}</div><div className={`mt-1 inline-block rounded-md px-3 py-2 text-left text-xs leading-5 ${message.role === 'customer' ? 'bg-accent text-page' : message.role === 'operator' ? 'border border-border bg-page text-text' : 'bg-surface text-text-secondary'}`}>{message.content}</div></div>)}
                  </div>
                  {activeConversation.status !== 'closed' && (
                    <div className="border-t border-border px-4 py-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="flex gap-2"><input value={customerMessage} onChange={event => setCustomerMessage(event.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-border bg-page px-3 text-xs outline-none" placeholder="模拟客户消息" aria-label="模拟客户消息" /><button onClick={appendCustomerMessage} disabled={!customerMessage.trim()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-text-secondary disabled:opacity-40" title="发送客户消息" aria-label="发送客户消息"><Send size={14} /></button></div>
                        <div className="flex gap-2"><input value={operatorMessage} onChange={event => setOperatorMessage(event.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-border bg-page px-3 text-xs outline-none" placeholder="人工回复" aria-label="人工回复" /><button onClick={appendOperatorMessage} disabled={!operatorMessage.trim()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-page disabled:opacity-40" title="发送人工回复" aria-label="发送人工回复"><Send size={14} /></button></div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {activeTab === 'knowledge' && (
        <Suspense fallback={<CollectionState loading error="" />}>
          <SalesKnowledgeWorkspace />
        </Suspense>
      )}

      {activeTab === 'voice' && (
        <Suspense fallback={<CollectionState loading error="" />}>
          <VoiceWorkspace />
        </Suspense>
      )}

      {activeTab === 'training' && (
        <section aria-label="销售训练与考核">
          <div className="flex items-start justify-between gap-4"><DependencyNotice title="AI 出题与评分未连接" detail="可使用人工题目验证发布、提交和人工复核；最终分不会由 AI 自动写入。" /><button onClick={() => setAssessmentDialogOpen(true)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-page" title="创建考核" aria-label="创建考核"><Plus size={17} /></button></div>
          <div className="mt-6 border-y border-border">
            <CollectionState loading={assessmentRecords.loading} error={assessmentRecords.error} />
            {assessmentRecords.loading || assessmentRecords.error ? null : assessments.length === 0 ? <EmptyWorkspace title="暂无销售考核" detail="可基于已发布知识建立人工题目和复核流程。" /> : assessments.map(assessment => {
              const release = releases.find(item => item.id === assessment.releaseId)
              return <div key={assessment.id} className="border-b border-border py-4 last:border-b-0"><div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4"><div className="min-w-0"><div className="flex items-center gap-2"><UserRoundCheck size={14} className="text-text-tertiary" /><span className="truncate text-sm text-text">{assessment.title}</span><StatusText tone={assessment.status === 'reviewed' ? 'success' : 'neutral'}>{assessmentStatus[assessment.status]}</StatusText></div><div className="mt-1 text-xs text-text-tertiary">知识版本：{release?.name || '未绑定'} · {formatWorkspaceDate(assessment.createdAt)}</div></div><div className="flex items-center gap-1">{assessment.status === 'draft' && <button onClick={() => void assessmentAction(assessment, 'publish')} className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-text-secondary"><Check size={13} /> 发布</button>}{assessment.status === 'published' && <button onClick={() => void assessmentAction(assessment, 'submit')} className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-text-secondary"><Send size={13} /> 提交演示作答</button>}<button onClick={() => void assessmentAction(assessment, 'delete')} className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-danger" title="删除考核" aria-label={`删除 ${assessment.title}`}><Trash2 size={14} /></button></div></div><div className="mt-4 grid gap-3 bg-surface px-3 py-3 text-xs leading-5 md:grid-cols-2"><div><span className="text-text-tertiary">题目</span><p className="mt-1 text-text-secondary">{assessment.question}</p></div><div><span className="text-text-tertiary">参考答案</span><p className="mt-1 text-text-secondary">{assessment.referenceAnswer}</p></div>{assessment.answer && <div className="md:col-span-2"><span className="text-text-tertiary">学员作答</span><p className="mt-1 text-text-secondary">{assessment.answer}</p></div>}</div>{assessment.status === 'submitted' && <div className="mt-3 flex items-end justify-end gap-2"><label className="text-[11px] text-text-secondary">人工分数<input type="number" min="0" max="100" value={reviewScores[assessment.id] || ''} onChange={event => setReviewScores(current => ({ ...current, [assessment.id]: event.target.value }))} className="ml-2 h-8 w-20 rounded-md border border-border bg-page px-2 text-xs" aria-label={`${assessment.title}人工分数`} /></label><button onClick={() => void assessmentAction(assessment, 'review')} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-xs text-page"><Check size={13} /> 完成复核</button></div>}{assessment.status === 'reviewed' && <div className="mt-3 text-right text-xs text-success">最终人工分：{assessment.humanScore}</div>}</div>
            })}
          </div>
        </section>
      )}

      <Modal open={assessmentDialogOpen} onClose={() => setAssessmentDialogOpen(false)} title="创建人工考核">
        <div className="space-y-4"><label className="block text-xs text-text-secondary">考核名称<input value={assessmentTitle} onChange={event => setAssessmentTitle(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-page px-3 text-sm" autoFocus aria-label="考核名称" /></label><label className="block text-xs text-text-secondary">知识版本<select value={assessmentReleaseId} onChange={event => setAssessmentReleaseId(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-page px-3 text-sm"><option value="">不绑定</option>{publishedReleases.map(release => <option key={release.id} value={release.id}>{release.name}</option>)}</select></label><label className="block text-xs text-text-secondary">题目<textarea value={assessmentQuestion} onChange={event => setAssessmentQuestion(event.target.value)} className="mt-2 min-h-20 w-full resize-none rounded-md border border-border bg-page p-3 text-sm" aria-label="考核题目" /></label><label className="block text-xs text-text-secondary">参考答案<textarea value={referenceAnswer} onChange={event => setReferenceAnswer(event.target.value)} className="mt-2 min-h-20 w-full resize-none rounded-md border border-border bg-page p-3 text-sm" aria-label="参考答案" /></label><button onClick={createAssessment} disabled={!assessmentTitle.trim() || !assessmentQuestion.trim() || !referenceAnswer.trim()} className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent text-sm text-page disabled:opacity-40"><Plus size={15} /> 保存考核</button></div>
      </Modal>
    </WorkspaceShell>
  )
}
