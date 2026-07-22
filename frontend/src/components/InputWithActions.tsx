import { useRef, useEffect, useCallback, type ReactNode } from 'react'

interface InputWithActionsProps {
  value: string
  onChange: (v: string) => void
  onKeyDown?: (e: React.KeyboardEvent) => void
  placeholder?: string
  disabled?: boolean
  multiline?: boolean
  autoFocus?: boolean
  ariaLabel?: string
  children: ReactNode
}

export default function InputWithActions({
  value, onChange, onKeyDown, placeholder, disabled, multiline, autoFocus, ariaLabel, children,
}: InputWithActionsProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const MAX_H = 6 * 24 + 8 // 6 rows 144px + pt-2 8px
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const h = el.scrollHeight + 8
    el.style.height = Math.min(h, MAX_H) + 'px'
  }, [])

  useEffect(() => {
    if (multiline) adjustHeight()
  }, [value, multiline, adjustHeight])

  if (multiline) {
    return (
      <div className="w-full bg-surface border border-border rounded-2xl px-3 pt-3 hover:bg-accent/8 focus-within:bg-accent/8 focus-within:border-accent/20 transition-colors">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => { onChange(e.target.value); adjustHeight() }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onKeyDown?.(e)
            }
          }}
          placeholder={placeholder}
          aria-label={ariaLabel || placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          rows={1}
          className="w-full bg-transparent border-0 outline-none pl-3 pr-1 pt-2 resize-none text-base text-text placeholder:text-text-tertiary disabled:opacity-40"
          style={{ overflowY: 'auto' }}
        />
        <div className="flex items-center justify-end gap-0.5 pb-3">
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className="w-full bg-surface border border-border rounded-2xl pl-5 pr-14 h-[52px] text-base text-text placeholder:text-text-tertiary hover:bg-accent/8 focus:outline-none focus:bg-accent/8 disabled:opacity-40 transition-colors"
      />
      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
        {children}
      </div>
    </div>
  )
}
