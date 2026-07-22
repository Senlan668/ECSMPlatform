import { CheckCircle2 } from 'lucide-react'

interface CompletionNoticeProps {
  text: string
  action: string
  onAction: () => void
}


export default function CompletionNotice({ text, action, onAction }: CompletionNoticeProps) {
  return (
    <div className="flex justify-center animate-enter">
      <div className="inline-flex items-center gap-3 bg-surface border border-border/60 rounded-2xl px-4 py-3">
        <CheckCircle2 size={17} className="text-success shrink-0" />
        <span className="text-sm text-text-secondary">{text}</span>
        <button
          onClick={onAction}
          className="text-xs font-medium text-accent hover:text-accent-glow transition-colors shrink-0"
        >
          {action}
        </button>
      </div>
    </div>
  )
}
