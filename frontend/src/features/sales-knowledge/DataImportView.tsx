import { useCallback, useEffect, useRef, useState } from 'react'
import { Database, FileSearch, RefreshCw, Search, Upload } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useBusinessApi } from '../../lib/businessApi'
import type { AdminStats, ChatMessage, ChatSession, Paginated } from './types'
import { ActionMessage, fieldClass, InlineEmpty, MetricStrip, primaryButtonClass, secondaryButtonClass, SectionHeading } from './ui'

const API = '/api/v1/sales-knowledge'
const ALLOWED_NAMES = /^(MicroMsg|ChatRoomUser|MSG[0-5])\.db$/i

interface ImportResult {
  success: boolean
  message: string
  files: string[]
  stats: { contacts?: number; sessions?: number; messages?: number }
}

interface SearchResult {
  id: number
  session_id: string
  session_name: string | null
  sender_name: string | null
  content: string | null
  highlight: string | null
  timestamp: number
}

function timeLabel(timestamp: number | null) {
  if (!timestamp) return '无时间'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(timestamp * 1000))
}

export default function DataImportView() {
  const request = useBusinessApi()
  const { activeTenant } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [sessions, setSessions] = useState<Paginated<ChatSession> | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null)
  const [sessionSearch, setSessionSearch] = useState('')
  const [messageSearch, setMessageSearch] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [clearExisting, setClearExisting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadOverview = useCallback(async (search = '') => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ page: '1', page_size: '20', exclude_chatroom: 'true' })
      if (search.trim()) query.set('search', search.trim())
      const [nextStats, nextSessions] = await Promise.all([
        request<AdminStats>(`${API}/admin/stats`),
        request<Paginated<ChatSession>>(`${API}/chats/sessions?${query}`),
      ])
      setStats(nextStats)
      setSessions(nextSessions)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '数据源状态加载失败')
    } finally {
      setLoading(false)
    }
  }, [request])

  useEffect(() => {
    setStats(null)
    setSessions(null)
    setMessages([])
    setActiveSession(null)
    void loadOverview()
  }, [activeTenant?.id, loadOverview])

  function selectFiles(files: FileList | null) {
    setError('')
    setSuccess('')
    const next = Array.from(files || [])
    const invalid = next.find(file => !ALLOWED_NAMES.test(file.name))
    const duplicates = new Set(next.map(file => file.name.toLowerCase())).size !== next.length
    if (invalid) {
      setSelectedFiles([])
      setError(`不支持 ${invalid.name}，只接受 MicroMsg.db、ChatRoomUser.db 与 MSG0-5.db`)
      return
    }
    if (duplicates || next.length > 8) {
      setSelectedFiles([])
      setError('数据库文件存在重名或数量超过 8 个')
      return
    }
    setSelectedFiles(next)
  }

  async function uploadDatabases() {
    if (!selectedFiles.length) return
    setActionLoading(true)
    setError('')
    setSuccess('')
    try {
      const form = new FormData()
      selectedFiles.forEach(file => form.append('files', file, file.name))
      const result = await request<ImportResult>(`${API}/admin/etl/upload?clear_existing=${clearExisting}`, { method: 'POST', body: form })
      setSuccess(`${result.message}：${result.stats.messages || 0} 条消息，${result.stats.sessions || 0} 个会话`)
      setSelectedFiles([])
      if (fileRef.current) fileRef.current.value = ''
      await loadOverview(sessionSearch)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '微信数据库导入失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function openSession(session: ChatSession) {
    setActiveSession(session)
    setMessages([])
    setActionLoading(true)
    setError('')
    try {
      const history = await request<Paginated<ChatMessage>>(`${API}/chats/history/${encodeURIComponent(session.session_id)}?page=1&page_size=100`)
      setMessages(history.items)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '聊天记录加载失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function searchMessages() {
    if (!messageSearch.trim()) return
    setActionLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ q: messageSearch.trim(), page: '1', page_size: '30' })
      const result = await request<{ items: SearchResult[] }>(`${API}/search/messages?${query}`)
      setSearchResults(result.items)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '消息搜索失败')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="space-y-8" data-testid="sales-data-view">
      <section>
        <SectionHeading
          title="微信数据导入"
          detail="上传解密后的微信 SQLite 数据库。文件经 Java 控制面转发，只写入当前租户独立数据库。"
          action={<button className={secondaryButtonClass} onClick={() => void loadOverview(sessionSearch)}><RefreshCw size={14} /> 刷新</button>}
        />
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="border-y border-border px-4 py-5">
            <input ref={fileRef} type="file" accept=".db" multiple className="sr-only" id="wechat-databases" onChange={event => selectFiles(event.target.files)} />
            <label htmlFor="wechat-databases" className="flex min-h-28 cursor-pointer flex-col items-center justify-center border border-dashed border-border px-4 text-center hover:bg-surface">
              <Database size={20} className="text-text-tertiary" />
              <span className="mt-3 text-xs text-text">选择微信数据库</span>
              <span className="mt-1 text-[11px] text-text-tertiary">MicroMsg.db、ChatRoomUser.db、MSG0-5.db，最多 8 个</span>
            </label>
            {selectedFiles.length > 0 && <div className="mt-3 text-xs leading-5 text-text-secondary">已选择：{selectedFiles.map(file => file.name).join('、')}</div>}
          </div>
          <div className="flex flex-col justify-between border-y border-border px-4 py-5">
            <label className="flex items-start gap-2 text-xs leading-5 text-text-secondary">
              <input type="checkbox" checked={clearExisting} onChange={event => setClearExisting(event.target.checked)} className="mt-1" />
              <span>导入前清空当前租户的旧数据</span>
            </label>
            <button className={`${primaryButtonClass} mt-6 w-full`} disabled={!selectedFiles.length || actionLoading} onClick={() => void uploadDatabases()}><Upload size={14} /> 开始导入</button>
          </div>
        </div>
        <div className="mt-4"><ActionMessage loading={actionLoading} error={error} success={success} /></div>
      </section>

      <section>
        <SectionHeading title="数据概况" detail="统计仅包含当前租户，并沿用原项目 2025-10-01 之后、默认排除群聊的处理规则。" />
        <div className="mt-4">
          {loading ? <ActionMessage loading /> : stats ? <MetricStrip items={[
            { label: '原始消息', value: stats.raw_chats.total },
            { label: '有效会话', value: stats.sessions.total },
            { label: '已处理会话', value: stats.sessions.processed },
            { label: '待审核对话', value: stats.staging_conversations.pending },
          ]} /> : null}
        </div>
      </section>

      <section>
        <SectionHeading title="会话与消息检索" detail="核对导入结果，查看完整会话，或按关键词检索原始消息。" />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <form className="flex gap-2" onSubmit={event => { event.preventDefault(); void loadOverview(sessionSearch) }}>
            <input className={fieldClass} value={sessionSearch} onChange={event => setSessionSearch(event.target.value)} placeholder="按联系人名称筛选会话" aria-label="会话搜索" />
            <button className={secondaryButtonClass} type="submit"><Search size={14} /> 会话</button>
          </form>
          <form className="flex gap-2" onSubmit={event => { event.preventDefault(); void searchMessages() }}>
            <input className={fieldClass} value={messageSearch} onChange={event => setMessageSearch(event.target.value)} placeholder="搜索消息正文" aria-label="消息搜索" />
            <button className={secondaryButtonClass} type="submit" disabled={!messageSearch.trim()}><FileSearch size={14} /> 消息</button>
          </form>
        </div>

        {searchResults.length > 0 && (
          <div className="mt-4 border-y border-border">
            {searchResults.map(result => (
              <div key={result.id} className="border-b border-border px-3 py-3 last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-tertiary"><span>{result.session_name || result.session_id} · {result.sender_name || '未知发送者'}</span><span>{timeLabel(result.timestamp)}</span></div>
                <p className="mt-1 text-xs leading-5 text-text-secondary">{result.highlight || result.content}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 grid min-h-[360px] border-y border-border md:grid-cols-[260px_minmax(0,1fr)]">
          <div className="max-h-[520px] overflow-y-auto border-b border-border md:border-b-0 md:border-r">
            {!sessions?.items.length ? <div className="px-4 py-10 text-center text-xs text-text-tertiary">暂无会话</div> : sessions.items.map(session => (
              <button key={session.session_id} onClick={() => void openSession(session)} className={`w-full border-b border-border px-3 py-3 text-left last:border-b-0 ${activeSession?.session_id === session.session_id ? 'bg-surface' : 'hover:bg-surface'}`}>
                <div className="truncate text-xs text-text">{session.display_name || session.session_id}</div>
                <div className="mt-1 flex justify-between gap-2 text-[10px] text-text-tertiary"><span>{session.message_count} 条消息</span><span>{timeLabel(session.last_time)}</span></div>
              </button>
            ))}
          </div>
          <div className="max-h-[520px] overflow-y-auto px-4 py-4">
            {!activeSession ? <InlineEmpty>选择左侧会话查看聊天记录</InlineEmpty> : messages.length === 0 ? <InlineEmpty>该会话暂无可显示消息</InlineEmpty> : (
              <div className="space-y-3">
                {messages.map(message => (
                  <div key={message.id} className={`max-w-[88%] ${message.is_sender ? 'ml-auto text-right' : ''}`}>
                    <div className="text-[10px] text-text-tertiary">{message.sender_name || (message.is_sender ? '销售' : '客户')} · {timeLabel(message.timestamp)}</div>
                    <div className={`mt-1 inline-block rounded-md px-3 py-2 text-left text-xs leading-5 ${message.is_sender ? 'bg-accent text-page' : 'bg-surface text-text-secondary'}`}>{message.content || `[消息类型 ${message.msg_type}]`}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
