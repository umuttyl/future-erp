import { useCallback, useEffect, useState } from 'react'

import { api, getApiErrorMessage, type AuthUserRow } from '../lib/api'
import { useAuth } from '../context/AuthContext'

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
      <div className="rounded-xl border border-amber-900/40 bg-amber-950/30 px-6 py-8 text-center text-amber-100">
        Bu sayfaya yalnızca yönetici rolü erişebilir.
      </div>
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
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'Kayıt başarısız.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-50">Yönetim paneli</h1>
        <p className="mt-1 text-sm text-slate-400">
          Kiracı kullanıcıları — en kapsamlı yönetim görünümü (admin).
        </p>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
        <h2 className="text-lg font-medium text-slate-100">Yeni kullanıcı</h2>
        <p className="mt-1 text-xs text-slate-500">
          Şifre en az 8 karakter, bir büyük harf ve bir rakam içermelidir.
        </p>
        <form className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={onCreateUser}>
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400" htmlFor="nu-email">
              E-posta
            </label>
            <input
              id="nu-email"
              type="email"
              required
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400" htmlFor="nu-pass">
              Şifre
            </label>
            <input
              id="nu-pass"
              type="password"
              required
              minLength={8}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400" htmlFor="nu-role">
              Rol
            </label>
            <select
              id="nu-role"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as typeof newRole)}
            >
              <option value="employee">Çalışan</option>
              <option value="manager">Müdür / operasyon</option>
              <option value="admin">Tam yetki (admin)</option>
            </select>
          </div>
          <div className="flex items-end sm:col-span-2 lg:col-span-4">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy ? 'Kaydediliyor…' : 'Kullanıcı ekle'}
            </button>
          </div>
        </form>
        {formError ? <p className="mt-3 text-sm text-red-300">{formError}</p> : null}
        {formOk ? <p className="mt-3 text-sm text-emerald-300">{formOk}</p> : null}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
        <h2 className="text-lg font-medium text-slate-100">Kullanıcı listesi</h2>
        {loadError ? <p className="mt-2 text-sm text-red-300">{loadError}</p> : null}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase text-slate-500">
                <th className="py-2 pr-4">ID</th>
                <th className="py-2 pr-4">E-posta</th>
                <th className="py-2 pr-4">Rol</th>
                <th className="py-2">Aktif</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-800/60">
                  <td className="py-2 pr-4 font-mono text-slate-400">{u.id}</td>
                  <td className="py-2 pr-4">{u.email}</td>
                  <td className="py-2 pr-4">{u.role}</td>
                  <td className="py-2">{u.is_active ? 'Evet' : 'Hayır'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
