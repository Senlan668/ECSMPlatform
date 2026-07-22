import { Navigate, Routes, Route, useParams } from 'react-router-dom'
import SidebarLayout from './components/SidebarLayout'
import HomePage from './pages/HomePage'
import LearningSessionPage from './pages/LearningSessionPage'
import ReviewChatPage from './pages/ReviewChatPage'
import BatchReviewPage from './pages/BatchReviewPage'
import AgentChatPage from './pages/AgentChatPage'
import PrdTestcasePage from './pages/PrdTestcasePage'

function LegacySessionRedirect({ review = false }: { review?: boolean }) {
  const { sessionId } = useParams<{ sessionId: string }>()
  return <Navigate to={`/study/${review ? 'review' : 'session'}/${sessionId || ''}`} replace />
}

export default function App() {
  return (
    <Routes>
      <Route element={<SidebarLayout />}>
        <Route index element={<AgentChatPage mode="general" />} />
        <Route path="agent/:conversationId" element={<AgentChatPage mode="general" />} />
        <Route path="deep-think" element={<AgentChatPage mode="deep" />} />
        <Route path="deep-think/:conversationId" element={<AgentChatPage mode="deep" />} />
        <Route path="tools/prd-testcases" element={<PrdTestcasePage />} />
        <Route path="study" element={<HomePage />} />
        <Route path="study/session/:sessionId" element={<LearningSessionPage />} />
        <Route path="study/review/:sessionId" element={<ReviewChatPage />} />
        <Route path="study/review/batch" element={<BatchReviewPage />} />
        <Route path="session/:sessionId" element={<LegacySessionRedirect />} />
        <Route path="review/:sessionId" element={<LegacySessionRedirect review />} />
        <Route path="review/batch" element={<Navigate to="/study/review/batch" replace />} />
      </Route>
    </Routes>
  )
}
