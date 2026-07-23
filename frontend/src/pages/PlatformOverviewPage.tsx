import { ArrowRight, Layers3 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { platformProjects } from '../lib/projectCatalog'

export default function PlatformOverviewPage() {
  const navigate = useNavigate()
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-10 md:px-10 md:py-12">
        <div className="max-w-2xl animate-enter">
          <div className="flex items-center gap-2 text-xs text-text-tertiary"><Layers3 size={14} /> 商媒智营平台</div>
          <h1 className="mt-4 font-display text-3xl md:text-4xl font-medium text-text">平台架构总览</h1>
          <p className="mt-3 text-sm leading-7 text-text-secondary">电商与自媒体 AI 智能运营平台。八个业务领域以明确的数据所有权协作，后续按业务闭环逐步建设。</p>
        </div>

        <section className="mt-10 border-y border-border" aria-label="平台项目列表">
          {platformProjects.map(project => {
            const Icon = project.icon
            return (
              <button key={project.id} onClick={() => navigate(`/projects/${project.id}`)} className="group w-full grid grid-cols-[auto_1fr_auto] items-center gap-4 py-5 text-left border-b border-border last:border-b-0 hover:bg-surface transition-colors">
                <div className="w-9 h-9 rounded-md border border-border flex items-center justify-center text-text-secondary group-hover:text-text"><Icon size={17} /></div>
                <div className="min-w-0"><div className="text-[11px] text-text-tertiary">{project.number}</div><h2 className="mt-1 text-sm font-medium text-text truncate">{project.name}</h2><p className="mt-1 text-xs leading-5 text-text-secondary line-clamp-1">{project.description}</p></div>
                <ArrowRight size={16} className="text-text-tertiary group-hover:text-text transition-colors" />
              </button>
            )
          })}
        </section>
      </div>
    </div>
  )
}
