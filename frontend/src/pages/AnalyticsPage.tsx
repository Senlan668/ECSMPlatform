import { useCallback, useEffect, useState } from 'react'
import { BarChart3, RefreshCw } from 'lucide-react'
import { CollectionState, DependencyNotice, StatusText, WorkspaceShell, type WorkspaceTab } from '../components/WorkspaceShell'
import { useBusinessApi } from '../lib/businessApi'

type AnalyticsTab = 'definitions' | 'content' | 'sales' | 'ai'

const tabs: WorkspaceTab<AnalyticsTab>[] = [
  { id: 'definitions', label: '指标口径' },
  { id: 'content', label: '内容效果' },
  { id: 'sales', label: '销售能力' },
  { id: 'ai', label: 'AI 质量与成本' },
]

interface AnalyticsSummary {
  clipTasks: number
  reviewedClips: number
  materials: number
  briefs: number
  approvedBriefs: number
  events: number
  mediaIntents: number
  conversations: number
  humanConversations: number
  publishedReleases: number
  assessments: number
  reviewedAssessments: number
  runningModels: number
  activeKeys: number
  aiTraces: number
  tokenUsage: number
  costMicros: number
  source: string
  calculatedAt: string
}

const emptySummary: AnalyticsSummary = {
  clipTasks: 0, reviewedClips: 0, materials: 0, briefs: 0, approvedBriefs: 0, events: 0,
  mediaIntents: 0, conversations: 0, humanConversations: 0, publishedReleases: 0,
  assessments: 0, reviewedAssessments: 0, runningModels: 0, activeKeys: 0, aiTraces: 0,
  tokenUsage: 0, costMicros: 0, source: 'control-plane-memory', calculatedAt: '',
}

export default function AnalyticsPage() {
  const api = useBusinessApi()
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('definitions')
  const [snapshot, setSnapshot] = useState<AnalyticsSummary>(emptySummary)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setSnapshot(await api<AnalyticsSummary>('/api/v1/analytics/summary'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '统计加载失败')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { void reload() }, [reload])

  const definitions = [
    ['内容版本通过率', '审核通过内容版本 / 已进入审核内容版本', '内容运营控制面'],
    ['切片采用率', '被审核采用的片段 / AI 候选片段', '内容资产控制面'],
    ['知识引用命中率', '带有效证据引用的回答 / 自动回答', '客服 AI Trace'],
    ['人工接管率', '转人工会话 / 全部有效会话', '客服会话'],
    ['考核复核差异', '人工最终分 - AI 建议分的分布', '销售考核'],
    ['单任务 AI 成本', '任务关联模型、Embedding、图像、TTS 的结算成本', 'AI 用量账本'],
  ]

  function MetricRow({ label, value, detail }: { label: string; value: number | string; detail: string }) {
    return <div className="grid grid-cols-[minmax(0,1fr)_80px] items-center gap-4 border-b border-border py-4 last:border-b-0"><div><div className="text-sm text-text">{label}</div><div className="mt-1 text-xs text-text-tertiary">{detail}</div></div><div className="text-right font-display text-2xl text-text">{value}</div></div>
  }

  return (
    <WorkspaceShell
      eyebrow="项目七"
      title="经营分析中心"
      description="经营分析只消费可追溯业务事件和 AI Trace，不反写业务事实。当前页面汇总租户控制面中的真实记录，外部数据仓库与指标计算引擎保持未连接。"
      icon={BarChart3}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      <div className="flex items-start justify-between gap-4">
        <DependencyNotice kind="database" title="Analytics Sink 未连接" detail="当前数字来自租户控制面的内存适配器，不代表线上经营数据仓库。" />
        <button onClick={() => void reload()} className="flex h-9 w-9 shrink-0 items-center justify-center text-text-tertiary hover:text-text" title="刷新控制面统计" aria-label="刷新控制面统计"><RefreshCw size={15} /></button>
      </div>
      <div className="mt-4"><CollectionState loading={loading} error={error} /></div>

      {activeTab === 'definitions' && (
        <section className="mt-6" aria-label="指标口径列表">
          <div className="grid grid-cols-[minmax(0,1fr)_180px] border-b border-border pb-2 text-[10px] font-medium text-text-tertiary"><span>指标与口径</span><span>权威来源</span></div>
          <div className="border-b border-border">
            {definitions.map(([name, formula, source]) => <div key={name} className="grid gap-2 border-b border-border py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_180px]"><div><div className="text-sm text-text">{name}</div><div className="mt-1 text-xs leading-5 text-text-tertiary">{formula}</div></div><div className="text-xs text-text-secondary">{source}<div className="mt-1"><StatusText>等待事件接入</StatusText></div></div></div>)}
          </div>
        </section>
      )}

      {activeTab === 'content' && (
        <section className="mt-6 grid gap-8 lg:grid-cols-2" aria-label="内容效果本地统计">
          <div className="border-y border-border"><MetricRow label="切片任务" value={snapshot.clipTasks} detail={`${snapshot.reviewedClips} 个进入待审核`} /><MetricRow label="销售素材" value={snapshot.materials} detail="已登记的本地素材元数据" /><MetricRow label="运营简报" value={snapshot.briefs} detail={`${snapshot.approvedBriefs} 个内容版本已通过`} /></div>
          <div className="border-y border-border"><MetricRow label="日历事件" value={snapshot.events} detail="已计划的内容运营事件" /><MetricRow label="媒体生成意图" value={snapshot.mediaIntents} detail="Provider 未连接，均未真实执行" /><MetricRow label="渠道效果事件" value={0} detail="渠道连接与发布回执未接入" /></div>
        </section>
      )}

      {activeTab === 'sales' && (
        <section className="mt-6 grid gap-8 lg:grid-cols-2" aria-label="销售能力本地统计">
          <div className="border-y border-border"><MetricRow label="客户会话" value={snapshot.conversations} detail={`${snapshot.humanConversations} 个处于人工接管`} /><MetricRow label="已发布知识版本" value={snapshot.publishedReleases} detail="向量索引均未构建" /></div>
          <div className="border-y border-border"><MetricRow label="销售考核" value={snapshot.assessments} detail={`${snapshot.reviewedAssessments} 个完成人工复核`} /><MetricRow label="AI 与人工评分差异" value="-" detail="AI 评分服务未连接，暂无可比样本" /></div>
        </section>
      )}

      {activeTab === 'ai' && (
        <section className="mt-6 grid gap-8 lg:grid-cols-2" aria-label="AI质量与成本本地统计">
          <div className="border-y border-border"><MetricRow label="运行中模型" value={snapshot.runningModels} detail="当前租户已启用的模型配置" /><MetricRow label="启用 API Key" value={snapshot.activeKeys} detail="控制面服务密钥元数据" /><MetricRow label="AI Trace" value={snapshot.aiTraces} detail="Trace Repository 未接入" /></div>
          <div className="border-y border-border"><MetricRow label="Token 用量" value={snapshot.tokenUsage} detail="模型网关未执行真实调用" /><MetricRow label="结算成本" value={`¥${(snapshot.costMicros / 1_000_000).toFixed(2)}`} detail="预算账本未接入" /><MetricRow label="在线评测样本" value={0} detail="Evaluation Runtime 未接入" /></div>
        </section>
      )}
    </WorkspaceShell>
  )
}
