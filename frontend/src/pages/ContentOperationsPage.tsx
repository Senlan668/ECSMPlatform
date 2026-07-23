import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { CollectionState, WorkspaceShell, type WorkspaceTab } from '../components/WorkspaceShell'
import { useAuth } from '../contexts/AuthContext'
import { useBusinessApi } from '../lib/businessApi'
import { campaignPath, type RuntimeCapabilities } from '../features/content-campaign/api'
import { ActionState } from '../features/content-campaign/ui'

type ContentTab = 'briefs' | 'calendar' | 'workflow' | 'studio' | 'batch' | 'library' | 'distribution' | 'video' | 'brand'
const tabs: WorkspaceTab<ContentTab>[] = [
  { id: 'briefs', label: '运营简报' },
  { id: 'calendar', label: '运营日历' },
  { id: 'workflow', label: '创作工作流' },
  { id: 'studio', label: '视觉工坊' },
  { id: 'batch', label: '批量海报' },
  { id: 'library', label: '内容资产' },
  { id: 'distribution', label: '分发计划' },
  { id: 'video', label: '视频生产' },
  { id: 'brand', label: '品牌规范' },
]

const WorkflowView = lazy(() => import('../features/content-campaign/WorkflowView'))
const BriefWorkflowView = lazy(() => import('../features/content-campaign/BriefOperationsView').then(module => ({ default: module.BriefWorkflowView })))
const OperationsCalendarView = lazy(() => import('../features/content-campaign/BriefOperationsView').then(module => ({ default: module.OperationsCalendarView })))
const PosterStudioView = lazy(() => import('../features/content-campaign/PosterStudioView'))
const PosterBatchPanel = lazy(() => import('../features/content-campaign/PosterBatchPanel'))
const ContentLibraryView = lazy(() => import('../features/content-campaign/ContentLibraryView'))
const DistributionView = lazy(() => import('../features/content-campaign/DistributionView'))
const VideoProductionView = lazy(() => import('../features/content-campaign/VideoProductionView'))
const BrandView = lazy(() => import('../features/content-campaign/BrandView'))

export default function ContentOperationsPage() {
  const request = useBusinessApi()
  const { activeTenant } = useAuth()
  const [activeTab, setActiveTab] = useState<ContentTab>('briefs')
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities | null>(null)
  const [capabilityError, setCapabilityError] = useState('')

  const loadCapabilities = useCallback(async () => {
    setCapabilityError('')
    try { setCapabilities(await request<RuntimeCapabilities>(campaignPath('/runtime/capabilities'))) }
    catch (reason) { setCapabilities(null); setCapabilityError(reason instanceof Error ? reason.message : '内容运营运行时不可用') }
  }, [request])

  useEffect(() => { setActiveTab('briefs'); void loadCapabilities() }, [activeTenant?.id, loadCapabilities])

  return (
    <WorkspaceShell
      eyebrow="项目五"
      title="内容与营销运营"
      description="统一管理选题写作、人工审核、视觉生产、品牌资产、内容排期、多平台适配与短视频渲染。"
      icon={Sparkles}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {capabilityError ? <div className="mb-5"><ActionState error={capabilityError} /></div> : capabilities && <CapabilityStrip capabilities={capabilities} onRefresh={() => void loadCapabilities()} />}
      <Suspense fallback={<CollectionState loading error="" />}>
        {activeTab === 'briefs' && <BriefWorkflowView />}
        {activeTab === 'calendar' && <OperationsCalendarView />}
        {activeTab === 'workflow' && <WorkflowView />}
        {activeTab === 'studio' && <PosterStudioView />}
        {activeTab === 'batch' && <PosterBatchPanel />}
        {activeTab === 'library' && <ContentLibraryView />}
        {activeTab === 'distribution' && <DistributionView />}
        {activeTab === 'video' && <VideoProductionView />}
        {activeTab === 'brand' && <BrandView />}
      </Suspense>
    </WorkspaceShell>
  )
}

function CapabilityStrip({ capabilities, onRefresh }: { capabilities: RuntimeCapabilities; onRefresh: () => void }) {
  const labels: Array<[keyof RuntimeCapabilities['dependencies'], string]> = [['llm', '文本模型'], ['image', '图片模型'], ['tts', '语音合成'], ['remotion', '视频渲染']]
  return <div className="mb-6 border-y border-border bg-surface px-3 py-3"><div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px]"><span className="text-text-tertiary">租户 SQLite · {capabilities.workflow.checkpoint_backend === 'memory' ? '内存工作流' : capabilities.workflow.checkpoint_backend}</span>{labels.map(([key, label]) => { const ready = ['available', 'configured'].includes(capabilities.dependencies[key]); return <span key={key}><span className="text-text-tertiary">{label}</span><span className={`ml-1.5 ${ready ? 'text-success' : 'text-text-tertiary'}`}>{ready ? '可用' : '未配置'}</span></span> })}<button onClick={onRefresh} className="ml-auto text-text-tertiary hover:text-text">刷新状态</button></div></div>
}
