import VERTC, {
  ConnectionState,
  MediaType,
  NetworkQuality,
  RoomProfileType,
} from '@volcengine/rtc'
import type { ConnectionStateChangeEvent, IRTCEngine } from '@volcengine/rtc'

export type VoiceConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
export type VoiceNetworkQuality = 'unknown' | 'excellent' | 'good' | 'poor' | 'bad' | 'down'
export type VoiceAgentState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'interrupted' | 'finished'

export interface VoiceRtcAccess {
  rtc: {
    appId: string
    roomId: string
    userId: string
    token: string
    expiresAt: string
  }
  agentUserId: string
  interruptSupported: boolean
}

export interface VoiceSubtitleUpdate {
  key: string
  role: 'customer' | 'agent'
  content: string
  definite: boolean
  paragraph?: string
}

export interface VoiceToolCall {
  id: string
  name: string
  arguments: string
}

interface VoiceRtcCallbacks {
  onConnectionState: (state: VoiceConnectionState) => void
  onNetworkQuality: (quality: VoiceNetworkQuality) => void
  onAgentState: (state: VoiceAgentState, description?: string) => void
  onSubtitle: (subtitle: VoiceSubtitleUpdate) => void
  onToolCall: (call: VoiceToolCall) => void
  onMicrophoneState: (enabled: boolean) => void
  onAutoplayBlocked: (userId: string) => void
  onError: (message: string) => void
  refreshToken: () => Promise<string>
}

interface DecodedTlv {
  type: string
  payload: unknown
}

const MAX_SIGNAL_BYTES = 1024 * 1024

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function encodeVoiceTlv(content: string, type: string) {
  if (type.length !== 4) throw new Error('RTC 消息类型必须为 4 个字符')
  const typeBytes = new TextEncoder().encode(type)
  if (typeBytes.byteLength !== 4) throw new Error('RTC 消息类型必须为 4 个 ASCII 字符')
  const valueBytes = new TextEncoder().encode(content)
  if (valueBytes.byteLength > MAX_SIGNAL_BYTES) throw new Error('RTC 控制消息过大')

  const bytes = new Uint8Array(8 + valueBytes.byteLength)
  bytes.set(typeBytes, 0)
  new DataView(bytes.buffer).setUint32(4, valueBytes.byteLength, false)
  bytes.set(valueBytes, 8)
  return bytes.buffer
}

export function decodeVoiceTlv(buffer: ArrayBuffer): DecodedTlv {
  if (buffer.byteLength < 8) throw new Error('RTC 消息不完整')
  const view = new DataView(buffer)
  const length = view.getUint32(4, false)
  if (length > MAX_SIGNAL_BYTES || length > buffer.byteLength - 8) throw new Error('RTC 消息长度无效')

  const type = new TextDecoder('ascii', { fatal: true }).decode(new Uint8Array(buffer, 0, 4))
  const value = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(buffer, 8, length))
  return { type, payload: JSON.parse(value) as unknown }
}

function connectionState(value: ConnectionState): VoiceConnectionState {
  if (value === ConnectionState.CONNECTION_STATE_CONNECTED || value === ConnectionState.CONNECTION_STATE_RECONNECTED) return 'connected'
  if (value === ConnectionState.CONNECTION_STATE_CONNECTING || value === ConnectionState.CONNECTION_START) return 'connecting'
  if (value === ConnectionState.CONNECTION_STATE_RECONNECTING || value === ConnectionState.CONNECTION_STATE_LOST) return 'reconnecting'
  return 'disconnected'
}

function networkQuality(uplink: NetworkQuality, downlink: NetworkQuality): VoiceNetworkQuality {
  const quality = Math.max(uplink, downlink)
  if (quality === NetworkQuality.EXCELLENT) return 'excellent'
  if (quality === NetworkQuality.GOOD) return 'good'
  if (quality === NetworkQuality.POOR) return 'poor'
  if (quality === NetworkQuality.BAD || quality === NetworkQuality.VBAD) return 'bad'
  if (quality === NetworkQuality.DOWN) return 'down'
  return 'unknown'
}

function browserPermissionError(error?: DOMException) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return '麦克风权限未授予'
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') return '未检测到可用麦克风'
  if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') return '麦克风正被其他应用占用'
  return '无法访问麦克风'
}

function operationError(reason: unknown, fallback: string) {
  if (reason instanceof DOMException) return browserPermissionError(reason)
  if (reason instanceof Error && reason.message.trim()) return reason.message
  return fallback
}

export class VoiceRtcClient {
  private engine: IRTCEngine | null = null
  private joined = false
  private microphoneEnabled = false
  private agentUserId = ''
  private localUserId = ''
  private disconnecting: Promise<void> | null = null
  private readonly callbacks: VoiceRtcCallbacks

  constructor(callbacks: VoiceRtcCallbacks) {
    this.callbacks = callbacks
  }

  async prepareMicrophone() {
    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      throw new Error('实时语音需要 HTTPS 安全环境')
    }
    if (!await VERTC.isSupported()) throw new Error('当前浏览器不支持实时语音')
    const permission = await VERTC.enableDevices({ audio: true, video: false })
    if (!permission.audio) throw new Error(browserPermissionError(permission.audioExceptionError))
    const devices = await VERTC.enumerateAudioCaptureDevices()
    if (!devices.some(device => device.kind === 'audioinput' && device.deviceId)) {
      throw new Error('未检测到可用麦克风')
    }
  }

  async connect(access: VoiceRtcAccess) {
    if (this.engine) throw new Error('RTC 客户端已连接')
    if (!access.rtc.appId || !access.rtc.roomId || !access.rtc.userId || !access.rtc.token || !access.agentUserId) {
      throw new Error('RTC 凭证不完整')
    }
    const expiresAt = Date.parse(access.rtc.expiresAt)
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + 10_000) throw new Error('RTC 凭证已经失效')

    const engine = VERTC.createEngine(access.rtc.appId)
    this.engine = engine
    this.agentUserId = access.agentUserId
    this.localUserId = access.rtc.userId
    this.bindEvents(engine)
    this.callbacks.onConnectionState('connecting')

    try {
      await engine.joinRoom(
        access.rtc.token,
        access.rtc.roomId,
        {
          userId: access.rtc.userId,
          extraInfo: JSON.stringify({
            call_scene: 'RTC-AIGC',
            user_name: access.rtc.userId,
            user_id: access.rtc.userId,
          }),
        },
        {
          isAutoPublish: false,
          isAutoSubscribeAudio: true,
          roomProfileType: RoomProfileType.chat,
        },
      )
      this.joined = true
      await engine.startAudioCapture()
      await engine.publishStream(MediaType.AUDIO)
      this.microphoneEnabled = true
      this.callbacks.onMicrophoneState(true)
      this.callbacks.onConnectionState('connected')
    } catch (reason) {
      await this.disconnect()
      throw new Error(operationError(reason, '加入 RTC 房间失败'))
    }
  }

  async setMicrophoneEnabled(enabled: boolean) {
    const engine = this.engine
    if (!engine || !this.joined) throw new Error('RTC 房间尚未连接')
    if (enabled === this.microphoneEnabled) return

    if (enabled) {
      try {
        await engine.startAudioCapture()
        await engine.publishStream(MediaType.AUDIO)
        this.microphoneEnabled = true
      } catch (reason) {
        await engine.stopAudioCapture().catch(() => undefined)
        throw new Error(operationError(reason, '麦克风启动失败'))
      }
    } else {
      await engine.unpublishStream(MediaType.AUDIO).catch(() => undefined)
      await engine.stopAudioCapture()
      this.microphoneEnabled = false
    }
    this.callbacks.onMicrophoneState(this.microphoneEnabled)
  }

  async interrupt() {
    if (!this.engine || !this.joined || !this.agentUserId) throw new Error('语音智能体尚未连接')
    await this.engine.sendUserBinaryMessage(
      this.agentUserId,
      encodeVoiceTlv(JSON.stringify({ Command: 'interrupt', InterruptMode: 0, Message: '' }), 'ctrl'),
    )
  }

  async resumeRemoteAudio(userId: string) {
    if (!this.engine || !this.joined) throw new Error('RTC 房间尚未连接')
    await this.engine.play(userId, MediaType.AUDIO)
  }

  async disconnect() {
    if (this.disconnecting) return this.disconnecting
    const engine = this.engine
    if (!engine) return
    this.engine = null

    this.disconnecting = (async () => {
      if (this.microphoneEnabled) {
        await engine.unpublishStream(MediaType.AUDIO).catch(() => undefined)
        await engine.stopAudioCapture().catch(() => undefined)
      }
      if (this.joined) await engine.leaveRoom().catch(() => undefined)
      engine.removeAllListeners()
      VERTC.destroyEngine(engine)
      this.joined = false
      this.microphoneEnabled = false
      this.agentUserId = ''
      this.localUserId = ''
      this.callbacks.onMicrophoneState(false)
      this.callbacks.onConnectionState('disconnected')
    })().finally(() => { this.disconnecting = null })

    return this.disconnecting
  }

  private bindEvents(engine: IRTCEngine) {
    engine.on(VERTC.events.onConnectionStateChanged, (event: ConnectionStateChangeEvent) => {
      this.callbacks.onConnectionState(connectionState(event.state))
    })
    engine.on(VERTC.events.onNetworkQuality, (uplink, downlink) => {
      this.callbacks.onNetworkQuality(networkQuality(uplink, downlink))
    })
    engine.on(VERTC.events.onRoomBinaryMessageReceived, event => this.handleSignal(event.message))
    engine.on(VERTC.events.onUserBinaryMessageReceived, event => this.handleSignal(event.message))
    engine.on(VERTC.events.onTokenWillExpire, () => {
      void this.refreshToken(engine)
    })
    engine.on(VERTC.events.onAutoplayFailed, event => {
      if (event.userId) this.callbacks.onAutoplayBlocked(event.userId)
    })
    engine.on(VERTC.events.onTrackEnded, event => {
      if (event.kind !== 'audio' || event.isScreen) return
      this.microphoneEnabled = false
      this.callbacks.onMicrophoneState(false)
      this.callbacks.onError('麦克风采集已中断')
    })
    engine.on(VERTC.events.onAudioDeviceStateChanged, event => {
      if (event.mediaDeviceInfo.kind === 'audioinput' && event.deviceState === 'inactive') {
        this.callbacks.onError('当前麦克风已断开')
      }
    })
    engine.on(VERTC.events.onError, event => {
      this.callbacks.onError(`RTC 连接错误 (${String(event.errorCode)})`)
    })
  }

  private async refreshToken(engine: IRTCEngine) {
    try {
      const token = await this.callbacks.refreshToken()
      if (!token || engine !== this.engine) return
      await engine.updateToken(token)
    } catch (reason) {
      this.callbacks.onError(operationError(reason, 'RTC 凭证续期失败'))
    }
  }

  private handleSignal(buffer: ArrayBuffer) {
    try {
      const signal = decodeVoiceTlv(buffer)
      const payload = recordValue(signal.payload)
      if (!payload) return
      if (signal.type === 'conv') this.handleAgentState(payload)
      if (signal.type === 'subv') this.handleSubtitle(payload)
      if (signal.type === 'tool') this.handleToolCall(payload)
    } catch {
      this.callbacks.onError('收到无法解析的 RTC 消息')
    }
  }

  private handleAgentState(payload: Record<string, unknown>) {
    const stage = recordValue(payload.Stage) ?? recordValue(payload.stage)
    const code = numberValue(stage?.Code ?? stage?.code)
    const description = textValue(stage?.Description ?? stage?.description)
    const states: Record<number, VoiceAgentState> = {
      1: 'listening',
      2: 'thinking',
      3: 'speaking',
      4: 'interrupted',
      5: 'finished',
    }
    if (code !== undefined && states[code]) this.callbacks.onAgentState(states[code], description || undefined)
  }

  private handleSubtitle(payload: Record<string, unknown>) {
    const data = Array.isArray(payload.data) ? recordValue(payload.data[0]) : null
    if (!data) return
    const content = textValue(data.text).trim()
    if (!content) return
    const speakerId = textValue(data.userId || data.UserId)
    const paragraphValue = data.paragraph ?? data.Paragraph
    const paragraph = typeof paragraphValue === 'string' || typeof paragraphValue === 'number'
      ? String(paragraphValue)
      : undefined
    const role = speakerId === this.localUserId ? 'customer' : 'agent'
    const definite = data.definite === true || data.definite === 1
    const key = `${role}:${speakerId || 'unknown'}:${paragraph || content}`
    this.callbacks.onSubtitle({ key, role, content, definite, paragraph })
  }

  private handleToolCall(payload: Record<string, unknown>) {
    const calls = Array.isArray(payload.tool_calls) ? payload.tool_calls : []
    const call = recordValue(calls[0])
    const fn = recordValue(call?.function)
    if (!call || !fn) return
    const id = textValue(call.id)
    const name = textValue(fn.name)
    if (!id || !name) return
    this.callbacks.onToolCall({ id, name, arguments: textValue(fn.arguments) })
  }
}
