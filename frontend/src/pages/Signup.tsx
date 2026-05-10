import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import {
  AuthSplitLayout,
  authInputClass,
  authLinkClass,
  authPrimaryButtonClass,
  authSelectFieldClass,
} from '../components/auth/AuthSplitLayout'
import { useAuth } from '../context/AuthContext'

const DEPARTMENTS = [
  { value: '', label: 'Seçiniz (isteğe bağlı)' },
  { value: 'Yönetim', label: 'Yönetim' },
  { value: 'Satış', label: 'Satış' },
  { value: 'Finans', label: 'Finans' },
  { value: 'İnsan Kaynakları', label: 'İnsan Kaynakları' },
  { value: 'Tedarik', label: 'Tedarik' },
  { value: 'Bilişim (IT)', label: 'Bilişim (IT)' },
] as const

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
      <AuthSplitLayout cardTitle="Yükleniyor" cardDescription="Oturum bilgileri kontrol ediliyor…" cardWide>
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
      await signup({
        organization_name: organizationName.trim(),
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        department: department || undefined,
      })
      navigate('/dashboard', { replace: true })
    } catch {
      /* context.error */
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthSplitLayout
      cardTitle="Hesap oluştur"
      cardDescription="Yeni şirket ve ilk yönetici hesabı. Girişte oluşturulan şirket kodunu kullanın."
      cardWide
    >
      <form className="mt-8 space-y-5" onSubmit={onSubmit}>
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="org">
            Şirket / organizasyon adı
          </label>
          <input
            id="org"
            required
            minLength={2}
            className={authInputClass}
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="fullname">
            Ad soyad
          </label>
          <input
            id="fullname"
            required
            minLength={1}
            className={authInputClass}
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="dept">
            Departman
          </label>
          <div className="relative mt-1.5">
            <select
              id="dept"
              className={authSelectFieldClass}
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              {DEPARTMENTS.map((d) => (
                <option key={d.value || 'none'} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              aria-hidden
            />
          </div>
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
            autoComplete="email"
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
            minLength={8}
            className={authInputClass}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            En az 8 karakter, bir büyük harf ve bir rakam.
          </p>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <button type="submit" disabled={busy} className={authPrimaryButtonClass}>
          {busy ? 'Kayıt yapılıyor…' : 'Kayıt ol'}
        </button>
      </form>

      <p className="mt-8 text-center text-xs text-slate-500 dark:text-slate-400">
        Zaten hesabınız var mı?{' '}
        <Link to="/login" className={authLinkClass}>
          Giriş yap
        </Link>
      </p>
    </AuthSplitLayout>
  )
}
