import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import SidebarLayout from './components/SidebarLayout'
import Spinner from './components/Spinner'
import { useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import PlatformOverviewPage from './pages/PlatformOverviewPage'
import ProjectWorkspacePage from './pages/ProjectWorkspacePage'

const AiGovernancePage = lazy(() => import('./pages/AiGovernancePage'))
const AgentWorkspacePage = lazy(() => import('./pages/AgentWorkspacePage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const ContentAssetsPage = lazy(() => import('./pages/ContentAssetsPage'))
const ContentOperationsPage = lazy(() => import('./pages/ContentOperationsPage'))
const CustomerServicePage = lazy(() => import('./pages/CustomerServicePage'))

function WorkspaceRoute({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="flex min-h-full items-center justify-center" aria-label="正在加载工作台"><Spinner size="lg" /></div>}>
      {children}
    </Suspense>
  )
}

function RequireAuth() {
  const { isAuthenticated, isReady } = useAuth()
  if (!isReady) return <div className="min-h-dvh bg-page" aria-label="正在恢复登录状态" />
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route path="register" element={<RegisterPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<SidebarLayout />}>
          <Route index element={<PlatformOverviewPage />} />
          <Route path="projects/content-assets" element={<WorkspaceRoute><ContentAssetsPage /></WorkspaceRoute>} />
          <Route path="projects/content-operations" element={<WorkspaceRoute><ContentOperationsPage /></WorkspaceRoute>} />
          <Route path="projects/customer-service" element={<WorkspaceRoute><CustomerServicePage /></WorkspaceRoute>} />
          <Route path="projects/analytics" element={<WorkspaceRoute><AnalyticsPage /></WorkspaceRoute>} />
          <Route path="projects/ai-governance" element={<WorkspaceRoute><AiGovernancePage /></WorkspaceRoute>} />
          <Route path="projects/agent-workspace" element={<WorkspaceRoute><AgentWorkspacePage /></WorkspaceRoute>} />
          <Route path="projects/:projectId" element={<ProjectWorkspacePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
