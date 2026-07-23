import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Archive, ClipboardCheck, Database, Download, GraduationCap, Library, MessageSquareQuote, Sparkles, type LucideIcon } from 'lucide-react'
import { CollectionState } from '../../components/WorkspaceShell'
import { useAuth } from '../../contexts/AuthContext'
import { useBusinessApi } from '../../lib/businessApi'
import type { RuntimeCapabilities } from './types'
import { ActionMessage } from './ui'

type KnowledgeView = 'data' | 'review' | 'knowledge' | 'materials' | 'students' | 'corpus' | 'quiz' | 'export'

interface ViewDefinition {
  id: KnowledgeView
  label: string
  icon: LucideIcon
}

const views: ViewDefinition[] = [
  { id: 'data', label: '数据源', icon: Database },
  { id: 'review', label: '清洗审核', icon: ClipboardCheck },
  { id: 'knowledge', label: '知识问答', icon: MessageSquareQuote },
  { id: 'materials', label: '素材库', icon: Archive },
  { id: 'students', label: '学员档案', icon: GraduationCap },
  { id: 'corpus', label: '训练语料', icon: Library },
  { id: 'quiz', label: '销售测评', icon: Sparkles },
  { id: 'export', label: '数据导出', icon: Download },
]

const DataImportView = lazy(() => import('./DataImportView'))
const ReviewView = lazy(() => import('./ReviewView'))
const KnowledgeWorkspaceView = lazy(() => import('./KnowledgeView'))
const MaterialsView = lazy(() => import('./MaterialsView'))
const StudentsView = lazy(() => import('./StudentsView'))
const CorpusView = lazy(() => import('./CorpusView'))
const QuizView = lazy(() => import('./QuizView'))
const ExportView = lazy(() => import('./ExportView'))

export default function SalesKnowledgeWorkspace() {
  const request = useBusinessApi()
  const { activeTenant } = useAuth()
  const [activeView, setActiveView] = useState<KnowledgeView>('data')
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities | null>(null)
  const [capabilityError, setCapabilityError] = useState('')
  const [capabilityLoading, setCapabilityLoading] = useState(true)

  const loadCapabilities = useCallback(async () => {
    setCapabilityLoading(true)
    setCapabilityError('')
    try {
      setCapabilities(await request<RuntimeCapabilities>('/api/v1/sales-knowledge/runtime/capabilities'))
    } catch (reason) {
      setCapabilities(null)
      setCapabilityError(reason instanceof Error ? reason.message : '销售知识运行时不可用')
    } finally {
      setCapabilityLoading(false)
    }
  }, [request])

  useEffect(() => {
    setActiveView('data')
    void loadCapabilities()
  }, [activeTenant?.id, loadCapabilities])

  return (
    <section aria-label="销售知识工作台" data-testid="sales-knowledge-workspace">
      <div className="border-y border-border bg-surface px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-sm font-medium text-text">销售知识与训练数据</h2><p className="mt-1 text-[11px] leading-5 text-text-tertiary">微信证据进入租户数据域后，依次完成清洗、审核、知识构建、训练与导出。</p></div>
          <button className="text-xs text-text-tertiary hover:text-text" onClick={() => void loadCapabilities()}>刷新能力状态</button>
        </div>
        {capabilityLoading ? <div className="mt-3"><ActionMessage loading /></div> : capabilityError ? <div className="mt-3"><ActionMessage error={capabilityError} /></div> : capabilities && (
          <div className="mt-3 grid gap-x-5 gap-y-2 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
            <div><span className="text-text-tertiary">租户存储</span><span className="ml-2 text-success">SQLite 已隔离</span></div>
            <div><span className="text-text-tertiary">数据清洗</span><span className="ml-2 text-success">可用</span></div>
            <div><span className="text-text-tertiary">Embedding / LLM</span><span className={`ml-2 ${capabilities.capabilities.rag_search && capabilities.capabilities.rag_answer ? 'text-success' : 'text-text-tertiary'}`}>{capabilities.capabilities.rag_search && capabilities.capabilities.rag_answer ? '可用' : '未完整配置'}</span></div>
            <div><span className="text-text-tertiary">对象存储 / 视觉</span><span className={`ml-2 ${capabilities.capabilities.object_storage && capabilities.capabilities.vision_import ? 'text-success' : 'text-text-tertiary'}`}>{capabilities.capabilities.object_storage && capabilities.capabilities.vision_import ? '可用' : '未完整配置'}</span></div>
          </div>
        )}
      </div>

      <div className="mt-5 flex gap-5 overflow-x-auto border-b border-border" role="tablist" aria-label="销售知识功能">
        {views.map(view => {
          const Icon = view.icon
          return <button key={view.id} role="tab" aria-selected={activeView === view.id} onClick={() => setActiveView(view.id)} className={`flex shrink-0 items-center gap-1.5 px-1 pb-3 text-xs ${activeView === view.id ? 'border-b-2 border-text text-text' : 'text-text-tertiary hover:text-text'}`}><Icon size={13} /> {view.label}</button>
        })}
      </div>

      <div className="mt-6">
        <Suspense fallback={<CollectionState loading error="" />}>
          {activeView === 'data' && <DataImportView />}
          {activeView === 'review' && <ReviewView />}
          {activeView === 'knowledge' && <KnowledgeWorkspaceView capabilities={capabilities} />}
          {activeView === 'materials' && <MaterialsView capabilities={capabilities} />}
          {activeView === 'students' && <StudentsView capabilities={capabilities} />}
          {activeView === 'corpus' && <CorpusView capabilities={capabilities} />}
          {activeView === 'quiz' && <QuizView capabilities={capabilities} />}
          {activeView === 'export' && <ExportView />}
        </Suspense>
      </div>
    </section>
  )
}

