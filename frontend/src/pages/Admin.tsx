/**
 * Yönetim sayfası — role-based:
 *   admin   → Platform Kontrol Paneli (tüm şirketler + kullanıcılar)
 *   manager → Ekip Yönetimi (kendi tenant'ının kullanıcıları)
 */
import { useCallback, useEffect, useState } from 'react'
import { Building2, CheckCircle2, ChevronDown, ChevronRight, LogIn, Pencil, Shield, Trash2, Users, X, Zap } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { startImpersonation } from '../lib/impersonation'

import { GlobalCard, GlobalCardHeader } from '../components/ui/GlobalCard'
import { PageLayout } from '../components/ui/PageLayout'
import {
  inputFieldClass,
  primaryButtonClass,
  selectFieldClass,
  tableCellClass,
  tableHeaderClass,
  tableRowHoverClass,
} from '../components/ui/forms'
import { useAuth } from '../context/AuthContext'
import { api, getApiErrorMessage, type AuthUserRow } from '../lib/api'

// ---------------------------------------------------------------------------
// Tenant types & fetchers (admin only)
// ---------------------------------------------------------------------------

type TenantRow = {
  id: number
  name: string
  slug: string
  is_active: boolean
  sector: string | null
  active_modules: string[]
  onboarding_completed: boolean
  user_count: number
}

type PlatformStats = {
  total_tenants: number
  active_tenants: number
  total_users: number
  onboarded_tenants: number
}

async function fetchPlatformStats(): Promise<PlatformStats> {
  const { data } = await api.get<PlatformStats>('/admin/stats')
  return data
}

async function fetchTenants(): Promise<TenantRow[]> {
  const { data } = await api.get<TenantRow[]>('/admin/tenants')
  return data
}

async function patchTenant(id: number, patch: { is_active?: boolean }): Promise<void> {
  await api.patch(`/admin/tenants/${id}`, patch)
}

async function fetchTenantUsers(id: number): Promise<AuthUserRow[]> {
  const { data } = await api.get<AuthUserRow[]>(`/admin/tenants/${id}/users`)
  return data
}

// ---------------------------------------------------------------------------
// Edit & Delete modals (shared)
// ---------------------------------------------------------------------------

interface EditState {
  user: AuthUserRow
  role: 'admin' | 'manager' | 'employee'
  full_name: string
  department: string
  is_active: boolean
}

function EditModal({ state, onClose, onSaved }: { state: EditState; onClose: () => void; onSaved: () => void }) {
  const [role, setRole]         = useState<EditState['role']>(state.role)
  const [fullName, setFullName] = useState(state.full_name)
  const [department, setDep]    = useState(state.department)
  const [isActive, setIsActive] = useState(state.is_active)
  const [busy, setBusy]         = useState(false)
  const [err, setErr]           = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      await api.patch(`/auth/users/${state.user.id}`, { role, full_name: fullName, department, is_active: isActive })
      onSaved()
    } catch (e: unknown) {
      setErr(getApiErrorMessage(e, 'Güncelleme başarısız.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1a1628]" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10" aria-label="Kapat">
          <X className="h-4 w-4" />
        </button>
        <div className="border-b border-slate-100 px-6 py-5 dark:border-white/10">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Kullanıcı düzenle</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{state.user.email}</p>
        </div>
        <form className="grid gap-4 px-6 py-5" onSubmit={onSubmit}>
          <div>
            <label htmlFor="em-name" className="text-xs font-medium text-slate-600 dark:text-slate-400">Ad Soyad</label>
            <input id="em-name" type="text" className={inputFieldClass + ' mt-1'} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="em-dept" className="text-xs font-medium text-slate-600 dark:text-slate-400">Departman</label>
            <input id="em-dept" type="text" className={inputFieldClass + ' mt-1'} value={department} onChange={(e) => setDep(e.target.value)} />
          </div>
          <div>
            <label htmlFor="em-role" className="text-xs font-medium text-slate-600 dark:text-slate-400">Rol</label>
            <select id="em-role" className={selectFieldClass + ' mt-1'} value={role} onChange={(e) => setRole(e.target.value as EditState['role'])}>
              <option value="employee">Çalışan</option>
              <option value="manager">Müdür / Şirket sahibi</option>
              <option value="admin">Platform Admin (tam yetki)</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="ea-active" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            <label htmlFor="ea-active" className="text-sm text-slate-700 dark:text-slate-300">Aktif</label>
          </div>
          {err && <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">İptal</button>
            <button type="submit" disabled={busy} className={primaryButtonClass + ' px-4 py-2 text-sm'}>
              {busy ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// User table (shared between admin and manager views)
// ---------------------------------------------------------------------------

function UserTable({
  users,
  onEdit,
  onDelete,
  loadError,
}: {
  users: AuthUserRow[]
  onEdit: (u: AuthUserRow) => void
  onDelete: (u: AuthUserRow) => void
  loadError: string | null
}) {
  const roleBadge = (r: string) => {
    const cfg = {
      admin:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      manager:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      employee: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    }[r] ?? 'bg-slate-100 text-slate-500'
    const label = { admin: 'Admin', manager: 'Müdür', employee: 'Çalışan' }[r] ?? r
    return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cfg}`}>{label}</span>
  }

  return (
    <>
      {loadError && <p className="mb-2 text-sm text-rose-700 dark:text-rose-300">{loadError}</p>}
      <div className="-mx-5 overflow-x-auto border-t border-slate-100 dark:border-white/5">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className={`border-b border-slate-200 dark:border-white/10 ${tableHeaderClass}`}>
              <th className="py-2 pr-4">ID</th>
              <th className="py-2 pr-4">E-posta</th>
              <th className="py-2 pr-4">Ad Soyad</th>
              <th className="py-2 pr-4">Rol</th>
              <th className="py-2 pr-4">Aktif</th>
              <th className="py-2">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm text-slate-400">Henüz kullanıcı yok</td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className={tableRowHoverClass + ' border-b border-slate-100 dark:border-white/5'}>
                <td className="py-2 pr-4 font-mono text-slate-500 dark:text-slate-400">{u.id}</td>
                <td className={`py-2 pr-4 ${tableCellClass}`}>{u.email}</td>
                <td className={`py-2 pr-4 ${tableCellClass}`}>{u.full_name ?? '—'}</td>
                <td className="py-2 pr-4">{roleBadge(u.role)}</td>
                <td className={`py-2 pr-4 ${tableCellClass}`}>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-slate-100 text-slate-500'}`}>
                    {u.is_active ? 'Aktif' : 'Pasif'}
                  </span>
                </td>
                <td className="py-2">
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => onEdit(u)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-violet-50 hover:text-violet-600 dark:text-slate-400 dark:hover:bg-violet-500/10 dark:hover:text-violet-300"
                      aria-label="Düzenle">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => onDelete(u)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                      aria-label="Sil">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Create user form (shared)
// ---------------------------------------------------------------------------

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole]         = useState<'admin' | 'manager' | 'employee'>('employee')
  const [busy, setBusy]         = useState(false)
  const [err, setErr]           = useState<string | null>(null)
  const [ok, setOk]             = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setOk(null)
    setBusy(true)
    try {
      await api.post<AuthUserRow>('/auth/users', { email: email.trim(), password, role })
      setOk('Kullanıcı oluşturuldu.')
      setEmail(''); setPassword(''); setRole('employee')
      onCreated()
    } catch (e: unknown) {
      setErr(getApiErrorMessage(e, 'Kayıt başarısız.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <GlobalCard>
      <GlobalCardHeader title="Yeni kullanıcı ekle" description="Şifre en az 8 karakter, bir büyük harf ve bir rakam içermelidir." />
      <form className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={onSubmit}>
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="nu-email">E-posta</label>
          <input id="nu-email" type="email" required className={inputFieldClass + ' mt-1'} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="nu-pass">Şifre</label>
          <input id="nu-pass" type="password" required minLength={8} className={inputFieldClass + ' mt-1'} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="nu-role">Rol</label>
          <select id="nu-role" className={selectFieldClass + ' mt-1'} value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="employee">Çalışan</option>
            <option value="manager">Müdür / Şirket sahibi</option>
            <option value="admin">Platform Admin</option>
          </select>
        </div>
        <div className="flex items-end sm:col-span-2 lg:col-span-4">
          <button type="submit" disabled={busy} className={primaryButtonClass}>
            {busy ? 'Kaydediliyor…' : 'Kullanıcı Ekle'}
          </button>
        </div>
      </form>
      {err && <p className="mt-3 text-sm text-rose-700 dark:text-rose-300">{err}</p>}
      {ok  && <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{ok}</p>}
    </GlobalCard>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const { user, hasPermission } = useAuth()
  const navigate = useNavigate()
  const role = user?.role ?? 'manager'

  const [users,        setUsers]       = useState<AuthUserRow[]>([])
  const [loadError,    setLoadError]   = useState<string | null>(null)
  const [editState,    setEditState]   = useState<EditState | null>(null)
  const [deleteTarget, setDeleteTarget]= useState<AuthUserRow | null>(null)
  const [deleting,     setDeleting]    = useState(false)

  // Admin-only state
  const [tenants,         setTenants]        = useState<TenantRow[]>([])
  const [stats,           setStats]          = useState<PlatformStats | null>(null)
  const [tenantBusy,      setTenantBusy]     = useState<number | null>(null)
  const [expandedTenant,  setExpandedTenant] = useState<number | null>(null)
  const [tenantUsers,     setTenantUsers]    = useState<Record<number, AuthUserRow[]>>({})

  const loadUsers = useCallback(async () => {
    setLoadError(null)
    try {
      const { data } = await api.get<AuthUserRow[]>('/auth/users')
      setUsers(data)
    } catch (e: unknown) {
      setLoadError(getApiErrorMessage(e, 'Liste alınamadı.'))
    }
  }, [])

  const loadAdminData = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([fetchPlatformStats(), fetchTenants()])
      setStats(s)
      setTenants(t)
    } catch {
      // sessizce geç
    }
  }, [])

  useEffect(() => {
    if (!hasPermission('admin.users.read')) return
    void loadUsers()
    if (role === 'admin') void loadAdminData()
  }, [hasPermission, loadUsers, loadAdminData, role])

  async function onConfirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/auth/users/${deleteTarget.id}`)
      setDeleteTarget(null)
      await loadUsers()
    } catch (e: unknown) {
      setLoadError(getApiErrorMessage(e, 'Silme başarısız.'))
    } finally {
      setDeleting(false)
    }
  }

  if (!hasPermission('admin.users.read')) {
    return (
      <PageLayout title="Yönetim" subtitle="Bu alan yalnızca yetkili roller içindir.">
        <GlobalCard>
          <p className="text-center text-sm text-amber-900 dark:text-amber-100">Bu sayfaya erişim yetkiniz yok.</p>
        </GlobalCard>
      </PageLayout>
    )
  }

  // ---------------------------------------------------------------------------
  // Shared modals
  // ---------------------------------------------------------------------------
  const modals = (
    <>
      {editState && (
        <EditModal
          state={editState}
          onClose={() => setEditState(null)}
          onSaved={() => { setEditState(null); void loadUsers() }}
        />
      )}
      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#1a1628]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Kullanıcıyı sil?</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              <strong>{deleteTarget.email}</strong> adlı kullanıcı kalıcı olarak silinecek.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">İptal</button>
              <button type="button" disabled={deleting} onClick={() => void onConfirmDelete()} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60">
                {deleting ? 'Siliniyor…' : 'Sil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  // ---------------------------------------------------------------------------
  // ADMIN view — Platform Kontrol Paneli
  // ---------------------------------------------------------------------------
  if (role === 'admin') {
    const sectorLabel: Record<string, string> = {
      retail: 'Perakende', restaurant: 'Restoran', service: 'Hizmet',
      production: 'Üretim', construction: 'İnşaat', other: 'Diğer',
    }

    async function toggleTenant(t: TenantRow) {
      setTenantBusy(t.id)
      try {
        await patchTenant(t.id, { is_active: !t.is_active })
        await loadAdminData()
      } catch {
        // sessizce geç
      } finally {
        setTenantBusy(null)
      }
    }

    async function toggleExpand(id: number) {
      if (expandedTenant === id) {
        setExpandedTenant(null)
        return
      }
      setExpandedTenant(id)
      if (!tenantUsers[id]) {
        try {
          const users = await fetchTenantUsers(id)
          setTenantUsers((prev) => ({ ...prev, [id]: users }))
        } catch {
          setTenantUsers((prev) => ({ ...prev, [id]: [] }))
        }
      }
    }

    return (
      <PageLayout
        title="Platform Kontrol Paneli"
        subtitle="Tüm şirketler, kullanıcılar ve sistem ayarları — tam yönetici erişimi."
      >
        {modals}

        {/* Platform stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Toplam Şirket',    value: stats ? String(stats.total_tenants)    : '—', icon: Building2, color: 'text-violet-600 bg-violet-100 dark:bg-violet-900/30' },
            { label: 'Aktif Şirket',     value: stats ? String(stats.active_tenants)   : '—', icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30' },
            { label: 'Toplam Kullanıcı', value: stats ? String(stats.total_users)      : '—', icon: Users,    color: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/30' },
            { label: 'Platform Güvenliği', value: 'Aktif',                                     icon: Shield,   color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30' },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${s.color}`}>
                <s.icon className="h-5 w-5" strokeWidth={2} />
              </div>
              <div>
                <div className="text-xl font-bold text-slate-900 dark:text-white">{s.value}</div>
                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tenant list */}
        <GlobalCard>
          <GlobalCardHeader
            title="Kayıtlı Şirketler"
            description={`${tenants.length} şirket platformda kayıtlı`}
          />
          <div className="-mx-5 overflow-x-auto border-t border-slate-100 dark:border-white/5">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={`border-b border-slate-200 dark:border-white/10 ${tableHeaderClass}`}>
                  <th className="py-2 pr-2 w-8" aria-label="Detay"></th>
                  <th className="py-2 pr-4">Şirket</th>
                  <th className="py-2 pr-4">Sektör</th>
                  <th className="py-2 pr-4">Kullanıcı</th>
                  <th className="py-2 pr-4">Onboarding</th>
                  <th className="py-2 pr-4">Durum</th>
                  <th className="py-2">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {tenants.length === 0 && (
                  <tr><td colSpan={7} className="py-6 text-center text-sm text-slate-400">Henüz şirket yok</td></tr>
                )}
                {tenants.map((t) => (
                  <>
                    <tr key={t.id} className={`${tableRowHoverClass} border-b border-slate-100 dark:border-white/5 cursor-pointer`} onClick={() => void toggleExpand(t.id)}>
                      <td className="py-2 pr-2 pl-1">
                        {expandedTenant === t.id
                          ? <ChevronDown className="h-4 w-4 text-slate-400" />
                          : <ChevronRight className="h-4 w-4 text-slate-400" />}
                      </td>
                      <td className={`py-2 pr-4 ${tableCellClass}`}>
                        <div className="font-medium">{t.name}</div>
                        <div className="text-xs text-slate-400">{t.slug}</div>
                      </td>
                      <td className={`py-2 pr-4 ${tableCellClass}`}>
                        {t.sector ? sectorLabel[t.sector] ?? t.sector : <span className="text-slate-400">—</span>}
                      </td>
                      <td className={`py-2 pr-4 ${tableCellClass}`}>{t.user_count}</td>
                      <td className="py-2 pr-4">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t.onboarding_completed ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                          {t.onboarding_completed ? 'Tamamlandı' : 'Bekliyor'}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-slate-100 text-slate-500'}`}>
                          {t.is_active ? 'Aktif' : 'Pasif'}
                        </span>
                      </td>
                      <td className="py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              startImpersonation(t.id, t.name)
                              navigate('/dashboard')
                            }}
                            className="flex items-center gap-1 rounded-lg bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-800/40"
                            title={`${t.name} ERP sistemine gir`}
                          >
                            <LogIn className="h-3 w-3" />
                            Gir
                          </button>
                          <button
                            type="button"
                            disabled={tenantBusy === t.id}
                            onClick={() => void toggleTenant(t)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${t.is_active ? 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300'}`}
                          >
                            {tenantBusy === t.id ? '…' : t.is_active ? 'Pasif' : 'Aktif'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedTenant === t.id && (
                      <tr key={`${t.id}-expand`} className="bg-slate-50 dark:bg-slate-900/40">
                        <td colSpan={7} className="px-6 py-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {t.name} — Kullanıcılar
                          </p>
                          {!tenantUsers[t.id] ? (
                            <p className="text-xs text-slate-400">Yükleniyor…</p>
                          ) : tenantUsers[t.id].length === 0 ? (
                            <p className="text-xs text-slate-400">Kullanıcı bulunamadı.</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {tenantUsers[t.id].map((u) => (
                                <span key={u.id} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs dark:border-white/10 dark:bg-slate-800">
                                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${u.role === 'admin' ? 'bg-red-500' : u.role === 'manager' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                  <span className="font-medium text-slate-700 dark:text-slate-200">{u.email}</span>
                                  <span className="text-slate-400">·</span>
                                  <span className="text-slate-500 dark:text-slate-400">{{ admin: 'Admin', manager: 'Müdür', employee: 'Çalışan' }[u.role] ?? u.role}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </GlobalCard>

        {/* Role legend */}
        <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
          {[
            { role: 'admin', label: 'Platform Admin — tam sistem yetkisi', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
            { role: 'manager', label: 'Müdür — şirket ERP yönetimi', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
            { role: 'employee', label: 'Çalışan — kısıtlı erişim', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
          ].map((r) => (
            <div key={r.role} className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.cls}`}>{r.role}</span>
              <span>{r.label}</span>
            </div>
          ))}
        </div>

        <CreateUserForm onCreated={() => void loadUsers()} />

        <GlobalCard>
          <GlobalCardHeader title="Sistem Kullanıcıları" description={`${users.length} kayıtlı kullanıcı`} />
          <UserTable
            users={users}
            onEdit={(u) => setEditState({ user: u, role: u.role as EditState['role'], full_name: u.full_name ?? '', department: '', is_active: u.is_active })}
            onDelete={setDeleteTarget}
            loadError={loadError}
          />
        </GlobalCard>
      </PageLayout>
    )
  }

  // ---------------------------------------------------------------------------
  // MANAGER view — Ekip Yönetimi
  // ---------------------------------------------------------------------------
  return (
    <PageLayout
      title="Ekip Yönetimi"
      subtitle="Şirketinizdeki kullanıcıları yönetin, rol ve erişim atayın."
    >
      {modals}

      {/* Manager info banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-950/30">
        <Zap className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div>
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">Şirket Yöneticisi</p>
          <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
            Çalışan ve müdür hesapları oluşturabilir, rol atayabilir ve kullanıcıları yönetebilirsiniz.
            Modül ayarları için{' '}
            <Link to="/settings" className="font-medium underline hover:no-underline">Modül Ayarları</Link>{' '}
            sayfasına gidin.
          </p>
        </div>
      </div>

      <CreateUserForm onCreated={() => void loadUsers()} />

      <GlobalCard>
        <GlobalCardHeader
          title="Ekip Üyeleri"
          description={`${users.length} kullanıcı — şirketinizdeki tüm hesaplar`}
        />
        <UserTable
          users={users}
          onEdit={(u) => setEditState({ user: u, role: u.role as EditState['role'], full_name: u.full_name ?? '', department: '', is_active: u.is_active })}
          onDelete={setDeleteTarget}
          loadError={loadError}
        />
      </GlobalCard>
    </PageLayout>
  )
}
