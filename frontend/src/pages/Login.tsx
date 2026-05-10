import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'

import {
  AuthSplitLayout,
  authInputClass,
  authLinkClass,
  authPrimaryButtonClass,
} from '../components/auth/AuthSplitLayout'
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
      <AuthSplitLayout cardTitle="Yükleniyor" cardDescription="Oturum bilgileri kontrol ediliyor…">
        <div className="mt-8 flex justify-center py-10">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600 dark:border-slate-600 dark:border-t-indigo-400"
            role="status"
            aria-label="Yükleniyor"
          />
        </div>
      </AuthSplitLayout>
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
      /* context.error */
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthSplitLayout
      cardTitle="Giriş yap"
      cardDescription="Şirket kodunuz ve hesap bilgilerinizle oturum açın."
    >
      {import.meta.env.DEV ? (
        <p className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/80 px-3 py-2.5 text-[11px] leading-relaxed text-indigo-900/80 dark:border-indigo-500/20 dark:bg-indigo-950/40 dark:text-indigo-100/80">
          Geliştirme (kiracı: <span className="font-mono">default</span>):<br />
          <span className="font-mono">admin@demo.example.com</span> / Admin12345 —{' '}
          <span className="font-mono">manager@demo.example.com</span> / Manager12345 —{' '}
          <span className="font-mono">employee@demo.example.com</span> / Employee12345
        </p>
      ) : null}

      <form className="mt-8 space-y-5" onSubmit={onSubmit}>
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="tenant">
            Şirket kodu
          </label>
          <input
            id="tenant"
            className={authInputClass}
            autoComplete="organization"
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
            placeholder="default"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="email">
            E-posta
          </label>
          <input
            id="email"
            type="email"
            required
            className={authInputClass}
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="password">
            Şifre
          </label>
          <input
            id="password"
            type="password"
            required
            className={authInputClass}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <button type="submit" disabled={busy} className={authPrimaryButtonClass}>
          {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
        </button>
      </form>

      <p className="mt-8 text-center text-xs text-slate-500 dark:text-slate-400">
        Hesabınız yok mu?{' '}
        <Link to="/signup" className={authLinkClass}>
          Kayıt ol
        </Link>
      </p>
    </AuthSplitLayout>
  )
}
