import { useCallback } from 'react'
import InputWithActions from './InputWithActions'
import VoiceButton from './VoiceButton'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'

interface VoiceComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder: string
  disabled?: boolean
  autoFocus?: boolean
}


export default function VoiceComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  autoFocus,
}: VoiceComposerProps) {
  const handleSpeech = useCallback(
    (text: string) => onChange(value + text),
    [onChange, value],
  )
  const { listening, start, stop } = useSpeechRecognition(handleSpeech)

  return (
    <InputWithActions
      value={value}
      onChange={onChange}
      onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && value.trim()) {
          event.preventDefault()
          onSubmit()
        }
      }}
      placeholder={placeholder}
      multiline
      disabled={disabled}
      autoFocus={autoFocus}
    >
      <VoiceButton listening={listening} onStart={start} onStop={stop} />
    </InputWithActions>
  )
}
