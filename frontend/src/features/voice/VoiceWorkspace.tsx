import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AudioLines,
  CircleStop,
  LoaderCircle,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Plus,
  Radio,
  ShieldCheck,
  Trash2,
  Volume2,
  Wifi,
} from 'lucide-react'
import Modal from '../../components/Modal'
import { CollectionState, EmptyWorkspace, StatusText } from '../../components/WorkspaceShell'
import { useAuth } from '../../contexts/AuthContext'
import { useBusinessCollection } from '../../lib/businessApi'
import { jsonRequest } from '../../lib/http'
import { formatWorkspaceDate } from '../../lib/tenantStorage'
import {
  VoiceRtcClient,
  type VoiceAgentState,
  type VoiceConnectionState,
  type VoiceNetworkQuality,
  type VoiceRtcAccess,
  type VoiceSubtitleUpdate,
} from './rtcClient'

interface VoiceTranscript {
  id: string
  role: 'customer' | 'agent'
  content: string
  interrupted: boolean
  createdAt: string
}

interface VoiceSession {
  id: string
  roomId: string
  userId: string
  status: 'created' | 'ready' | 'active' | 'failed' | 'closed'
  providerStatus: string
  runtimeSessionId?: string
  interruptCount: number
  error?: string
  transcripts: VoiceTranscript[]
  consentConfirmedAt?: string
  createdAt: string
  closedAt?: string
}

interface VoiceSessionAccess extends VoiceRtcAccess {
  session: VoiceSession
}

interface LiveSubtitle extends VoiceSubtitleUpdate {
  interrupted: boolean
}

type VoicePhase = 'idle' | 'preparing' | 'joining' | 'starting' | 'active' | 'closing' | 'error'

const sessionStatusLabel: Record<VoiceSession['status'], string> = {
  created: '待接入',
  ready: '凭证已签发',
  active: '通话中',
  failed: '运行失败',
  closed: '已结束',
}

const phaseLabel: Record<VoicePhase, string> = {
  idle: '未连接',
  preparing: '检查设备',
  joining: '连接房间',
  starting: '启动智能体',
  active: '通话中',
  closing: '正在结束',
  error: '连接失败',
}

const agentStateLabel: Record<VoiceAgentState, string> = {
  idle: '等待智能体',
  listening: '正在聆听',
  thinking: '正在思考',
  speaking: '正在回答',
  interrupted: '已打断',
  finished: '本轮完成',
}

const connectionLabel: Record<VoiceConnectionState, string> = {
  idle: 'RTC 未连接',
  connecting: 'RTC 连接中',
  connected: 'RTC 已连接',
  reconnecting: 'RTC 重连中',
  disconnected: 'RTC 已断开',
}

const networkLabel: Record<VoiceNetworkQuality, string> = {
  unknown: '网络未知',
  excellent: '网络极佳',
  good: '网络良好',
  poor: '网络一般',
  bad: '网络较差',
  down: '网络中断',
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message.trim() ? reason.message : fallback
}

function statusTone(status: VoiceSession['status']) {
  if (status === 'active') return 'success' as const
  if (status === 'failed') return 'danger' as const
  return 'neutral' as const
}

export default function VoiceWorkspace() {
  const { activeTenant } = useAuth()
  const records = useBusinessCollection<VoiceSession>('/api/v1/customer-service/voice-sessions')
  const sessions = records.items
  const [selectedId, setSelectedId] = useState('')
  const [phase, setPhase] = useState<VoicePhase>('idle')
  const [connection, setConnection] = useState<VoiceConnectionState>('idle')
  const [network, setNetwork] = useState<VoiceNetworkQuality>('unknown')
  const [agentState, setAgentState] = useState<VoiceAgentState>('idle')
  const [agentDescription, setAgentDescription] = useState('')
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false)
  const [credentialExpiresAt, setCredentialExpiresAt] = useState('')
  const [autoplayUserId, setAutoplayUserId] = useState('')
  const [toolNotice, setToolNotice] = useState('')
  const [runtimeError, setRuntimeError] = useState('')
  const [liveSubtitles, setLiveSubtitles] = useState<LiveSubtitle[]>([])
  const [consentOpen, setConsentOpen] = useState(false)
  const [consentChecked, setConsentChecked] = useState(false)
  const [consentTarget, setConsentTarget] = useState<VoiceSession | null>(null)

  const clientRef = useRef<VoiceRtcClient | null>(null)
  const activeSessionRef = useRef('')
  const attemptRef = useRef(0)
  const finalizedKeysRef = useRef(new Set<string>())
  const interruptedKeysRef = useRef(new Set<string>())
  const interruptPendingRef = useRef(false)
  const liveSubtitlesRef = useRef<LiveSubtitle[]>([])
  const transcriptQueueRef = useRef<Promise<void>>(Promise.resolve())

  const selected = sessions.find(session => session.id === selectedId) || sessions[0]
  const activeSessionId = activeSessionRef.current
  const isBusy = phase === 'preparing' || phase === 'joining' || phase === 'starting' || phase === 'closing'
  const isLive = phase === 'active' && Boolean(activeSessionId)

  const visibleTranscripts = useMemo(() => {
    if (!selected) return []
    const persisted = selected.transcripts.map(transcript => ({
      key: transcript.id,
      role: transcript.role,
      content: transcript.content,
      interrupted: transcript.interrupted,
      live: false,
    }))
    const live = selected.id === activeSessionId
      ? liveSubtitles.map(subtitle => ({
          key: subtitle.key,
          role: subtitle.role,
          content: subtitle.content,
          interrupted: subtitle.interrupted,
          live: true,
        }))
      : []
    return [...persisted, ...live]
  }, [activeSessionId, liveSubtitles, selected])

  function replaceSession(updated: VoiceSession) {
    records.setItems(current => current.map(session => session.id === updated.id ? updated : session))
  }

  function isCurrentAttempt(attempt: number, sessionId: string) {
    return attemptRef.current === attempt && activeSessionRef.current === sessionId
  }

  function resetLiveState() {
    setConnection('idle')
    setNetwork('unknown')
    setAgentState('idle')
    setAgentDescription('')
    setMicrophoneEnabled(false)
    setCredentialExpiresAt('')
    setAutoplayUserId('')
    setToolNotice('')
    setLiveSubtitles([])
    liveSubtitlesRef.current = []
    finalizedKeysRef.current = new Set()
    interruptedKeysRef.current = new Set()
    interruptPendingRef.current = false
    transcriptQueueRef.current = Promise.resolve()
  }

  useEffect(() => {
    resetLiveState()
    setPhase('idle')
    setRuntimeError('')
    return () => {
      attemptRef.current += 1
      const sessionId = activeSessionRef.current
      const client = clientRef.current
      activeSessionRef.current = ''
      clientRef.current = null
      void client?.disconnect()
      if (sessionId) {
        void records.request<VoiceSession>(
          `/api/v1/customer-service/voice-sessions/${sessionId}/close`,
          jsonRequest('POST'),
        ).catch(() => undefined)
      }
    }
    // The captured request belongs to the tenant being cleaned up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenant?.id])

  function openConsent(target: VoiceSession | null) {
    setConsentTarget(target)
    setConsentChecked(false)
    setConsentOpen(true)
    setRuntimeError('')
  }

  async function beginVoiceSession() {
    if (!consentChecked || isBusy || isLive) return
    setConsentOpen(false)
    setRuntimeError('')
    resetLiveState()
    setPhase('preparing')

    let session = consentTarget
    try {
      if (!session) {
        session = await records.request<VoiceSession>(
          '/api/v1/customer-service/voice-sessions',
          jsonRequest('POST'),
        )
        records.setItems(current => [session as VoiceSession, ...current])
      }
      setSelectedId(session.id)
      const consented = await records.request<VoiceSession>(
        `/api/v1/customer-service/voice-sessions/${session.id}/consent`,
        jsonRequest('POST'),
      )
      replaceSession(consented)
      session = consented
    } catch (reason) {
      setPhase('error')
      setRuntimeError(errorMessage(reason, '通话授权登记失败'))
      return
    }

    const sessionId = session.id
    const attempt = ++attemptRef.current
    activeSessionRef.current = sessionId
    const client = new VoiceRtcClient({
      onConnectionState: state => {
        if (isCurrentAttempt(attempt, sessionId)) setConnection(state)
      },
      onNetworkQuality: quality => {
        if (isCurrentAttempt(attempt, sessionId)) setNetwork(quality)
      },
      onAgentState: (state, description) => {
        if (!isCurrentAttempt(attempt, sessionId)) return
        setAgentState(state)
        setAgentDescription(description || '')
      },
      onSubtitle: subtitle => {
        if (isCurrentAttempt(attempt, sessionId)) handleSubtitle(sessionId, attempt, subtitle)
      },
      onToolCall: call => {
        if (isCurrentAttempt(attempt, sessionId)) setToolNotice(`工具调用 ${call.name} 等待受控工具网关处理`)
      },
      onMicrophoneState: enabled => {
        if (isCurrentAttempt(attempt, sessionId)) setMicrophoneEnabled(enabled)
      },
      onAutoplayBlocked: userId => {
        if (isCurrentAttempt(attempt, sessionId)) setAutoplayUserId(userId)
      },
      onError: message => {
        if (isCurrentAttempt(attempt, sessionId)) setRuntimeError(message)
      },
      refreshToken: async () => {
        if (!isCurrentAttempt(attempt, sessionId)) throw new Error('语音会话已经结束')
        const refreshed = await records.request<VoiceSessionAccess>(
          `/api/v1/customer-service/voice-sessions/${sessionId}/access`,
          jsonRequest('POST'),
        )
        if (!isCurrentAttempt(attempt, sessionId)) throw new Error('语音会话已经结束')
        replaceSession(refreshed.session)
        setCredentialExpiresAt(refreshed.rtc.expiresAt)
        const token = refreshed.rtc.token
        refreshed.rtc.token = ''
        return token
      },
    })
    clientRef.current = client

    try {
      await client.prepareMicrophone()
      if (!isCurrentAttempt(attempt, sessionId)) return
      setPhase('joining')
      const access = await records.request<VoiceSessionAccess>(
        `/api/v1/customer-service/voice-sessions/${sessionId}/access`,
        jsonRequest('POST'),
      )
      if (!isCurrentAttempt(attempt, sessionId)) {
        access.rtc.token = ''
        return
      }
      replaceSession(access.session)
      setCredentialExpiresAt(access.rtc.expiresAt)
      try {
        await client.connect(access)
      } finally {
        access.rtc.token = ''
      }
      if (!isCurrentAttempt(attempt, sessionId)) return
      setPhase('starting')
      const started = await records.request<VoiceSession>(
        `/api/v1/customer-service/voice-sessions/${sessionId}/start`,
        jsonRequest('POST'),
      )
      if (!isCurrentAttempt(attempt, sessionId)) return
      replaceSession(started)
      setPhase('active')
      setAgentState('listening')
    } catch (reason) {
      if (!isCurrentAttempt(attempt, sessionId)) return
      attemptRef.current += 1
      activeSessionRef.current = ''
      clientRef.current = null
      await client.disconnect()
      setPhase('error')
      setRuntimeError(errorMessage(reason, '实时语音启动失败'))
      void records.reload()
    }
  }

  function handleSubtitle(sessionId: string, attempt: number, subtitle: VoiceSubtitleUpdate) {
    const existing = liveSubtitlesRef.current.find(item => item.key === subtitle.key)
    const pendingInterruption = subtitle.role === 'agent' && subtitle.definite && interruptPendingRef.current
    const interrupted = existing?.interrupted
      || interruptedKeysRef.current.has(subtitle.key)
      || pendingInterruption
    if (pendingInterruption) interruptPendingRef.current = false
    const next: LiveSubtitle[] = [
      ...liveSubtitlesRef.current.filter(item => item.key !== subtitle.key),
      { ...subtitle, interrupted },
    ]
    liveSubtitlesRef.current = next
    setLiveSubtitles(next)

    if (!subtitle.definite || finalizedKeysRef.current.has(subtitle.key)) return
    finalizedKeysRef.current.add(subtitle.key)
    transcriptQueueRef.current = transcriptQueueRef.current.then(async () => {
      try {
        const updated = await records.request<VoiceSession>(
          `/api/v1/customer-service/voice-sessions/${sessionId}/transcripts`,
          jsonRequest('POST', {
            role: subtitle.role,
            content: subtitle.content,
            interrupted,
          }),
        )
        replaceSession(updated)
        if (!isCurrentAttempt(attempt, sessionId)) return
        const remaining = liveSubtitlesRef.current.filter(item => item.key !== subtitle.key)
        liveSubtitlesRef.current = remaining
        setLiveSubtitles(remaining)
      } catch (reason) {
        if (isCurrentAttempt(attempt, sessionId)) {
          setRuntimeError(errorMessage(reason, '最终字幕保存失败'))
        }
      }
    })
  }

  async function toggleMicrophone() {
    const client = clientRef.current
    if (!client || !isLive) return
    setRuntimeError('')
    try {
      await client.setMicrophoneEnabled(!microphoneEnabled)
    } catch (reason) {
      setRuntimeError(errorMessage(reason, '麦克风状态更新失败'))
    }
  }

  async function interruptAgent() {
    const client = clientRef.current
    const sessionId = activeSessionRef.current
    if (!client || !sessionId || !isLive) return
    setRuntimeError('')
    try {
      await client.interrupt()
      const interruptedKeys = new Set(interruptedKeysRef.current)
      for (const subtitle of liveSubtitlesRef.current) {
        if (subtitle.role === 'agent' && !subtitle.definite) interruptedKeys.add(subtitle.key)
      }
      interruptedKeysRef.current = interruptedKeys
      interruptPendingRef.current = true
      const updatedLive = liveSubtitlesRef.current.map(subtitle => interruptedKeys.has(subtitle.key)
        ? { ...subtitle, interrupted: true }
        : subtitle)
      liveSubtitlesRef.current = updatedLive
      setLiveSubtitles(updatedLive)
      setAgentState('interrupted')
      const updated = await records.request<VoiceSession>(
        `/api/v1/customer-service/voice-sessions/${sessionId}/interrupts`,
        jsonRequest('POST'),
      )
      replaceSession(updated)
    } catch (reason) {
      setRuntimeError(errorMessage(reason, '智能体打断失败'))
    }
  }

  async function resumeAudio() {
    const client = clientRef.current
    if (!client || !autoplayUserId) return
    setRuntimeError('')
    try {
      await client.resumeRemoteAudio(autoplayUserId)
      setAutoplayUserId('')
    } catch (reason) {
      setRuntimeError(errorMessage(reason, '远端音频恢复失败'))
    }
  }

  async function closeSession(session: VoiceSession): Promise<boolean> {
    if (phase === 'closing') return false
    const isCurrent = activeSessionRef.current === session.id
    if (isCurrent) {
      attemptRef.current += 1
      setPhase('closing')
    }
    setRuntimeError('')
    const client = isCurrent ? clientRef.current : null
    if (isCurrent) {
      clientRef.current = null
      activeSessionRef.current = ''
    }
    try {
      const updated = await records.request<VoiceSession>(
        `/api/v1/customer-service/voice-sessions/${session.id}/close`,
        jsonRequest('POST'),
      )
      replaceSession(updated)
      if (isCurrent) {
        await transcriptQueueRef.current
        await client?.disconnect()
        resetLiveState()
        setPhase('idle')
      }
      return true
    } catch (reason) {
      await client?.disconnect()
      if (isCurrent) setPhase('error')
      setRuntimeError(errorMessage(reason, '语音会话关闭失败'))
      void records.reload()
      return false
    }
  }

  async function deleteSession(session: VoiceSession) {
    if (isBusy) return
    setRuntimeError('')
    if (activeSessionRef.current === session.id || session.status === 'active') {
      if (!await closeSession(session)) return
    }
    try {
      await transcriptQueueRef.current
      await records.request<void>(
        `/api/v1/customer-service/voice-sessions/${session.id}`,
        jsonRequest('DELETE'),
      )
      records.setItems(current => current.filter(item => item.id !== session.id))
      if (selectedId === session.id) setSelectedId('')
    } catch (reason) {
      setRuntimeError(errorMessage(reason, '语音会话删除失败'))
    }
  }

  return (
    <section aria-label="实时语音接待">
      <div className="flex flex-wrap items-start justify-between gap-4 border-y border-border bg-surface px-3 py-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Radio size={15} className="mt-0.5 shrink-0 text-text-tertiary" />
          <div className="min-w-0 text-xs leading-5">
            <div className="font-medium text-text">{isLive ? agentStateLabel[agentState] : phaseLabel[phase]}</div>
            <div className="text-text-secondary">
              {isLive ? `${connectionLabel[connection]} · ${networkLabel[network]}` : '浏览器 RTC 与 Voice Agent 由 Java 控制面按租户签发和协调'}
            </div>
          </div>
        </div>
        <button
          onClick={() => openConsent(null)}
          disabled={isBusy || isLive}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-page disabled:opacity-40"
          title="新建语音会话"
          aria-label="新建语音会话"
        >
          <Plus size={17} />
        </button>
      </div>

      {(runtimeError || records.error) && (
        <div role="alert" className="mt-4 border-y border-danger/30 bg-danger-muted px-3 py-3 text-xs leading-5 text-danger">
          {runtimeError || records.error}
        </div>
      )}

      <div className="mt-6"><CollectionState loading={records.loading} error="" /></div>
      {!records.loading && sessions.length === 0 ? (
        <EmptyWorkspace title="暂无语音会话" detail="创建会话后，RTC 凭证只会在确认通话授权并获得麦克风权限后签发。" />
      ) : !records.loading && (
        <div className="grid min-h-[480px] border-y border-border lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="border-b border-border lg:border-b-0 lg:border-r">
            {sessions.map(session => (
              <div key={session.id} className={`border-b border-border last:border-b-0 ${selected?.id === session.id ? 'bg-surface' : ''}`}>
                <button onClick={() => setSelectedId(session.id)} className="w-full px-3 py-3 text-left hover:bg-surface">
                  <div className="flex items-center gap-2">
                    <Mic size={13} className="shrink-0 text-text-tertiary" />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-text">{session.roomId}</span>
                    <StatusText tone={statusTone(session.status)}>{sessionStatusLabel[session.status]}</StatusText>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-text-tertiary">
                    <span>{session.transcripts.length} 条字幕 · 打断 {session.interruptCount}</span>
                    <span>{formatWorkspaceDate(session.createdAt)}</span>
                  </div>
                </button>
                <div className="flex justify-end gap-1 px-2 pb-2">
                  {(session.status === 'created' || session.status === 'ready' || session.status === 'failed') && (
                    <button
                      onClick={() => openConsent(session)}
                      disabled={isBusy || isLive}
                      className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text disabled:opacity-30"
                      title="接入语音会话"
                      aria-label={`接入 ${session.roomId}`}
                    >
                      <PhoneCall size={14} />
                    </button>
                  )}
                  {session.status !== 'closed' && (
                    <button
                      onClick={() => void closeSession(session)}
                      disabled={isBusy && activeSessionRef.current !== session.id}
                      className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-danger disabled:opacity-30"
                      title="结束语音会话"
                      aria-label={`结束 ${session.roomId}`}
                    >
                      <PhoneOff size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => void deleteSession(session)}
                    disabled={isBusy}
                    className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-danger disabled:opacity-30"
                    title="删除语音会话"
                    aria-label={`删除 ${session.roomId}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {selected && (
            <div className="flex min-w-0 flex-col">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-text">{selected.roomId}</span>
                    <StatusText tone={statusTone(selected.status)}>{sessionStatusLabel[selected.status]}</StatusText>
                    {selected.consentConfirmedAt && <StatusText tone="success">授权已登记</StatusText>}
                  </div>
                  <div className="mt-1 text-[10px] text-text-tertiary">
                    {selected.providerStatus} · {selected.userId}
                    {credentialExpiresAt && selected.id === activeSessionId ? ` · 凭证 ${formatWorkspaceDate(credentialExpiresAt)} 到期` : ''}
                  </div>
                  {selected.error && <div className="mt-1 text-[10px] text-danger">{selected.error}</div>}
                </div>
                {selected.id === activeSessionId && (
                  <div className="flex items-center gap-1">
                    {isBusy && <LoaderCircle size={14} className="mr-1 animate-spin text-text-tertiary" />}
                    <button
                      onClick={() => void toggleMicrophone()}
                      disabled={!isLive}
                      className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text disabled:opacity-30"
                      title={microphoneEnabled ? '关闭麦克风' : '打开麦克风'}
                      aria-label={microphoneEnabled ? '关闭麦克风' : '打开麦克风'}
                    >
                      {microphoneEnabled ? <Mic size={14} /> : <MicOff size={14} />}
                    </button>
                    <button
                      onClick={() => void interruptAgent()}
                      disabled={!isLive || agentState === 'interrupted'}
                      className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-danger disabled:opacity-30"
                      title="打断智能体"
                      aria-label="打断智能体"
                    >
                      <CircleStop size={14} />
                    </button>
                    <button
                      onClick={() => void closeSession(selected)}
                      disabled={phase === 'closing'}
                      className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-danger disabled:opacity-30"
                      title="结束通话"
                      aria-label="结束通话"
                    >
                      <PhoneOff size={14} />
                    </button>
                  </div>
                )}
              </div>

              {selected.id === activeSessionId && (
                <div className="grid grid-cols-2 border-b border-border text-[10px] text-text-tertiary sm:grid-cols-4">
                  <div className="flex items-center gap-2 border-b border-r border-border px-3 py-2 sm:border-b-0"><Wifi size={12} /> {connectionLabel[connection]}</div>
                  <div className="flex items-center gap-2 border-b border-border px-3 py-2 sm:border-b-0 sm:border-r"><AudioLines size={12} /> {networkLabel[network]}</div>
                  <div className="flex items-center gap-2 border-r border-border px-3 py-2"><Radio size={12} /> {agentStateLabel[agentState]}</div>
                  <div className="flex items-center gap-2 px-3 py-2">{microphoneEnabled ? <Mic size={12} /> : <MicOff size={12} />} {microphoneEnabled ? '麦克风开启' : '麦克风关闭'}</div>
                </div>
              )}

              {(agentDescription || toolNotice || autoplayUserId) && selected.id === activeSessionId && (
                <div className="space-y-2 border-b border-border bg-surface px-3 py-3 text-[11px] leading-5 text-text-secondary">
                  {agentDescription && <div>{agentDescription}</div>}
                  {toolNotice && <div>{toolNotice}</div>}
                  {autoplayUserId && (
                    <button onClick={() => void resumeAudio()} className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-2.5 text-xs text-text">
                      <Volume2 size={13} /> 恢复远端音频
                    </button>
                  )}
                </div>
              )}

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite" aria-label="实时字幕">
                {visibleTranscripts.length === 0 ? (
                  <div className="py-14 text-center text-xs text-text-tertiary">暂无字幕</div>
                ) : visibleTranscripts.map(transcript => (
                  <div key={transcript.key} className={`max-w-[88%] ${transcript.role === 'customer' ? 'ml-auto text-right' : ''}`}>
                    <div className="text-[10px] text-text-tertiary">
                      {transcript.role === 'customer' ? '客户' : 'AI 智能体'}
                      {transcript.live ? ' · 实时' : ''}
                      {transcript.interrupted ? ' · 已打断' : ''}
                    </div>
                    <div className={`mt-1 inline-block rounded-md px-3 py-2 text-left text-xs leading-5 ${transcript.role === 'customer' ? 'bg-accent text-page' : 'border border-border bg-page text-text'}`}>
                      {transcript.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Modal open={consentOpen} title="开始实时语音" onClose={() => !isBusy && setConsentOpen(false)}>
        <div className="flex items-start gap-3 border-y border-border bg-surface px-3 py-3">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-text-tertiary" />
          <div className="text-xs leading-5 text-text-secondary">
            通话音频将发送至已配置的 RTC 与 AI 服务，最终字幕会写入当前租户的会话记录。
          </div>
        </div>
        <label className="mt-5 flex cursor-pointer items-start gap-3 text-xs leading-5 text-text">
          <input
            type="checkbox"
            checked={consentChecked}
            onChange={event => setConsentChecked(event.target.checked)}
            className="mt-1 h-4 w-4 accent-current"
          />
          <span>已获得通话参与者对录音、实时转写和 AI 处理的明确授权</span>
        </label>
        <button
          onClick={() => void beginVoiceSession()}
          disabled={!consentChecked || isBusy}
          className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent text-sm text-page disabled:opacity-40"
        >
          {isBusy ? <LoaderCircle size={15} className="animate-spin" /> : <PhoneCall size={15} />}
          确认并接入
        </button>
      </Modal>
    </section>
  )
}
