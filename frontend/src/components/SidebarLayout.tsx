import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bot, Building2, ChevronDown, ChevronRight, LogOut, Moon, PanelLeft, Sun } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { navigationGroups, platformProjects } from '../lib/projectCatalog'

export default function SidebarLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { activeTenant, signOut, switchTenant, tenants, user } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia('(min-width: 768px)').matches)
  const [theme, setTheme] = useState(() => localStorage.getItem('aiplatform-theme') || 'light')
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('aiplatform-theme', theme)
  }, [theme])

  useEffect(() => {
    if (!window.matchMedia('(min-width: 768px)').matches) setSidebarOpen(false)
  }, [location.pathname])

  const goTo = (path: string) => {
    navigate(path)
    if (!window.matchMedia('(min-width: 768px)').matches) setSidebarOpen(false)
  }

  const initials = (user?.name || 'U').slice(0, 2).toUpperCase()

  return (
    <div className="h-dvh bg-page font-body flex overflow-hidden">
      {sidebarOpen && <button className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} aria-label="关闭侧边栏" />}
      <aside className={`fixed inset-y-0 left-0 z-40 w-[min(86vw,300px)] shrink-0 bg-surface border-r border-border flex flex-col overflow-hidden transition-all duration-200 md:relative md:z-auto md:translate-x-0 ${sidebarOpen ? 'translate-x-0 md:w-[280px]' : '-translate-x-full md:w-0 md:border-r-0'}`} aria-label="主导航">
        <div className="shrink-0 px-4 h-14 flex items-center justify-between border-b border-border/60">
          <button onClick={() => goTo('/')} className="flex items-center gap-2.5 min-w-0" aria-label="商媒智营平台首页">
            <div className="w-7 h-7 rounded-md bg-accent text-page flex items-center justify-center"><Bot size={15} /></div>
            <span className="text-sm font-semibold truncate">商媒智营</span>
          </button>
          <button onClick={() => setSidebarOpen(false)} className="w-8 h-8 flex items-center justify-center text-text-tertiary hover:text-text" aria-label="收起侧边栏"><PanelLeft size={16} /></button>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto py-4" aria-label="项目导航">
          <div className="px-2 space-y-px">
            <button onClick={() => goTo('/')} className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${location.pathname === '/' ? 'bg-accent/8 text-text' : 'text-text-secondary hover:bg-accent/6 hover:text-text'}`}>
              <Bot size={15} /><span className="flex-1">平台总览</span>
            </button>
            {navigationGroups.map(group => <div key={group} className="pt-5 first:pt-4"><div className="px-2 pb-2 text-[11px] font-medium text-text-tertiary">{group}</div>{platformProjects.filter(project => project.group === group).map(project => {
              const active = location.pathname === `/projects/${project.id}`
              const Icon = project.icon
              return <button key={project.id} onClick={() => goTo(`/projects/${project.id}`)} className={`group w-full text-left flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${active ? 'bg-accent/8 text-text' : 'text-text-secondary hover:bg-accent/6 hover:text-text'}`}><Icon size={15} /><span className="flex-1 truncate">{project.shortName}</span><ChevronRight size={13} className={`text-text-tertiary transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} /></button>
            })}</div>)}
          </div>
        </nav>

        <div className="shrink-0 border-t border-border/60 p-3">
          <div className="flex items-center">
            <div className="relative flex-1 min-w-0">
              {userMenuOpen && <div className="absolute bottom-full left-0 right-0 mb-2 border border-border bg-page shadow-lg rounded-lg p-1.5 z-50" role="menu" aria-label="用户菜单">
                <div className="px-2.5 py-2 border-b border-border"><div className="text-xs font-medium text-text truncate">{user?.name}</div><div className="mt-0.5 text-[11px] text-text-tertiary truncate">@{user?.username}</div></div>
                <div className="py-1 border-b border-border"><div className="px-2.5 py-1 text-[10px] font-medium text-text-tertiary">切换租户</div>{tenants.map(tenant => <button key={tenant.id} onClick={() => { switchTenant(tenant.id); setUserMenuOpen(false) }} className={`w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-md text-xs ${tenant.id === activeTenant?.id ? 'bg-accent/8 text-text' : 'text-text-secondary hover:bg-surface hover:text-text'}`}><Building2 size={13} /><span className="flex-1 truncate">{tenant.name}</span>{tenant.id === activeTenant?.id && <span className="text-[10px] text-success">当前</span>}</button>)}</div>
                <button onClick={() => { signOut(); navigate('/login', { replace: true }); setUserMenuOpen(false) }} className="w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-md text-xs text-danger hover:bg-danger-muted"><LogOut size={13} /> 退出登录</button>
              </div>}
              <button onClick={() => setUserMenuOpen(open => !open)} className="w-full min-w-0 flex items-center gap-2.5 px-2 py-2 rounded-lg text-left hover:bg-accent/6" aria-haspopup="menu" aria-expanded={userMenuOpen} aria-label="打开用户菜单">
                <span className="w-7 h-7 shrink-0 rounded-full bg-accent text-page text-[11px] font-medium flex items-center justify-center">{initials}</span>
                <span className="min-w-0 flex-1"><span className="block text-xs text-text truncate">{user?.name}</span><span className="block mt-0.5 text-[10px] text-text-tertiary truncate">{activeTenant?.name}</span></span><ChevronDown size={14} className="shrink-0 text-text-tertiary" />
              </button>
            </div>
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="w-9 h-9 flex items-center justify-center text-text-tertiary hover:text-text" title={theme === 'dark' ? '切换浅色' : '切换深色'} aria-label={theme === 'dark' ? '切换浅色' : '切换深色'}>{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}</button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {!sidebarOpen && <button onClick={() => setSidebarOpen(true)} className="absolute top-3 left-3 z-20 w-8 h-8 flex items-center justify-center text-text-tertiary hover:text-text" aria-label="打开侧边栏"><PanelLeft size={16} /></button>}
        <Outlet />
      </main>
    </div>
  )
}
