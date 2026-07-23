import { createContext, useContext, useEffect, useMemo, useState } from 'react'

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

interface Account {
  username: string
  password: string
  user: AuthUser
  tenantIds: string[]
}

interface AuthSession {
  version: 2
  user: AuthUser
  activeTenantId: string
  tenantIds: string[]
}

interface SignInInput {
  username: string
  password: string
  tenantId: string
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
  isAuthenticated: boolean
  signIn: (input: SignInInput) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  signOut: () => void
  switchTenant: (tenantId: string) => void
}

const SESSION_KEY = 'shangmei-zhiying-session'
const ACCOUNTS_KEY = 'shangmei-zhiying-accounts'
const CUSTOM_TENANTS_KEY = 'shangmei-zhiying-tenants'

const defaultTenants: Tenant[] = [
  { id: 'senlan-commerce', name: '森蓝电商', plan: '专业版' },
  { id: 'senlan-media', name: '森蓝内容矩阵', plan: '专业版' },
]

const defaultAccounts: Account[] = [{
  username: 'admin',
  password: '123',
  user: { id: 'user:admin', name: '管理员', username: 'admin' },
  tenantIds: defaultTenants.map(tenant => tenant.id),
}]

const AuthContext = createContext<AuthContextValue | null>(null)

function loadList<T>(key: string, fallback: T[]) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '') as T[]
    return Array.isArray(value) ? value : fallback
  } catch {
    return fallback
  }
}

function loadSession(): AuthSession | null {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || '') as AuthSession
    return session.version === 2 && Array.isArray(session.tenantIds) ? session : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(loadSession)
  const [accounts, setAccounts] = useState<Account[]>(() => loadList(ACCOUNTS_KEY, defaultAccounts))
  const [customTenants, setCustomTenants] = useState<Tenant[]>(() => loadList(CUSTOM_TENANTS_KEY, []))
  const allTenants = useMemo(() => [...defaultTenants, ...customTenants], [customTenants])
  const tenants = useMemo(() => session
    ? allTenants.filter(tenant => session.tenantIds.includes(tenant.id))
    : defaultTenants,
  [allTenants, session])

  useEffect(() => {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
  }, [session])
  useEffect(() => { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts)) }, [accounts])
  useEffect(() => { localStorage.setItem(CUSTOM_TENANTS_KEY, JSON.stringify(customTenants)) }, [customTenants])

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    tenants,
    activeTenant: tenants.find(tenant => tenant.id === session?.activeTenantId) ?? null,
    isAuthenticated: Boolean(session),
    async signIn({ username, password, tenantId }) {
      const normalizedUsername = username.trim().toLowerCase()
      const account = accounts.find(item => item.username === normalizedUsername && item.password === password)
      if (!account || !account.tenantIds.includes(tenantId)) throw new Error('账号、密码或租户不正确')
      setSession({ version: 2, user: account.user, activeTenantId: tenantId, tenantIds: account.tenantIds })
    },
    async register({ username, password, tenantName }) {
      const normalizedUsername = username.trim().toLowerCase()
      if (normalizedUsername.length < 3 || password.length < 3 || !tenantName.trim()) throw new Error('请填写完整的注册信息')
      if (accounts.some(account => account.username === normalizedUsername)) throw new Error('该账号已被注册')
      const tenant: Tenant = { id: `tenant:${crypto.randomUUID()}`, name: tenantName.trim(), plan: 'MVP' }
      const account: Account = { username: normalizedUsername, password, user: { id: `user:${crypto.randomUUID()}`, name: normalizedUsername, username: normalizedUsername }, tenantIds: [tenant.id] }
      setCustomTenants(current => [...current, tenant])
      setAccounts(current => [...current, account])
      setSession({ version: 2, user: account.user, activeTenantId: tenant.id, tenantIds: account.tenantIds })
    },
    signOut() { setSession(null) },
    switchTenant(tenantId) {
      if (session?.tenantIds.includes(tenantId)) setSession(current => current ? { ...current, activeTenantId: tenantId } : current)
    },
  }), [accounts, session, tenants])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
