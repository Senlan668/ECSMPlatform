import { useState } from 'react'
import { ArrowRight, Bot, Building2, LockKeyhole, UserRound } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { isAuthenticated, register } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (isAuthenticated) return <Navigate to="/" replace />

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await register({ username, password, tenantName })
      navigate('/', { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '注册失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-dvh bg-page font-body flex items-center justify-center px-5 py-10">
      <section className="w-full max-w-[420px] border border-border bg-surface rounded-lg p-6 md:p-8 animate-enter" aria-label="注册">
        <div className="w-9 h-9 rounded-md bg-accent text-page flex items-center justify-center"><Bot size={18} /></div>
        <h1 className="mt-5 font-display text-3xl font-medium text-text">注册租户</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">创建账号并建立你的首个运营空间</p>
        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <label className="block"><span className="text-xs text-text-secondary">租户名称</span><span className="mt-2 flex items-center gap-2 border border-border bg-page rounded-md px-3 h-10 focus-within:border-text-tertiary"><Building2 size={15} className="text-text-tertiary" /><input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-tertiary" value={tenantName} onChange={event => setTenantName(event.target.value)} placeholder="例如：我的品牌矩阵" aria-label="租户名称" required /></span></label>
          <label className="block"><span className="text-xs text-text-secondary">账号</span><span className="mt-2 flex items-center gap-2 border border-border bg-page rounded-md px-3 h-10 focus-within:border-text-tertiary"><UserRound size={15} className="text-text-tertiary" /><input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-tertiary" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} placeholder="至少 3 个字符" aria-label="账号" required /></span></label>
          <label className="block"><span className="text-xs text-text-secondary">密码</span><span className="mt-2 flex items-center gap-2 border border-border bg-page rounded-md px-3 h-10 focus-within:border-text-tertiary"><LockKeyhole size={15} className="text-text-tertiary" /><input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-tertiary" type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="至少 3 个字符" aria-label="密码" required /></span></label>
          {error && <p role="alert" className="text-xs text-danger">{error}</p>}
          <button type="submit" disabled={submitting} className="w-full h-10 flex items-center justify-center gap-2 rounded-md bg-accent text-page text-sm font-medium hover:bg-accent-glow disabled:opacity-50">{submitting ? '正在创建' : '创建租户'}<ArrowRight size={15} /></button>
        </form>
        <p className="mt-6 text-center text-xs text-text-secondary">已有账号？ <Link to="/login" className="text-text hover:underline">返回登录</Link></p>
      </section>
    </main>
  )
}
