export type ViewMode =
  | 'chat'
  | 'search'
  | 'ai'
  | 'export'
  | 'admin'
  | 'custom'
  | 'extractor'
  | 'materials'
  | 'students'
  | 'quiz'

const VIEW_PATHS: Record<Exclude<ViewMode, 'chat'>, string> = {
  search: '/search',
  ai: '/ai',
  export: '/export',
  admin: '/admin',
  custom: '/custom',
  extractor: '/extractor',
  materials: '/materials',
  students: '/students',
  quiz: '/quiz',
}

export const getViewModeFromPath = (pathname: string): ViewMode => {
  const normalized = pathname.replace(/\/+$/, '') || '/'

  for (const [viewMode, path] of Object.entries(VIEW_PATHS)) {
    if (normalized === path) {
      return viewMode as Exclude<ViewMode, 'chat'>
    }
  }

  if (normalized === '/' || normalized === '/chat' || normalized.startsWith('/chat/')) {
    return 'chat'
  }

  return 'chat'
}

export const buildChatPath = (sessionId?: string | null, messageId?: number | null): string => {
  const basePath = sessionId ? `/chat/${encodeURIComponent(sessionId)}` : '/chat'

  if (messageId == null) {
    return basePath
  }

  return `${basePath}?messageId=${messageId}`
}

export const buildViewPath = (viewMode: ViewMode, sessionId?: string | null, messageId?: number | null): string => {
  if (viewMode === 'chat') {
    return buildChatPath(sessionId, messageId)
  }

  return VIEW_PATHS[viewMode]
}

export const getChatRouteState = (
  pathname: string,
  search: string,
): { sessionId: string | null; messageId: number | null } => {
  if (getViewModeFromPath(pathname) !== 'chat') {
    return { sessionId: null, messageId: null }
  }

  const match = pathname.match(/^\/chat\/([^/?#]+)/)
  const sessionId = match ? decodeURIComponent(match[1]) : null
  const rawMessageId = new URLSearchParams(search).get('messageId')
  const messageId = rawMessageId && /^\d+$/.test(rawMessageId) ? Number(rawMessageId) : null

  if (!sessionId) {
    return { sessionId: null, messageId: null }
  }

  return { sessionId, messageId }
}
