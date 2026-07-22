import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, Bell, BellOff, Bot, BrainCircuit,
  Moon, PanelLeft, Plus, Settings, Sun, Trash2, Zap,
} from 'lucide-react'
import {
  deleteAgentConversation, deleteSession, getReviewQueueCount,
  listAgentConversations, listSessions,
} from '../lib/api'
import {
  AGENT_CONVERSATIONS_CHANGED_EVENT, SESSIONS_CHANGED_EVENT,
} from '../lib/events'
import type { AgentConversation, SessionSummary } from '../types'
import Modal from './Modal'

function SettingsModal({ open, onClose, onNotice }: { open: boolean; onClose: () => void; onNotice: (message: string) => void }) {
  const [notifications, setNotifications] = useState(() => localStorage.getItem('xueleme-notifications') !== 'false')
  const toggleNotifications = async () => {
    const next = !notifications
    if (next && 'Notification' in window) {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setNotifications(false)
        localStorage.setItem('xueleme-notifications', 'false')
        onNotice('浏览器未授予通知权限')
        return
      }
    }
    setNotifications(next)
    localStorage.setItem('xueleme-notifications', String(next))
  }
  return (
    <Modal open={open} onClose={onClose} title="设置">
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-3">
          {notifications ? <Bell size={18} /> : <BellOff size={18} className="text-text-tertiary" />}
          <span className="text-sm">复习提醒</span>
        </div>
        <button onClick={toggleNotifications} role="switch" aria-checked={notifications} aria-label="复习提醒" className={`w-11 h-6 rounded-full transition-colors ${notifications ? 'bg-accent' : 'bg-border'}`}>
          <div className={`w-5 h-5 bg-page rounded-full shadow-sm transition-transform ${notifications ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
        </button>
      </div>
    </Modal>
  )
}

type DeleteTarget = { id: string; title: string; kind: 'agent' | 'study' }

export default function SidebarLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [reviewBadge, setReviewBadge] = useState(0)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [conversations, setConversations] = useState<AgentConversation[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia('(min-width: 768px)').matches)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('xueleme-theme') || 'light')
  const [toast, setToast] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)

  const refresh = useCallback(() => {
    Promise.all([getReviewQueueCount(), listSessions(), listAgentConversations()]).then(([queue, allSessions, allConversations]) => {
      setReviewBadge(queue.count || 0)
      setSessions(allSessions)
      setConversations(allConversations)
    }).catch(() => setToast('部分服务暂时无法连接'))
  }, [])

  useEffect(() => { refresh() }, [location.pathname, refresh])
  useEffect(() => {
    window.addEventListener(SESSIONS_CHANGED_EVENT, refresh)
    window.addEventListener(AGENT_CONVERSATIONS_CHANGED_EVENT, refresh)
    return () => {
      window.removeEventListener(SESSIONS_CHANGED_EVENT, refresh)
      window.removeEventListener(AGENT_CONVERSATIONS_CHANGED_EVENT, refresh)
    }
  }, [refresh])
  useEffect(() => {
    if (!window.matchMedia('(min-width: 768px)').matches) setSidebarOpen(false)
  }, [location.pathname])
  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 2500)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const goTo = useCallback((path: string) => {
    navigate(path)
    if (!window.matchMedia('(min-width: 768px)').matches) setSidebarOpen(false)
  }, [navigate])

  const activeStudyId = location.pathname.match(/^\/study\/(?:session|review)\/([^/]+)/)?.[1]
  const activeAgentId = location.pathname.match(/^\/(?:agent|deep-think)\/([^/]+)/)?.[1]
  const activeSessions = sessions.filter(session =>
    (session.mode !== 'review' && session.status === 'active') ||
    (session.mode === 'review' && session.status === 'reviewing'))

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      if (deleteTarget.kind === 'agent') {
        await deleteAgentConversation(deleteTarget.id)
        if (activeAgentId === deleteTarget.id) goTo('/')
      } else {
        await deleteSession(deleteTarget.id)
        if (activeStudyId === deleteTarget.id) goTo('/study')
      }
      refresh()
    } catch {
      setToast('删除失败，请稍后重试')
    }
    setDeleteTarget(null)
  }, [activeAgentId, activeStudyId, deleteTarget, goTo, refresh])

  return (
    <div className="h-dvh bg-page font-body flex overflow-hidden">
      {sidebarOpen && <button className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} aria-label="关闭侧边栏" />}
      <aside className={`fixed inset-y-0 left-0 z-40 w-[min(86vw,300px)] shrink-0 bg-surface border-r border-border flex flex-col overflow-hidden transition-all duration-200 md:relative md:z-auto md:translate-x-0 ${sidebarOpen ? 'translate-x-0 md:w-[280px]' : '-translate-x-full md:w-0 md:border-r-0'}`} aria-label="主导航">
        <div className="shrink-0 px-4 h-14 flex items-center justify-between border-b border-border/60">
          <button onClick={() => goTo('/')} className="flex items-center gap-2.5 min-w-0" aria-label="智能体平台首页">
            <div className="w-7 h-7 rounded-md bg-accent text-page flex items-center justify-center"><Bot size={15} /></div>
            <span className="text-sm font-semibold truncate">AI 工作台</span>
          </button>
          <button onClick={() => setSidebarOpen(false)} className="w-8 h-8 flex items-center justify-center text-text-tertiary hover:text-text" aria-label="收起侧边栏"><PanelLeft size={16} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium text-text-tertiary">最近对话</span>
            <button onClick={() => goTo('/')} title="新建对话" className="w-6 h-6 flex items-center justify-center text-text-tertiary hover:text-text"><Plus size={13} /></button>
          </div>
          <div className="px-2 space-y-px">
            {conversations.slice(0, 12).map(conversation => {
              const path = conversation.mode === 'deep' ? `/deep-think/${conversation.id}` : `/agent/${conversation.id}`
              return <div key={conversation.id} className="group relative">
                <button onClick={() => goTo(path)} className={`w-full text-left flex items-center gap-2 px-3 py-2 pr-8 rounded-md text-xs transition-colors ${activeAgentId === conversation.id ? 'bg-accent/8 text-text' : 'text-text-secondary hover:bg-accent/6 hover:text-text'}`}>
                  {conversation.mode === 'deep' ? <BrainCircuit size={12} /> : <Bot size={12} />}
                  <span className="truncate">{conversation.title}</span>
                </button>
                <button onClick={() => setDeleteTarget({ id: conversation.id, title: conversation.title, kind: 'agent' })} className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-danger" title="删除对话"><Trash2 size={11} /></button>
              </div>
            })}
            {conversations.length === 0 && <p className="px-3 py-2 text-[11px] text-text-tertiary/60">暂无智能体对话</p>}
          </div>

          {activeSessions.length > 0 && <>
            <div className="px-4 pt-5 pb-2 text-[11px] font-medium text-text-tertiary">进行中的学习</div>
            <div className="px-2 space-y-px">{activeSessions.map(session => <div key={session.id} className="group relative">
              <button onClick={() => goTo(session.mode === 'review' ? `/study/review/${session.id}` : `/study/session/${session.id}`)} className={`w-full text-left flex items-center gap-2 px-3 py-2 pr-8 rounded-md text-xs ${activeStudyId === session.id ? 'bg-accent/8 text-text' : 'text-text-secondary hover:bg-accent/6 hover:text-text'}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" /><span className="truncate">{session.title}</span>
              </button>
              <button onClick={() => setDeleteTarget({ id: session.id, title: session.title, kind: 'study' })} className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-danger" title="删除学习会话"><Trash2 size={11} /></button>
            </div>)}</div>
          </>}
        </div>

        <div className="shrink-0 border-t border-border/60 p-3 space-y-1">
          <button onClick={() => reviewBadge ? goTo('/study/review/batch') : setToast('暂无需要复习的内容')} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-accent/6 hover:text-text">
            <Zap size={15} /><span className="flex-1 text-left">开始复习</span>{reviewBadge > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-danger text-white text-[10px] flex items-center justify-center">{reviewBadge}</span>}
          </button>
          <div className="flex items-center">
            <button onClick={() => setSettingsOpen(true)} className="flex-1 flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-accent/6 hover:text-text"><Settings size={15} /><span>设置</span></button>
            <button onClick={() => {
              const next = theme === 'dark' ? 'light' : 'dark'
              setTheme(next); localStorage.setItem('xueleme-theme', next); document.documentElement.setAttribute('data-theme', next)
            }} className="w-9 h-9 flex items-center justify-center text-text-tertiary hover:text-text" title={theme === 'dark' ? '切换浅色' : '切换深色'}>{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}</button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {!sidebarOpen && <button onClick={() => setSidebarOpen(true)} className="absolute top-3 left-3 z-20 w-8 h-8 flex items-center justify-center text-text-tertiary hover:text-text" aria-label="打开侧边栏"><PanelLeft size={16} /></button>}
        <Outlet />
      </main>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onNotice={setToast} />
      {toast && <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-surface border border-border rounded-lg px-4 py-2 text-xs text-text-secondary shadow-lg">{toast}</div>}
      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="确认删除">
        {deleteTarget && <>
          <div className="text-center"><AlertTriangle size={24} className="text-danger mx-auto mb-3" /><p className="text-sm text-text-secondary">将永久删除“<span className="text-text font-medium">{deleteTarget.title}</span>”及其消息，无法恢复。</p></div>
          <div className="flex gap-3"><button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-lg border border-border text-sm">取消</button><button onClick={confirmDelete} className="flex-1 py-2.5 rounded-lg bg-danger text-white text-sm">删除</button></div>
        </>}
      </Modal>
    </div>
  )
}
