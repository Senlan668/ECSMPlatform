import { CircleAlert, LoaderCircle, type LucideIcon } from 'lucide-react'

export const fieldClass = 'h-9 w-full rounded-md border border-border bg-page px-3 text-xs text-text outline-none focus:border-text-tertiary'
export const textareaClass = 'min-h-24 w-full resize-y rounded-md border border-border bg-page p-3 text-xs leading-5 text-text outline-none focus:border-text-tertiary'
export const primaryButtonClass = 'inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-3 text-xs text-page disabled:cursor-not-allowed disabled:opacity-40'
export const secondaryButtonClass = 'inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-page px-3 text-xs text-text-secondary hover:text-text disabled:cursor-not-allowed disabled:opacity-40'
export const iconButtonClass = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-text-secondary hover:text-text disabled:cursor-not-allowed disabled:opacity-40'

export function SectionHeading({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
      <div>
        <h3 className="text-sm font-medium text-text">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-text-tertiary">{detail}</p>
      </div>
      {action}
    </div>
  )
}

export function ActionMessage({ loading, error, success }: { loading?: boolean; error?: string; success?: string }) {
  if (!loading && !error && !success) return null
  const color = error ? 'border-danger/30 bg-danger-muted text-danger' : success ? 'border-success/30 bg-success-muted text-success' : 'border-border bg-surface text-text-secondary'
  return (
    <div role={error ? 'alert' : 'status'} className={`flex items-start gap-2 border-y px-3 py-3 text-xs ${color}`}>
      {loading ? <LoaderCircle size={14} className="mt-0.5 shrink-0 animate-spin" /> : error ? <CircleAlert size={14} className="mt-0.5 shrink-0" /> : null}
      <span>{loading ? '正在处理，请稍候' : error || success}</span>
    </div>
  )
}

export function MetricStrip({ items }: { items: Array<{ label: string; value: number | string }> }) {
  return (
    <div className="grid border-y border-border sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item, index) => (
        <div key={item.label} className={`px-4 py-4 ${index ? 'border-t border-border sm:border-l sm:border-t-0' : ''} ${index === 2 ? 'sm:border-t lg:border-t-0' : ''}`}>
          <div className="text-[11px] text-text-tertiary">{item.label}</div>
          <div className="mt-2 font-display text-2xl text-text">{item.value}</div>
        </div>
      ))}
    </div>
  )
}

export function InlineEmpty({ children }: { children: React.ReactNode }) {
  return <div className="border-y border-border py-9 text-center text-xs text-text-tertiary">{children}</div>
}

export function Pager({ page, hasMore, onChange }: { page: number; hasMore: boolean; onChange: (page: number) => void }) {
  return (
    <div className="mt-4 flex items-center justify-end gap-2 text-xs text-text-tertiary">
      <button className={secondaryButtonClass} disabled={page <= 1} onClick={() => onChange(page - 1)}>上一页</button>
      <span className="min-w-12 text-center">第 {page} 页</span>
      <button className={secondaryButtonClass} disabled={!hasMore} onClick={() => onChange(page + 1)}>下一页</button>
    </div>
  )
}

export function IconAction({ icon: Icon, label, onClick, danger = false, disabled = false }: { icon: LucideIcon; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className={`${iconButtonClass} ${danger ? 'hover:text-danger' : ''}`}><Icon size={15} /></button>
}
