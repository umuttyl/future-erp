import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { user, loading, login, error } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  const [tenantSlug, setTenantSlug] = useState('default')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Yükleniyor…
      </div>
    )
  }

  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await login({
        tenant_slug: tenantSlug.trim() || 'default',
        email: email.trim(),
        password,
      })
      navigate(from, { replace: true })
    } catch {
      // Hata mesajı context.error üzerinden
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-950 to-slate-900 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950/80 p-8 shadow-xl backdrop-blur">
        <h1 className="text-center text-xl font-semibold text-slate-100">Future ERP</h1>
        <p className="mt-1 text-center text-sm text-slate-400">Giriş yapın</p>

        {import.meta.env.DEV ? (
          <p className="mt-3 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
            Geliştirme hesapları (kiracı: <span className="font-mono text-slate-400">default</span>):<br />
            <span className="font-mono text-slate-400">admin@demo.example.com</span> / Admin12345 —{' '}
            <span className="font-mono text-slate-400">manager@demo.example.com</span> / Manager12345 —{' '}
            <span className="font-mono text-slate-400">employee@demo.example.com</span> / Employee12345
          </p>
        ) : null}

        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="block text-xs font-medium text-slate-400" htmlFor="tenant">
              Şirket kodu
            </label>
            <input
              id="tenant"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-emerald-500/30 focus:ring-2"
              autoComplete="organization"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              placeholder="default"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400" htmlFor="email">
              E-posta
            </label>
            <input
              id="email"
              type="email"
              required
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-emerald-500/30 focus:ring-2"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400" htmlFor="password">
              Şifre
            </label>
            <input
              id="password"
              type="password"
              required
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-emerald-500/30 focus:ring-2"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error ? (
            <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? 'Giriş…' : 'Giriş'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Hesabınız yok mu?{' '}
          <Link to="/signup" className="text-emerald-400 hover:underline">
            Kayıt ol
          </Link>
        </p>
      </div>
    </div>
  )
}
