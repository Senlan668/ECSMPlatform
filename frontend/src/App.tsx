import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import SidebarLayout from './components/SidebarLayout'
import { useAuth } from './contexts/AuthContext'
import AiGovernancePage from './pages/AiGovernancePage'
import AnalyticsPage from './pages/AnalyticsPage'
import ContentAssetsPage from './pages/ContentAssetsPage'
import ContentOperationsPage from './pages/ContentOperationsPage'
import CustomerServicePage from './pages/CustomerServicePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import PlatformOverviewPage from './pages/PlatformOverviewPage'
import ProjectWorkspacePage from './pages/ProjectWorkspacePage'

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
          <Route path="projects/content-assets" element={<ContentAssetsPage />} />
          <Route path="projects/content-operations" element={<ContentOperationsPage />} />
          <Route path="projects/customer-service" element={<CustomerServicePage />} />
          <Route path="projects/analytics" element={<AnalyticsPage />} />
          <Route path="projects/ai-governance" element={<AiGovernancePage />} />
          <Route path="projects/:projectId" element={<ProjectWorkspacePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
