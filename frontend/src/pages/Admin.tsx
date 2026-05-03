import { useCallback, useEffect, useState } from 'react'

import { GlobalCard, GlobalCardHeader } from '../components/ui/GlobalCard'
import { PageLayout } from '../components/ui/PageLayout'
import { inputFieldClass, primaryButtonClass, selectFieldClass, tableCellClass, tableHeaderClass, tableRowHoverClass } from '../components/ui/forms'
import { useAuth } from '../context/AuthContext'
import { api, getApiErrorMessage, type AuthUserRow } from '../lib/api'

const ADMIN_ACCESS = 'admin.access'

export default function AdminPage() {
  const { hasPermission } = useAuth()
  const [users, setUsers] = useState<AuthUserRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'manager' | 'employee'>('employee')
  const [formError, setFormError] = useState<string | null>(null)
  const [formOk, setFormOk] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    setLoadError(null)
    const { data } = await api.get<AuthUserRow[]>('/auth/users')
    setUsers(data)
  }, [])

  useEffect(() => {
    if (!hasPermission(ADMIN_ACCESS)) return
    void loadUsers().catch((e) => setLoadError(getApiErrorMessage(e, 'Liste alınamadı.')))
  }, [hasPermission, loadUsers])

  if (!hasPermission(ADMIN_ACCESS)) {
    return (
      <PageLayout title="Yönetim" subtitle="Bu alan yalnızca yetkili roller içindir.">
        <GlobalCard>
          <p className="text-center text-sm text-amber-900 dark:text-amber-100">
            Bu sayfaya yalnızca yönetici rolü erişebilir.
          </p>
        </GlobalCard>
      </PageLayout>
    )
  }

  async function onCreateUser(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setFormOk(null)
    setBusy(true)
    try {
      await api.post<AuthUserRow>('/auth/users', {
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
      })
      setFormOk('Kullanıcı oluşturuldu.')
      setNewEmail('')
      setNewPassword('')
      setNewRole('employee')
      await loadUsers()
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err, 'Kayıt başarısız.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageLayout
      title="Yönetim paneli"
      subtitle="Kiracı kullanıcıları — en kapsamlı yönetim görünümü (admin)."
    >
      <GlobalCard>
        <GlobalCardHeader
          title="Yeni kullanıcı"
          description="Şifre en az 8 karakter, bir büyük harf ve bir rakam içermelidir."
        />
        <form className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={onCreateUser}>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="nu-email">
              E-posta
            </label>
            <input
              id="nu-email"
              type="email"
              required
              className={inputFieldClass + ' mt-1'}
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="nu-pass">
              Şifre
            </label>
            <input
              id="nu-pass"
              type="password"
              required
              minLength={8}
              className={inputFieldClass + ' mt-1'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="nu-role">
              Rol
            </label>
            <select
              id="nu-role"
              className={selectFieldClass + ' mt-1'}
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as typeof newRole)}
            >
              <option value="employee">Çalışan</option>
              <option value="manager">Müdür / operasyon</option>
              <option value="admin">Tam yetki (admin)</option>
            </select>
          </div>
          <div className="flex items-end sm:col-span-2 lg:col-span-4">
            <button type="submit" disabled={busy} className={primaryButtonClass}>
              {busy ? 'Kaydediliyor…' : 'Kullanıcı ekle'}
            </button>
          </div>
        </form>
        {formError ? <p className="mt-3 text-sm text-rose-700 dark:text-rose-300">{formError}</p> : null}
        {formOk ? <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{formOk}</p> : null}
      </GlobalCard>

      <GlobalCard>
        <GlobalCardHeader title="Kullanıcı listesi" />
        {loadError ? <p className="mb-2 text-sm text-rose-700 dark:text-rose-300">{loadError}</p> : null}
        <div className="-mx-5 overflow-x-auto border-t border-slate-100 dark:border-white/5">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className={`border-b border-slate-200 dark:border-white/10 ${tableHeaderClass}`}>
                <th className="py-2 pr-4">ID</th>
                <th className="py-2 pr-4">E-posta</th>
                <th className="py-2 pr-4">Rol</th>
                <th className="py-2">Aktif</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={tableRowHoverClass + ' border-b border-slate-100 dark:border-white/5'}>
                  <td className="py-2 pr-4 font-mono text-slate-500 dark:text-slate-400">{u.id}</td>
                  <td className={`py-2 pr-4 ${tableCellClass}`}>{u.email}</td>
                  <td className={`py-2 pr-4 ${tableCellClass}`}>{u.role}</td>
                  <td className={`py-2 ${tableCellClass}`}>{u.is_active ? 'Evet' : 'Hayır'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlobalCard>
    </PageLayout>
  )
}
