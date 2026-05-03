import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'

export default function SignupPage() {
  const { user, loading, signup, error } = useAuth()
  const navigate = useNavigate()

  const [organizationName, setOrganizationName] = useState('')
  const [fullName, setFullName] = useState('')
  const [department, setDepartment] = useState('')
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
      await signup({
        organization_name: organizationName.trim(),
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        department: department.trim() || undefined,
      })
      navigate('/dashboard', { replace: true })
    } catch {
      // Hata context.error ile
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-950 to-slate-900 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950/80 p-8 shadow-xl backdrop-blur">
        <h1 className="text-center text-xl font-semibold text-slate-100">Hesap oluştur</h1>
        <p className="mt-1 text-center text-sm text-slate-400">
          Yeni şirket ve ilk yönetici hesabı. Giriş yaparken oluşturulan şirket kodunu kullanın.
        </p>

        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="block text-xs font-medium text-slate-400" htmlFor="org">
              Şirket / organizasyon adı
            </label>
            <input
              id="org"
              required
              minLength={2}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-emerald-500/30 focus:ring-2"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400" htmlFor="fullname">
              Ad soyad
            </label>
            <input
              id="fullname"
              required
              minLength={1}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-emerald-500/30 focus:ring-2"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400" htmlFor="dept">
              Departman (isteğe bağlı)
            </label>
            <input
              id="dept"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-emerald-500/30 focus:ring-2"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
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
              autoComplete="email"
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
              minLength={8}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-emerald-500/30 focus:ring-2"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-slate-500">
              En az 8 karakter, bir büyük harf ve bir rakam.
            </p>
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
            {busy ? 'Kayıt…' : 'Kayıt ol'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Zaten hesabınız var mı?{' '}
          <Link to="/login" className="text-emerald-400 hover:underline">
            Giriş
          </Link>
        </p>
      </div>
    </div>
  )
}
