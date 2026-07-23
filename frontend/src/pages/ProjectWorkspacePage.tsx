import { ArrowLeft, CheckCircle2, CircleDot, Database, Server } from 'lucide-react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { findProject } from '../lib/projectCatalog'

export default function ProjectWorkspacePage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const project = findProject(projectId)
  if (!project) return <Navigate to="/" replace />

  const Icon = project.icon
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-10 md:px-10 md:py-12">
        <button onClick={() => navigate('/')} className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text"><ArrowLeft size={14} /> 返回平台总览</button>
        <header className="mt-8 flex items-start gap-4 animate-enter">
          <div className="w-11 h-11 rounded-md border border-border bg-surface flex items-center justify-center text-text"><Icon size={20} /></div>
          <div className="min-w-0"><div className="text-xs text-text-tertiary">{project.group} · {project.number}</div><h1 className="mt-1 font-display text-2xl md:text-3xl font-medium text-text">{project.name}</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-text-secondary">{project.description}</p></div>
        </header>

        <section className="mt-10" aria-label="资源概况"><div className="flex items-center justify-between"><h2 className="text-sm font-medium text-text">资源概况</h2><span className="inline-flex items-center gap-1.5 text-xs text-text-secondary"><CircleDot size={13} /> {project.status}</span></div><div className="mt-4 grid divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">{project.initialMetrics.map(metric => <div key={metric.label} className="py-4 sm:px-4 sm:first:pl-0"><div className="font-display text-2xl text-text">0</div><div className="mt-1 text-xs text-text-secondary">{metric.label}</div><div className="mt-1 text-[11px] text-text-tertiary">{metric.detail}</div></div>)}</div></section>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
          <section className="border-t border-border pt-5" aria-label="初始化清单"><h2 className="text-sm font-medium text-text">初始化清单</h2><div className="mt-4 divide-y divide-border border-y border-border">{project.initializationSteps.map((step, index) => <div key={step} className="flex items-center gap-3 py-3"><span className="w-5 text-xs text-text-tertiary">0{index + 1}</span><span className="flex-1 text-sm text-text-secondary">{step}</span><span className="text-[11px] text-text-tertiary">待配置</span></div>)}</div></section>
          <aside className="border-t border-border pt-5 space-y-5"><div><div className="flex items-center gap-2 text-xs text-text-tertiary"><Database size={13} /> 权威数据</div><p className="mt-2 text-sm leading-6 text-text-secondary">{project.ownership}</p></div><div><div className="flex items-center gap-2 text-xs text-text-tertiary"><Server size={13} /> 首期部署</div><p className="mt-2 text-sm leading-6 text-text-secondary">{project.deployment}</p></div><div className="flex items-center gap-2 text-xs text-success"><CheckCircle2 size={14} /> 已建立项目路由与数据边界</div></aside>
        </div>
      </div>
    </div>
  )
}
