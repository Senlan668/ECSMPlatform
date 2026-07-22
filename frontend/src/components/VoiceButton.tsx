import { Mic, MicOff } from 'lucide-react'

interface VoiceButtonProps {
  listening: boolean
  onStart: () => void
  onStop: () => void
}

/** 语音输入按钮 — 消除项目中 4 处完全相同的 JSX */
export default function VoiceButton({ listening, onStart, onStop }: VoiceButtonProps) {
  return (
    <button
      onClick={listening ? onStop : onStart}
      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
        listening ? 'bg-danger/10 text-danger' : 'text-text-tertiary hover:text-text hover:bg-accent/8'
      }`}
      title={listening ? '停止录音' : '语音输入'}
      aria-label={listening ? '停止录音' : '语音输入'}
    >
      {listening ? <MicOff size={16} /> : <Mic size={16} />}
    </button>
  )
}
