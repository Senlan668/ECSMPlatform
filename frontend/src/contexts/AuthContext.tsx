import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { coreRequest, jsonRequest } from '../lib/http'

export interface Tenant {
  id: string
  name: string
  plan: string
}

export interface AuthUser {
  id: string
  name: string
  username: string
}

interface ServerSession {
  accessToken: string
  tokenType: string
  expiresAt: string
  user: AuthUser
  tenants: Tenant[]
  activeTenantId: string
}

interface PrincipalResponse {
  active: boolean
  expiresAt: string
  user: AuthUser
  tenants: Tenant[]
  activeTenantId: string
}

interface SignInInput {
  username: string
  password: string
}

interface RegisterInput {
  username: string
  password: string
  tenantName: string
}

interface AuthContextValue {
  user: AuthUser | null
  tenants: Tenant[]
  activeTenant: Tenant | null
  accessToken: string
  isAuthenticated: boolean
  isReady: boolean
  signIn: (input: SignInInput) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  signOut: () => void
  switchTenant: (tenantId: string) => void
}

const SESSION_KEY = 'shangmei-zhiying-server-session'
const AuthContext = createContext<AuthContextValue | null>(null)

function loadSession(): ServerSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as ServerSession
    return value.accessToken && Array.isArray(value.tenants) ? value : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<ServerSession | null>(loadSession)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function validateSession() {
      if (!session?.accessToken) {
        if (!cancelled) setIsReady(true)
        return
      }
      try {
        const principal = await coreRequest<PrincipalResponse>('/api/v1/auth/me', undefined, session.accessToken)
        if (!cancelled) {
          const activeTenantId = principal.tenants.some(tenant => tenant.id === session.activeTenantId)
            ? session.activeTenantId
            : principal.activeTenantId
          setSession(current => current ? { ...current, ...principal, activeTenantId } : current)
        }
      } catch {
        if (!cancelled) setSession(null)
      } finally {
        if (!cancelled) setIsReady(true)
      }
    }
    void validateSession()
    return () => { cancelled = true }
    // Session validation happens once at provider startup; later changes originate from trusted API responses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(SESSION_KEY)
  }, [session])

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    tenants: session?.tenants ?? [],
    activeTenant: session?.tenants.find(tenant => tenant.id === session.activeTenantId) ?? null,
    accessToken: session?.accessToken ?? '',
    isAuthenticated: Boolean(session),
    isReady,
    async signIn({ username, password }) {
      const response = await coreRequest<ServerSession>('/api/v1/auth/login', jsonRequest('POST', {
        username: username.trim(),
        password,
      }))
      setSession(response)
    },
    async register({ username, password, tenantName }) {
      const response = await coreRequest<ServerSession>('/api/v1/auth/register', jsonRequest('POST', {
        username: username.trim(),
        password,
        tenantName: tenantName.trim(),
      }))
      setSession(response)
    },
    signOut() {
      const token = session?.accessToken
      setSession(null)
      if (token) void coreRequest<void>('/api/v1/auth/logout', jsonRequest('POST'), token).catch(() => undefined)
    },
    switchTenant(tenantId) {
      setSession(current => current?.tenants.some(tenant => tenant.id === tenantId)
        ? { ...current, activeTenantId: tenantId }
        : current)
    },
  }), [isReady, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
