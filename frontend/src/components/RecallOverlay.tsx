import { useCallback, useId } from 'react'
import InputWithActions from './InputWithActions'
import VoiceButton from './VoiceButton'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'

interface RecallOverlayProps {
  visible: boolean
  value: string
  onChange: (text: string) => void
  onSubmit: () => void
  title?: string
  subtitle?: string
  placeholder?: string
  autoFocus?: boolean
}

export default function RecallOverlay({
  visible,
  value,
  onChange,
  onSubmit,
  title = '完整复现',
  subtitle = '合上材料，凭记忆写出全部内容',
  placeholder = '请写出你记住的内容...',
  autoFocus = true,
}: RecallOverlayProps) {
  const titleId = useId()
  const handleSpeech = useCallback((text: string) => {
    onChange(value + text)
  }, [value, onChange])

  const { listening, start, stop } = useSpeechRecognition(handleSpeech)

  if (!visible) return null

  return (
    <div
      className="absolute inset-0 bg-page z-20 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="text-center px-6 pt-10 pb-6">
        <h2 id={titleId} className="font-display text-xl text-text mb-1">{title}</h2>
        <p className="text-sm text-text-secondary">{subtitle}</p>
      </div>
      <div className="flex-1 w-full max-w-3xl mx-auto px-6 pb-8 flex flex-col min-h-0">
        <InputWithActions
          value={value}
          onChange={onChange}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && value.trim()) {
              e.preventDefault()
              onSubmit()
            }
          }}
          placeholder={placeholder}
          ariaLabel="回忆内容"
          multiline
          autoFocus={autoFocus}
        >
          <VoiceButton listening={listening} onStart={start} onStop={stop} />
        </InputWithActions>
      </div>
    </div>
  )
}
