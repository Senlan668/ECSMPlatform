import { CircleAlert, Database, LoaderCircle, type LucideIcon } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export interface WorkspaceTab<T extends string> {
  id: T
  label: string
}

interface WorkspaceShellProps<T extends string> {
  eyebrow: string
  title: string
  description: string
  icon: LucideIcon
  tabs: WorkspaceTab<T>[]
  activeTab: T
  onTabChange: (tab: T) => void
  children: React.ReactNode
}

export function WorkspaceShell<T extends string>({
  eyebrow,
  title,
  description,
  icon: Icon,
  tabs,
  activeTab,
  onTabChange,
  children,
}: WorkspaceShellProps<T>) {
  const { activeTenant } = useAuth()

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-10 md:px-10 md:py-12">
        <header className="animate-enter">
          <div className="flex items-center gap-2 text-xs text-text-tertiary"><Icon size={14} /> {eyebrow} · {activeTenant?.name}</div>
          <h1 className="mt-4 font-display text-3xl font-medium text-text">{title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-text-secondary">{description}</p>
        </header>

        <div className="mt-9 flex gap-6 overflow-x-auto border-b border-border" role="tablist" aria-label={`${title}工作台`}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`shrink-0 px-1 pb-3 text-sm ${activeTab === tab.id ? 'border-b-2 border-text text-text' : 'text-text-tertiary hover:text-text'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

interface DependencyNoticeProps {
  title: string
  detail: string
  kind?: 'database' | 'runtime'
}

export function DependencyNotice({ title, detail, kind = 'runtime' }: DependencyNoticeProps) {
  const Icon = kind === 'database' ? Database : CircleAlert
  return (
    <div className="flex items-start gap-3 border-y border-border bg-surface px-3 py-3 text-xs leading-5 text-text-secondary">
      <Icon size={15} className="mt-0.5 shrink-0 text-text-tertiary" />
      <div><span className="font-medium text-text">{title}</span><span className="ml-2">{detail}</span></div>
    </div>
  )
}

export function EmptyWorkspace({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="border-y border-border py-12 text-center">
      <div className="text-sm text-text">{title}</div>
      <p className="mt-2 text-xs leading-5 text-text-tertiary">{detail}</p>
    </div>
  )
}

export function CollectionState({ loading, error }: { loading: boolean; error: string }) {
  if (loading) {
    return <div className="flex items-center justify-center gap-2 border-y border-border py-10 text-xs text-text-tertiary"><LoaderCircle size={14} className="animate-spin" /> 正在加载</div>
  }
  if (error) {
    return <div role="alert" className="flex items-start gap-2 border-y border-danger/30 bg-danger-muted px-3 py-3 text-xs text-danger"><CircleAlert size={14} className="mt-0.5 shrink-0" /><span>{error}</span></div>
  }
  return null
}

export function StatusText({ tone = 'neutral', children }: { tone?: 'neutral' | 'success' | 'danger'; children: React.ReactNode }) {
  const color = tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-text-tertiary'
  return <span className={`text-[11px] ${color}`}>{children}</span>
}
