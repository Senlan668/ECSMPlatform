import { CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useCampaignMedia } from './api'

export const inputClass = 'mt-2 h-10 w-full rounded-md border border-border bg-page px-3 text-sm text-text outline-none focus:border-text-tertiary'
export const textareaClass = 'mt-2 min-h-28 w-full resize-y rounded-md border border-border bg-page p-3 text-sm leading-6 text-text outline-none focus:border-text-tertiary'
export const primaryButton = 'inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-3 text-xs text-page disabled:opacity-40'
export const secondaryButton = 'inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs text-text-secondary hover:text-text disabled:opacity-40'
export const iconButton = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-surface hover:text-text'

export function ActionState({ loading, error, success }: { loading?: boolean; error?: string; success?: string }) {
  if (!loading && !error && !success) return null
  return (
    <div className={`flex items-start gap-2 border-y px-3 py-3 text-xs ${error ? 'border-danger/30 bg-danger-muted text-danger' : 'border-border bg-surface text-text-secondary'}`} role={error ? 'alert' : 'status'}>
      {loading ? <LoaderCircle size={14} className="mt-0.5 shrink-0 animate-spin" /> : error ? <CircleAlert size={14} className="mt-0.5 shrink-0" /> : null}
      <span>{loading ? '正在处理' : error || success}</span>
    </div>
  )
}

export function ViewTabs<T extends string>({ items, value, onChange, label }: {
  items: Array<{ id: T; label: string; icon?: LucideIcon }>
  value: T
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div className="mb-6 flex gap-5 overflow-x-auto border-b border-border" role="tablist" aria-label={label}>
      {items.map(item => {
        const Icon = item.icon
        return <button key={item.id} role="tab" aria-selected={value === item.id} onClick={() => onChange(item.id)} className={`flex shrink-0 items-center gap-1.5 px-1 pb-3 text-xs ${value === item.id ? 'border-b-2 border-text text-text' : 'text-text-tertiary hover:text-text'}`}>{Icon && <Icon size={13} />}{item.label}</button>
      })}
    </div>
  )
}

export function SectionHeading({ title, detail, action }: { title: string; detail?: string; action?: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-4"><div><h2 className="text-sm font-medium text-text">{title}</h2>{detail && <p className="mt-1 text-xs leading-5 text-text-tertiary">{detail}</p>}</div>{action}</div>
}

export function CampaignMedia({ url, alt, className = '' }: { url?: string | null; alt: string; className?: string }) {
  const source = useCampaignMedia(url)
  return source
    ? <img src={source} alt={alt} className={`block h-full w-full object-cover ${className}`} />
    : <div className={`flex h-full w-full items-center justify-center bg-surface text-xs text-text-tertiary ${className}`}>暂无预览</div>
}

export function RefreshButton({ onClick, label = '刷新' }: { onClick: () => void; label?: string }) {
  return <button onClick={onClick} className={iconButton} title={label} aria-label={label}><RefreshCw size={14} /></button>
}
