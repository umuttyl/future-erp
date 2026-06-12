/**
 * Yönetim sayfası — role-based:
 *   admin   → Platform Kontrol Paneli (tüm şirketler + kullanıcılar)
 *   manager → Ekip Yönetimi (kendi tenant'ının kullanıcıları)
 */
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, Brain, Building2, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, KeyRound, LogIn, Package, Pencil, Plus, Shield, ShoppingCart, Trash2, Users, Wallet, X, Zap } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
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
import { api, fetchAuditLogs, fetchRoles, getApiErrorMessage, formatDate, formatNumber, type AuditLogOut, type AuthUserRow, type RoleOut } from '../lib/api'

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

// ADM-6: Cross-tenant kullanıcı satırı
type CrossTenantUserRow = AuthUserRow & {
  tenant_id: number
  tenant_name: string | null
}

// ADM-7: Sistem sağlığı
type HealthData = {
  status: string
  uptime_seconds: number
  db_ok: boolean
  tenant_count: number
  user_count: number
  sales_record_count: number
  product_count: number
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

// B: Admin tenant kullanıcı yönetimi
async function adminResetUserPassword(userId: number, newPassword: string): Promise<void> {
  await api.patch(`/admin/users/${userId}/password`, { new_password: newPassword })
}

async function adminSetUserStatus(userId: number, isActive: boolean): Promise<void> {
  await api.patch(`/admin/users/${userId}/status`, { is_active: isActive })
}

async function fetchTenantUsers(id: number): Promise<AuthUserRow[]> {
  const { data } = await api.get<AuthUserRow[]>(`/admin/tenants/${id}/users`)
  return data
}

// ADM-6: Tüm platform kullanıcıları (admin hariç)
async function fetchAllUsers(tenantId?: number, q?: string): Promise<CrossTenantUserRow[]> {
  const params: Record<string, string> = {}
  if (tenantId) params.tenant_id = String(tenantId)
  if (q?.trim()) params.q = q.trim()
  const { data } = await api.get<CrossTenantUserRow[]>('/admin/users', { params })
  return data
}

// ADM-7: Sistem sağlığı
async function fetchHealthData(): Promise<HealthData> {
  const { data } = await api.get<HealthData>('/admin/health')
  return data
}

// ---------------------------------------------------------------------------
// Audit Log Panel (admin only)
// ---------------------------------------------------------------------------

function AuditLogPanel() {
  const { t } = useTranslation()
  const [logs,       setLogs]      = useState<AuditLogOut[]>([])
  const [loading,    setLoading]   = useState(false)
  const [error,      setError]     = useState<string | null>(null)
  const [filterTenant, setFilterTenant] = useState('')
  const [filterAction, setFilterAction] = useState('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, unknown> = { limit: 200 }
      if (filterTenant.trim()) params.tenant_id = Number(filterTenant)
      if (filterAction.trim()) params.action = filterAction.trim()
      const data = await fetchAuditLogs(params as { tenant_id?: number; action?: string; limit?: number })
      setLogs(data)
    } catch {
      setError(t('admin.auditLoadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function exportCsv() {
    const headers = ['Date', 'Action', 'Tenant ID', 'User ID', 'Target', 'IP Address', 'Detail']
    const rows = logs.map((log) => [
      log.created_at.slice(0, 19).replace('T', ' '),
      log.action,
      log.actor_tenant_id ?? '',
      log.actor_user_id,
      log.target_entity_type ? `${log.target_entity_type} #${log.target_entity_id}` : '',
      log.ip_address ?? '',
      log.payload ? JSON.stringify(log.payload) : '',
    ])
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'audit_logs.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const actionBadgeClass = (action: string) => {
    if (action.startsWith('tenant')) return 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
    if (action.startsWith('sales')) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
    if (action.startsWith('orders')) return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
    if (action.startsWith('stock')) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
    if (action.startsWith('admin') || action.startsWith('auth')) return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
    return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
  }

  return (
    <GlobalCard>
      <GlobalCardHeader title={t('admin.auditTitle')} description={t('admin.auditDesc')} />
      <div className="flex flex-wrap items-end gap-3 mt-2 mb-4">
        <div>
          <label htmlFor="al-tenant" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('admin.tenantId')}</label>
          <input
            id="al-tenant"
            type="number"
            placeholder={t('admin.all')}
            className="mt-1 block w-28 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
            value={filterTenant}
            onChange={(e) => setFilterTenant(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="al-action" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('admin.actionFilter')}</label>
          <input
            id="al-action"
            type="text"
            placeholder={t('admin.actionFilterPlaceholder')}
            className="mt-1 block w-44 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
          disabled={loading}
        >
          {loading ? t('common.loading') : t('admin.filter')}
        </button>
        {logs.length > 0 && (
          <button
            type="button"
            onClick={exportCsv}
            className="ml-auto rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            Export CSV
          </button>
        )}
      </div>
      {error && <p className="mb-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="-mx-5 overflow-x-auto border-t border-slate-100 dark:border-white/5">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-white/10 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th className="py-2 pr-4 pl-5">{t('admin.colDate')}</th>
              <th className="py-2 pr-4">{t('admin.colAction')}</th>
              <th className="py-2 pr-4">{t('admin.colTenant')}</th>
              <th className="py-2 pr-4">{t('admin.colUser')}</th>
              <th className="py-2 pr-4">{t('admin.colRecord')}</th>
              <th className="py-2 pr-4">IP</th>
              <th className="py-2 pr-5">{t('admin.colDetail')}</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && !loading && (
              <tr><td colSpan={7} className="py-6 text-center text-sm text-slate-400">{t('admin.emptyLog')}</td></tr>
            )}
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5">
                <td className="py-2 pr-4 pl-5 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {formatDate(log.created_at)}{' '}
                  <span className="text-slate-400">{log.created_at.slice(11, 16)}</span>
                </td>
                <td className="py-2 pr-4">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${actionBadgeClass(log.action)}`}>
                    {log.action}
                  </span>
                </td>
                <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">
                  {log.actor_tenant_id != null ? log.actor_tenant_id : <span className="text-xs text-slate-400">admin</span>}
                </td>
                <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{log.actor_user_id}</td>
                <td className="py-2 pr-4 text-slate-500 dark:text-slate-400">
                  {log.target_entity_type
                    ? <span>{log.target_entity_type} #{log.target_entity_id}</span>
                    : <span className="text-slate-300 dark:text-slate-600">—</span>}
                </td>
                <td className="py-2 pr-4 font-mono text-xs text-slate-400">
                  {log.ip_address || <span className="text-slate-300 dark:text-slate-600">—</span>}
                </td>
                <td className="py-2 pr-5 font-mono text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate">
                  {log.payload ? JSON.stringify(log.payload) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlobalCard>
  )
}

// ---------------------------------------------------------------------------
// Confirm tenant toggle modal
// ---------------------------------------------------------------------------

function ConfirmTenantToggleModal({
  tenant,
  onConfirm,
  onCancel,
  busy,
}: {
  tenant: TenantRow
  onConfirm: () => void
  onCancel: () => void
  busy: boolean
}) {
  const action = tenant.is_active ? 'suspend' : 'activate'
  const actionLabel = tenant.is_active ? 'Suspend' : 'Activate'
  const bodyText = tenant.is_active
    ? `Suspending "${tenant.name}" will immediately block all logins for this company's users.`
    : `Activating "${tenant.name}" will restore access for all users of this company.`
  const confirmCls = tenant.is_active
    ? 'bg-rose-600 hover:bg-rose-700 text-white'
    : 'bg-emerald-600 hover:bg-emerald-700 text-white'

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#1a1628]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          {actionLabel} company?
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{bodyText}</p>
        <p className="mt-1 text-xs text-slate-400">This action is logged in the audit trail.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60 ${confirmCls}`}
            data-action={action}
          >
            {busy ? '…' : actionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Edit & Delete modals (shared)
// ---------------------------------------------------------------------------

interface EditState {
  user: AuthUserRow
  role_kind: 'owner' | 'staff'
  job_role_id: number | null
  full_name: string
  department: string
  is_active: boolean
}

function EditModal({ state, roles, onClose, onSaved }: { state: EditState; roles: RoleOut[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const [roleKind, setRoleKind] = useState<'owner' | 'staff'>(state.role_kind)
  const [pickerValue, setPickerValue] = useState<JobRolePickerValue>(
    state.job_role_id ? { kind: 'template', id: state.job_role_id } : null
  )
  const [fullName, setFullName] = useState(state.full_name)
  const [department, setDep]   = useState(state.department)
  const [isActive, setIsActive] = useState(state.is_active)
  const [busy, setBusy]         = useState(false)
  const [err, setErr]           = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (roleKind === 'staff' && !pickerValue) {
      setErr(t('admin.staffRoleRequired'))
      return
    }
    setBusy(true)
    try {
      let resolvedRoleId: number | null = null
      if (roleKind === 'staff' && pickerValue) {
        if (pickerValue.kind === 'template') {
          resolvedRoleId = pickerValue.id
        } else {
          const { createRole } = await import('../lib/api')
          const created = await createRole({ name: pickerValue.name, permissions: pickerValue.permissions })
          resolvedRoleId = created.id
        }
      }
      await api.patch(`/auth/users/${state.user.id}`, {
        role: roleKind === 'owner' ? 'manager' : 'employee',
        role_kind: roleKind,
        job_role_id: roleKind === 'staff' ? resolvedRoleId : null,
        full_name: fullName,
        department,
        is_active: isActive,
      })
      onSaved()
    } catch (e: unknown) {
      setErr(getApiErrorMessage(e, t('team.updateError')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1a1628]" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10" aria-label={t('common.close')}>
          <X className="h-4 w-4" />
        </button>
        <div className="border-b border-slate-100 px-6 py-5 dark:border-white/10">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t('team.editUser')}</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{state.user.email}</p>
        </div>
        <form className="max-h-[80vh] space-y-4 overflow-y-auto px-6 py-5" onSubmit={onSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="em-name" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('team.fullName')}</label>
              <input id="em-name" type="text" className={inputFieldClass + ' mt-1'} value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="em-dept" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('team.department')}</label>
              <input id="em-dept" type="text" className={inputFieldClass + ' mt-1'} value={department} onChange={(e) => setDep(e.target.value)} />
            </div>
          </div>

          {/* Hesap türü — radio */}
          <div>
            <label className="mb-2 block text-xs font-medium text-slate-600 dark:text-slate-400">{t('admin.type')}</label>
            <div className="flex gap-2">
              {(['staff', 'owner'] as const).map((kind) => (
                <label
                  key={kind}
                  className={[
                    'flex flex-1 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 transition-all',
                    roleKind === kind
                      ? 'border-violet-500 bg-violet-50 dark:border-violet-400/60 dark:bg-violet-900/20'
                      : 'border-slate-200 bg-white hover:border-violet-300 dark:border-white/10 dark:bg-[#12101f]',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="em-kind"
                    value={kind}
                    checked={roleKind === kind}
                    onChange={() => { setRoleKind(kind); setPickerValue(null) }}
                    className="accent-violet-600"
                  />
                  <div>
                    <p className={`text-xs font-semibold ${roleKind === kind ? 'text-violet-700 dark:text-violet-300' : 'text-slate-700 dark:text-slate-200'}`}>
                      {kind === 'staff' ? t('team.staffOption') : t('team.ownerOption')}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {kind === 'staff' ? 'Specific tasks' : 'Full access'}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {roleKind === 'staff' && (
            <div>
              <label className="mb-2 block text-xs font-medium text-slate-600 dark:text-slate-400">
                {t('team.roleTemplate')} <span className="text-rose-500">*</span>
              </label>
              <JobRolePicker roles={roles} value={pickerValue} onChange={setPickerValue} />
            </div>
          )}

          <div className="flex items-center gap-2">
            <input type="checkbox" id="ea-active" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-violet-600" />
            <label htmlFor="ea-active" className="text-sm text-slate-700 dark:text-slate-300">{t('common.active')}</label>
          </div>

          {err && <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">{t('common.cancel')}</button>
            <button type="submit" disabled={busy} className={primaryButtonClass + ' px-4 py-2 text-sm'}>
              {busy ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// B: Admin şifre sıfırlama modalı
// ---------------------------------------------------------------------------

function PasswordResetModal({ user, onClose, onDone }: { user: AuthUserRow; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation()
  const [pw, setPw]     = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState<string | null>(null)
  const [ok, setOk]     = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (pw.length < 8) { setErr(t('admin.passwordMin8')); return }
    setBusy(true)
    try {
      await adminResetUserPassword(user.id, pw)
      setOk(true)
      setTimeout(() => { onDone(); onClose() }, 900)
    } catch (e: unknown) {
      setErr(getApiErrorMessage(e, t('admin.passwordResetError')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#1a1628]" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10" aria-label={t('common.close')}>
          <X className="h-4 w-4" />
        </button>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{t('admin.passwordReset')}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('admin.passwordResetDesc', { email: user.email })}</p>
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <input type="password" autoFocus minLength={8} placeholder={t('admin.newPasswordPlaceholder')}
            className={inputFieldClass} value={pw} onChange={(e) => setPw(e.target.value)} />
          {err && <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p>}
          {ok && <p className="text-sm text-emerald-600 dark:text-emerald-400">{t('admin.passwordResetOk')}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">{t('common.cancel')}</button>
            <button type="submit" disabled={busy} className={primaryButtonClass + ' px-4 py-2 text-sm'}>
              {busy ? t('admin.resetting') : t('admin.reset')}
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
  roles,
  onEdit,
  onDelete,
  loadError,
  showTenantCol = false,
  onResetPassword,
  onToggleStatus,
}: {
  users: AuthUserRow[]
  roles: RoleOut[]
  onEdit: (u: AuthUserRow) => void
  onDelete: (u: AuthUserRow) => void
  loadError: string | null
  showTenantCol?: boolean
  // B: Admin cross-tenant aksiyonları — verilirse edit/delete yerine bunlar gösterilir
  onResetPassword?: (u: AuthUserRow) => void
  onToggleStatus?: (u: AuthUserRow) => void
}) {
  const { t } = useTranslation()
  const adminMode = !!(onResetPassword && onToggleStatus)
  const roleMap = new Map(roles.map((r) => [r.id, r.name]))
  const colSpan = showTenantCol ? 7 : 6

  const roleBadge = (u: AuthUserRow) => {
    const r = u.role
    const cfg = {
      admin:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      manager:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      employee: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    }[r] ?? 'bg-slate-100 text-slate-500'
    const label = { admin: t('admin.platformAdmin'), manager: t('admin.manager'), employee: t('admin.employee') }[r] ?? r
    const jobName = r === 'employee' && u.job_role_id ? roleMap.get(u.job_role_id) : null
    return (
      <div className="flex flex-col gap-0.5">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cfg}`}>{label}</span>
        {jobName && <span className="text-[10px] text-slate-500 dark:text-slate-400">{jobName}</span>}
      </div>
    )
  }

  return (
    <>
      {loadError && <p className="mb-2 text-sm text-rose-700 dark:text-rose-300">{loadError}</p>}
      <div className="-mx-5 overflow-x-auto border-t border-slate-100 dark:border-white/5">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className={`border-b border-slate-200 dark:border-white/10 ${tableHeaderClass}`}>
              <th className="py-2 pr-4">ID</th>
              <th className="py-2 pr-4">{t('common.email')}</th>
              <th className="py-2 pr-4">{t('admin.colFullName')}</th>
              {showTenantCol && <th className="py-2 pr-4">{t('admin.colTenant')}</th>}
              <th className="py-2 pr-4">{t('admin.colRole')}</th>
              <th className="py-2 pr-4">{t('admin.colActive')}</th>
              <th className="py-2">{t('admin.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="py-6 text-center text-sm text-slate-400">{t('admin.emptyUsers')}</td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className={tableRowHoverClass + ' border-b border-slate-100 dark:border-white/5'}>
                <td className="py-2 pr-4 font-mono text-slate-500 dark:text-slate-400">{u.id}</td>
                <td className={`py-2 pr-4 ${tableCellClass}`}>{u.email}</td>
                <td className={`py-2 pr-4 ${tableCellClass}`}>{u.full_name ?? '—'}</td>
                {showTenantCol && (
                  <td className="py-2 pr-4">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {(u as CrossTenantUserRow).tenant_name ?? `#${(u as CrossTenantUserRow).tenant_id}`}
                    </span>
                  </td>
                )}
                <td className="py-2 pr-4">{roleBadge(u)}</td>
                <td className={`py-2 pr-4 ${tableCellClass}`}>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-slate-100 text-slate-500'}`}>
                    {u.is_active ? t('common.active') : t('common.passive')}
                  </span>
                </td>
                <td className="py-2">
                  <div className="flex items-center gap-1">
                    {adminMode ? (
                      <>
                        <button type="button" onClick={() => onResetPassword!(u)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-amber-50 hover:text-amber-600 dark:text-slate-400 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
                          aria-label={t('admin.resetPasswordTitle')} title={t('admin.resetPasswordTitle')}>
                          <KeyRound className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => onToggleStatus!(u)}
                          className={`flex h-8 w-8 items-center justify-center rounded-lg ${u.is_active ? 'text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400' : 'text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300'} dark:text-slate-400`}
                          aria-label={u.is_active ? t('admin.suspend') : t('admin.activate')} title={u.is_active ? t('admin.suspend') : t('admin.activate')}>
                          {u.is_active ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => onEdit(u)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-violet-50 hover:text-violet-600 dark:text-slate-400 dark:hover:bg-violet-500/10 dark:hover:text-violet-300"
                          aria-label={t('common.edit')}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => onDelete(u)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                          aria-label={t('common.delete')}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
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
// Permission groups — for visual display in JobRolePicker
// ---------------------------------------------------------------------------

type PermGroupDef = { key: string; label: string; Icon: typeof ShoppingCart; perms: string[] }

const PERM_GROUPS: PermGroupDef[] = [
  { key: 'sales',   label: 'Sales',              Icon: ShoppingCart,  perms: ['sales.read', 'sales.write'] },
  { key: 'crm',     label: 'Customers & Accounts', Icon: Building2,  perms: ['customers.read', 'customers.write', 'accounts.read', 'accounts.write'] },
  { key: 'stock',   label: 'Stock & Products',   Icon: Package,       perms: ['catalog.product.read', 'catalog.product.write', 'catalog.product.delete', 'stock.adjust'] },
  { key: 'orders',  label: 'Orders & Purchasing', Icon: ClipboardList, perms: ['orders.read', 'orders.write', 'suppliers.read'] },
  { key: 'finance', label: 'Finance & Cash',     Icon: Wallet,        perms: ['finance.read', 'cashbook.read', 'cashbook.write'] },
  { key: 'ai',      label: 'AI & Analytics',     Icon: Brain,         perms: ['ai.insights.read', 'nlp.query.execute', 'forecast.run'] },
  { key: 'hr',      label: 'Team & HR',          Icon: Users,         perms: ['hr.performance.read', 'hr.tasks.read', 'hr.tasks.write'] },
]

function groupsForPerms(perms: string[]): PermGroupDef[] {
  const set = new Set(perms)
  return PERM_GROUPS.filter((g) => g.perms.some((p) => set.has(p)))
}

// ---------------------------------------------------------------------------
// JobRolePicker — visual card selector replacing the plain <select>
// ---------------------------------------------------------------------------

type JobRolePickerValue =
  | { kind: 'template'; id: number }
  | { kind: 'custom'; name: string; permissions: string[] }
  | null

function JobRolePicker({
  roles,
  value,
  onChange,
}: {
  roles: RoleOut[]
  value: JobRolePickerValue
  onChange: (v: JobRolePickerValue) => void
}) {
  const [showCustom, setShowCustom] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customPerms, setCustomPerms] = useState<Set<string>>(new Set())

  const selectedTemplateId = value?.kind === 'template' ? value.id : null
  const selectedTemplate = roles.find((r) => r.id === selectedTemplateId) ?? null

  function selectTemplate(id: number) {
    setShowCustom(false)
    onChange({ kind: 'template', id })
  }

  function openCustom() {
    setShowCustom(true)
    onChange(null)
  }

  function togglePerm(perm: string) {
    setCustomPerms((prev) => {
      const next = new Set(prev)
      next.has(perm) ? next.delete(perm) : next.add(perm)
      const perms = Array.from(next)
      onChange(perms.length > 0 || customName.trim() ? { kind: 'custom', name: customName.trim() || 'Custom Role', permissions: perms } : null)
      return next
    })
  }

  function toggleGroup(group: PermGroupDef, checked: boolean) {
    setCustomPerms((prev) => {
      const next = new Set(prev)
      group.perms.forEach((p) => checked ? next.add(p) : next.delete(p))
      const perms = Array.from(next)
      onChange({ kind: 'custom', name: customName.trim() || 'Custom Role', permissions: perms })
      return next
    })
  }

  function onCustomNameChange(name: string) {
    setCustomName(name)
    if (showCustom) {
      onChange({ kind: 'custom', name: name.trim() || 'Custom Role', permissions: Array.from(customPerms) })
    }
  }

  const GROUP_COLORS: Record<string, string> = {
    sales:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    crm:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    stock:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    orders:  'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    finance: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    ai:      'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
    hr:      'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  }

  return (
    <div className="space-y-3">
      {/* Template cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {roles.map((role) => {
          const active = selectedTemplateId === role.id && !showCustom
          const groups = groupsForPerms(role.permissions)
          return (
            <button
              key={role.id}
              type="button"
              onClick={() => selectTemplate(role.id)}
              className={[
                'flex flex-col items-start rounded-xl border p-3 text-left transition-all',
                active
                  ? 'border-violet-500 bg-violet-50 shadow-sm dark:border-violet-400/60 dark:bg-violet-900/20'
                  : 'border-slate-200 bg-white hover:border-violet-300 hover:bg-slate-50 dark:border-white/10 dark:bg-[#1a1628] dark:hover:border-violet-500/40',
              ].join(' ')}
            >
              <div className="flex w-full items-center justify-between gap-1">
                <span className={`text-sm font-semibold ${active ? 'text-violet-700 dark:text-violet-300' : 'text-slate-800 dark:text-slate-100'}`}>
                  {role.name}
                </span>
                {role.is_system && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    ⭐
                  </span>
                )}
              </div>
              {/* Permission group pills */}
              <div className="mt-2 flex flex-wrap gap-1">
                {groups.slice(0, 3).map((g) => (
                  <span key={g.key} className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${GROUP_COLORS[g.key]}`}>
                    {g.label}
                  </span>
                ))}
                {groups.length > 3 && (
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/10 dark:text-slate-400">
                    +{groups.length - 3}
                  </span>
                )}
                {groups.length === 0 && (
                  <span className="text-[10px] text-slate-400">No permissions</span>
                )}
              </div>
            </button>
          )
        })}

        {/* Custom card */}
        <button
          type="button"
          onClick={openCustom}
          className={[
            'flex flex-col items-start rounded-xl border p-3 text-left transition-all',
            showCustom
              ? 'border-violet-500 bg-violet-50 shadow-sm dark:border-violet-400/60 dark:bg-violet-900/20'
              : 'border-dashed border-slate-300 bg-white hover:border-violet-400 hover:bg-slate-50 dark:border-white/15 dark:bg-[#1a1628] dark:hover:border-violet-500/40',
          ].join(' ')}
        >
          <div className="flex items-center gap-1.5">
            <Plus className={`h-3.5 w-3.5 ${showCustom ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400'}`} />
            <span className={`text-sm font-semibold ${showCustom ? 'text-violet-700 dark:text-violet-300' : 'text-slate-600 dark:text-slate-400'}`}>
              Custom Role
            </span>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500">
            Define permissions yourself
          </p>
        </button>
      </div>

      {/* Permission summary for selected template */}
      {selectedTemplate && !showCustom && (
        <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-white/8 dark:bg-white/3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            This employee's access
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PERM_GROUPS.map((g) => {
              const has = g.perms.some((p) => selectedTemplate.permissions.includes(p))
              return (
                <span
                  key={g.key}
                  className={[
                    'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
                    has
                      ? GROUP_COLORS[g.key]
                      : 'bg-slate-100 text-slate-400 line-through dark:bg-white/5 dark:text-slate-600',
                  ].join(' ')}
                >
                  <g.Icon className="h-3 w-3" strokeWidth={2} />
                  {g.label}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Custom permission panel */}
      {showCustom && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-500/20 dark:bg-violet-950/20">
          <div className="mb-3">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Role Name <span className="text-slate-400">(e.g. Cashier, Warehouse Operator)</span>
            </label>
            <input
              type="text"
              value={customName}
              onChange={(e) => onCustomNameChange(e.target.value)}
              placeholder="Enter role name…"
              className={`${inputFieldClass} mt-1`}
            />
          </div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Access Areas
          </p>
          <div className="space-y-2">
            {PERM_GROUPS.map((g) => {
              const allChecked = g.perms.every((p) => customPerms.has(p))
              const someChecked = g.perms.some((p) => customPerms.has(p))
              return (
                <div key={g.key} className="rounded-lg border border-slate-200/80 bg-white p-2.5 dark:border-white/8 dark:bg-[#1a1628]">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked }}
                      onChange={(e) => toggleGroup(g, e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 accent-violet-600"
                    />
                    <g.Icon className="h-3.5 w-3.5 text-slate-500" strokeWidth={2} />
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{g.label}</span>
                  </label>
                  {someChecked && (
                    <div className="mt-2 ml-6 flex flex-wrap gap-1">
                      {g.perms.map((p) => (
                        <label key={p} className="flex cursor-pointer items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600 hover:border-violet-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                          <input
                            type="checkbox"
                            checked={customPerms.has(p)}
                            onChange={() => togglePerm(p)}
                            className="h-3 w-3 accent-violet-600"
                          />
                          {p.replace(/\./g, ' › ')}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create user form (shared)
// ---------------------------------------------------------------------------

// Role option used in the simplified dropdown
type RoleOption =
  | { kind: 'owner' }
  | { kind: 'template'; id: number; name: string }

function CreateUserForm({ roles, adminMode, onCreated }: { roles: RoleOut[]; adminMode?: boolean; onCreated: () => void }) {
  const { t } = useTranslation()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [department, setDept]   = useState('')
  const [adminRole, setAdminRole] = useState<'admin' | 'manager' | 'employee'>('manager')
  // Simple role selection: "owner" or a template id (as string for select)
  const [selectedRole, setSelectedRole] = useState<string>('owner')
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState<string | null>(null)
  const [ok, setOk]     = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setOk(null)
    if (!adminMode && selectedRole === '') {
      setErr(t('admin.staffRoleRequired')); return
    }
    setBusy(true)
    try {
      const payload: Record<string, unknown> = {
        email: email.trim(),
        password,
        full_name: fullName.trim() || undefined,
        department: department.trim() || undefined,
      }

      if (adminMode) {
        payload.role = adminRole
      } else if (selectedRole === 'owner') {
        payload.role = 'manager'
        payload.role_kind = 'owner'
        payload.job_role_id = null
      } else {
        payload.role = 'employee'
        payload.role_kind = 'staff'
        payload.job_role_id = Number(selectedRole)
      }

      await api.post<AuthUserRow>('/auth/users', payload)
      setOk(t('admin.userCreated'))
      setEmail(''); setPassword(''); setFullName(''); setDept(''); setSelectedRole('owner')
      onCreated()
    } catch (e: unknown) {
      setErr(getApiErrorMessage(e, t('suppliers.saveError')))
    } finally {
      setBusy(false)
    }
  }

  const ROLE_DESCRIPTIONS: Record<string, string> = {
    owner:                 'Full access to all modules',
    Cashier:               'Sales, products, basic cashbook',
    'Warehouse Staff':     'Stock, orders, suppliers',
    'Sales Representative':'Sales, customers, products',
    'Finance Staff':       'Finance, cashbook, accounts',
  }

  return (
    <GlobalCard>
      <GlobalCardHeader
        title={t('admin.createTitle')}
        description={adminMode ? t('admin.createDescAdmin') : t('admin.createDescManager')}
      />
      <form className="mt-2 space-y-4" onSubmit={onSubmit}>
        {/* Row 1: Name, Email, Password */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="nu-name">{t('team.fullName')}</label>
            <input id="nu-name" type="text" className={inputFieldClass + ' mt-1'} value={fullName} placeholder={t('team.fullNamePlaceholder')} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="nu-email">{t('common.email')} <span className="text-rose-500">*</span></label>
            <input id="nu-email" type="email" required className={inputFieldClass + ' mt-1'} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="nu-pass">{t('auth.password')} <span className="text-rose-500">*</span></label>
            <input id="nu-pass" type="password" required minLength={8} className={inputFieldClass + ' mt-1'} value={password} placeholder="min. 8 characters" onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>

        {/* Row 2: Role + Department */}
        <div className="grid gap-4 sm:grid-cols-2">
          {adminMode ? (
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="nu-arole">{t('admin.role')} <span className="text-rose-500">*</span></label>
              <select id="nu-arole" className={selectFieldClass + ' mt-1'} value={adminRole} onChange={(e) => setAdminRole(e.target.value as 'admin' | 'manager' | 'employee')}>
                <option value="admin">{t('admin.platformAdmin')}</option>
                <option value="manager">{t('admin.manager')}</option>
                <option value="employee">{t('admin.employee')}</option>
              </select>
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="nu-role">Role <span className="text-rose-500">*</span></label>
              <select
                id="nu-role"
                className={selectFieldClass + ' mt-1'}
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
              >
                <option value="owner">Owner — full access</option>
                {roles.map((r) => (
                  <option key={r.id} value={String(r.id)}>{r.name}</option>
                ))}
              </select>
              {selectedRole && (
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  {selectedRole === 'owner'
                    ? ROLE_DESCRIPTIONS['owner']
                    : ROLE_DESCRIPTIONS[roles.find(r => String(r.id) === selectedRole)?.name ?? ''] ?? ''}
                </p>
              )}
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="nu-dept">{t('team.department')} <span className="text-[10px] text-slate-400">(optional)</span></label>
            <input id="nu-dept" type="text" className={inputFieldClass + ' mt-1'} value={department} placeholder="e.g. Sales, Warehouse…" onChange={(e) => setDept(e.target.value)} />
          </div>
        </div>

        <div>
          <button type="submit" disabled={busy} className={primaryButtonClass}>
            {busy ? t('common.saving') : t('team.addUser')}
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
  const { t } = useTranslation()
  const { user, hasPermission } = useAuth()
  const navigate = useNavigate()
  const role = user?.role ?? 'manager'

  const [users,        setUsers]       = useState<AuthUserRow[]>([])
  const [roles,        setRoles]       = useState<RoleOut[]>([])
  const [loadError,    setLoadError]   = useState<string | null>(null)
  const [editState,    setEditState]   = useState<EditState | null>(null)
  const [deleteTarget, setDeleteTarget]= useState<AuthUserRow | null>(null)
  const [deleting,     setDeleting]    = useState(false)

  // Admin-only state
  const [tenants,         setTenants]        = useState<TenantRow[]>([])
  const [stats,           setStats]          = useState<PlatformStats | null>(null)
  const [healthData,      setHealthData]     = useState<HealthData | null>(null)
  const [tenantBusy,      setTenantBusy]     = useState<number | null>(null)
  const [expandedTenant,  setExpandedTenant] = useState<number | null>(null)
  const [tenantUsers,     setTenantUsers]    = useState<Record<number, AuthUserRow[]>>({})
  const [confirmToggle,   setConfirmToggle]  = useState<TenantRow | null>(null)

  // ADM-8: arama + tenant filtresi
  const [userFilter,   setUserFilter]   = useState('')
  const [tenantFilter, setTenantFilter] = useState<number | null>(null)

  // B: Admin kullanıcı yönetimi (şifre sıfırlama modalı)
  const [pwResetTarget, setPwResetTarget] = useState<AuthUserRow | null>(null)

  const loadUsers = useCallback(async () => {
    setLoadError(null)
    try {
      if (role === 'admin') {
        // ADM-6: admin için cross-tenant liste
        const data = await fetchAllUsers()
        setUsers(data)
      } else {
        const { data } = await api.get<AuthUserRow[]>('/auth/users')
        setUsers(data)
      }
    } catch (e: unknown) {
      setLoadError(getApiErrorMessage(e, t('admin.loadListError')))
    }
  }, [role, t])

  const loadAdminData = useCallback(async () => {
    try {
      const [s, t, h] = await Promise.all([fetchPlatformStats(), fetchTenants(), fetchHealthData()])
      setStats(s)
      setTenants(t)
      setHealthData(h)   // ADM-7
    } catch {
      // sessizce geç
    }
  }, [])

  // B: Kullanıcı askıya alma / aktifleştirme
  const onToggleUserStatus = useCallback(async (u: AuthUserRow) => {
    try {
      await adminSetUserStatus(u.id, !u.is_active)
      await loadUsers()
    } catch (e: unknown) {
      setLoadError(getApiErrorMessage(e, t('admin.statusChangeError')))
    }
  }, [loadUsers, t])

  useEffect(() => {
    if (!hasPermission('admin.users.read')) return
    void loadUsers()
    void fetchRoles().then(setRoles).catch(() => {})
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
      setLoadError(getApiErrorMessage(e, t('admin.deleteFailed')))
    } finally {
      setDeleting(false)
    }
  }

  if (role !== 'admin') {
    return <Navigate to="/hr" replace />
  }

  if (!hasPermission('admin.users.read')) {
    return (
      <PageLayout title={t('admin.mgmtTitle')} subtitle={t('admin.mgmtSubtitle')}>
        <GlobalCard>
          <p className="text-center text-sm text-amber-900 dark:text-amber-100">{t('admin.noAccess')}</p>
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
          roles={roles}
          onClose={() => setEditState(null)}
          onSaved={() => { setEditState(null); void loadUsers() }}
        />
      )}
      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#1a1628]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">{t('admin.deleteUserConfirmTitle')}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              <strong>{deleteTarget.email}</strong> {t('admin.deleteUserNote')}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">{t('common.cancel')}</button>
              <button type="button" disabled={deleting} onClick={() => void onConfirmDelete()} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60">
                {deleting ? t('common.deleting') : t('common.delete')}
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
      retail: t('admin.sector.retail'), restaurant: t('admin.sector.restaurant'), service: t('admin.sector.service'),
      production: t('admin.sector.production'), construction: t('admin.sector.construction'), other: t('admin.sector.other'),
    }

    async function executeTenantToggle(tenant: TenantRow) {
      setTenantBusy(tenant.id)
      try {
        await patchTenant(tenant.id, { is_active: !tenant.is_active })
        await loadAdminData()
      } catch {
        // pass silently
      } finally {
        setTenantBusy(null)
        setConfirmToggle(null)
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
        title={t('admin.platformTitle')}
        subtitle={t('admin.platformSubtitle')}
      >
        {modals}
        {confirmToggle && (
          <ConfirmTenantToggleModal
            tenant={confirmToggle}
            busy={tenantBusy === confirmToggle.id}
            onConfirm={() => void executeTenantToggle(confirmToggle)}
            onCancel={() => setConfirmToggle(null)}
          />
        )}
        {pwResetTarget && (
          <PasswordResetModal
            user={pwResetTarget}
            onClose={() => setPwResetTarget(null)}
            onDone={() => void loadUsers()}
          />
        )}

        {/* Platform stats — ADM-7 health dahil */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: t('admin.statTotalTenants'),    value: stats ? String(stats.total_tenants)  : '—', icon: Building2,   color: 'text-violet-600 bg-violet-100 dark:bg-violet-900/30' },
            { label: t('admin.statActiveTenants'),     value: stats ? String(stats.active_tenants) : '—', icon: CheckCircle2,color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30' },
            { label: t('admin.statTotalUsers'), value: stats ? String(stats.total_users)    : '—', icon: Users,       color: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/30' },
            {
              label: t('admin.statSystemStatus'),
              value: healthData ? (healthData.status === 'ok' ? t('admin.statusHealthy') : t('admin.statusProblem')) : '—',
              icon: Shield,
              color: healthData?.status === 'ok'
                ? 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30'
                : 'text-rose-600 bg-rose-100 dark:bg-rose-900/30',
            },
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
        {/* ADM-7: Sistem sağlığı alt bilgi */}
        {healthData && (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {t('admin.uptime')}: {Math.floor(healthData.uptime_seconds / 3600)}s {Math.floor((healthData.uptime_seconds % 3600) / 60)}dk
            {' · '}DB: {healthData.db_ok ? t('admin.dbConnected') : t('admin.dbProblem')}
            {' · '}{formatNumber(healthData.sales_record_count)} {t('admin.salesWord')} · {healthData.product_count} {t('admin.productWord')}
          </p>
        )}

        {/* Tenant list */}
        <div id="companies"><GlobalCard>
          <GlobalCardHeader
            title={t('admin.registeredCompanies')}
            description={t('admin.companiesRegistered', { count: tenants.length })}
          />
          <div className="-mx-5 overflow-x-auto border-t border-slate-100 dark:border-white/5">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={`border-b border-slate-200 dark:border-white/10 ${tableHeaderClass}`}>
                  <th className="py-2 pr-2 w-8" aria-label={t('admin.detail')}></th>
                  <th className="py-2 pr-4">{t('admin.colCompany')}</th>
                  <th className="py-2 pr-4">{t('admin.colSector')}</th>
                  <th className="py-2 pr-4">{t('admin.colUserCount')}</th>
                  <th className="py-2 pr-4">{t('admin.colOnboarding')}</th>
                  <th className="py-2 pr-4">{t('admin.colStatus')}</th>
                  <th className="py-2">{t('admin.colAction')}</th>
                </tr>
              </thead>
              <tbody>
                {tenants.length === 0 && (
                  <tr><td colSpan={7} className="py-6 text-center text-sm text-slate-400">{t('admin.emptyCompanies')}</td></tr>
                )}
                {tenants.map((tenant) => (
                  <>
                    <tr key={tenant.id} className={`${tableRowHoverClass} border-b border-slate-100 dark:border-white/5 cursor-pointer`} onClick={() => void toggleExpand(tenant.id)}>
                      <td className="py-2 pr-2 pl-1">
                        {expandedTenant === tenant.id
                          ? <ChevronDown className="h-4 w-4 text-slate-400" />
                          : <ChevronRight className="h-4 w-4 text-slate-400" />}
                      </td>
                      <td className={`py-2 pr-4 ${tableCellClass}`}>
                        <div className="font-medium">{tenant.name}</div>
                        <div className="text-xs text-slate-400">{tenant.slug}</div>
                      </td>
                      <td className={`py-2 pr-4 ${tableCellClass}`}>
                        {tenant.sector ? sectorLabel[tenant.sector] ?? tenant.sector : <span className="text-slate-400">—</span>}
                      </td>
                      <td className={`py-2 pr-4 ${tableCellClass}`}>{tenant.user_count}</td>
                      <td className="py-2 pr-4">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tenant.onboarding_completed ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                          {tenant.onboarding_completed ? t('admin.onboardingDone') : t('admin.onboardingPending')}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tenant.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-slate-100 text-slate-500'}`}>
                          {tenant.is_active ? t('common.active') : t('common.passive')}
                        </span>
                      </td>
                      <td className="py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              startImpersonation(tenant.id, tenant.name)
                              navigate('/dashboard')
                            }}
                            className="flex items-center gap-1 rounded-lg bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-800/40"
                            title={t('admin.enterTitle', { name: tenant.name })}
                          >
                            <LogIn className="h-3 w-3" />
                            {t('admin.enter')}
                          </button>
                          <button
                            type="button"
                            disabled={tenantBusy === tenant.id}
                            onClick={() => setConfirmToggle(tenant)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${tenant.is_active ? 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300'}`}
                          >
                            {tenantBusy === tenant.id ? '…' : tenant.is_active ? t('common.passive') : t('common.active')}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedTenant === tenant.id && (
                      <tr key={`${tenant.id}-expand`} className="bg-slate-50 dark:bg-slate-900/40">
                        <td colSpan={7} className="px-6 py-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {t('admin.tenantUsersTitle', { name: tenant.name })}
                          </p>
                          {!tenantUsers[tenant.id] ? (
                            <p className="text-xs text-slate-400">{t('common.loading')}</p>
                          ) : tenantUsers[tenant.id].length === 0 ? (
                            <p className="text-xs text-slate-400">{t('admin.tenantNoUsers')}</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {tenantUsers[tenant.id].map((u) => (
                                <span key={u.id} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs dark:border-white/10 dark:bg-slate-800">
                                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${u.role === 'admin' ? 'bg-red-500' : u.role === 'manager' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                  <span className="font-medium text-slate-700 dark:text-slate-200">{u.email}</span>
                                  <span className="text-slate-400">·</span>
                                  <span className="text-slate-500 dark:text-slate-400">{{ admin: t('admin.platformAdmin'), manager: t('admin.manager'), employee: t('admin.employee') }[u.role] ?? u.role}</span>
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
        </GlobalCard></div>

        {/* Role legend */}
        <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
          {[
            { role: 'admin', label: t('admin.legendAdmin'), cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
            { role: 'manager', label: t('admin.legendManager'), cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
            { role: 'employee', label: t('admin.legendEmployee'), cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
          ].map((r) => (
            <div key={r.role} className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.cls}`}>{r.role}</span>
              <span>{r.label}</span>
            </div>
          ))}
        </div>

        <div id="audit"><AuditLogPanel /></div>

        <CreateUserForm adminMode roles={roles} onCreated={() => void loadUsers()} />

        {/* ADM-6/8: Cross-tenant kullanıcı listesi + arama filtresi */}
        <GlobalCard>
          <GlobalCardHeader
            title={t('admin.platformUsers')}
            description={t('admin.platformUsersDesc', { count: users.length })}
          />
          {/* ADM-8: Arama + tenant filtresi */}
          <div className="flex flex-wrap gap-3 mb-4">
            <input
              type="text"
              placeholder={t('admin.userSearchPlaceholder')}
              className={inputFieldClass + ' w-60'}
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            />
            <select
              aria-label={t('admin.filterByCompany')}
              className={selectFieldClass + ' w-48'}
              value={tenantFilter ?? ''}
              onChange={(e) => setTenantFilter(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{t('admin.allCompanies')}</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
              ))}
            </select>
          </div>
          {(() => {
            const q = userFilter.toLowerCase()
            const filtered = users.filter((u) => {
              const matchQ = !q || u.email.toLowerCase().includes(q) || (u.full_name ?? '').toLowerCase().includes(q)
              const matchT = !tenantFilter || (u as CrossTenantUserRow).tenant_id === tenantFilter
              return matchQ && matchT
            })
            return (
              <>
                {filtered.length !== users.length && (
                  <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                    {t('admin.filterResults', { shown: filtered.length, total: users.length })}
                  </p>
                )}
                <UserTable
                  users={filtered}
                  roles={roles}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  loadError={loadError}
                  showTenantCol
                  onResetPassword={(u) => setPwResetTarget(u)}
                  onToggleStatus={(u) => void onToggleUserStatus(u)}
                />
              </>
            )
          })()}
        </GlobalCard>
      </PageLayout>
    )
  }

  // ---------------------------------------------------------------------------
  // MANAGER view — Ekip Yönetimi
  // ---------------------------------------------------------------------------
  return (
    <PageLayout
      title={t('admin.teamTitle')}
      subtitle={t('admin.teamSubtitle')}
    >
      {modals}

      {/* Manager info banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-950/30">
        <Zap className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div>
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">{t('admin.companyManager')}</p>
          <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
            {t('admin.managerBannerText')}{' '}
            <Link to="/settings" className="font-medium underline hover:no-underline">{t('admin.moduleSettingsLink')}</Link>{' '}
            {t('admin.managerBannerSuffix')}
          </p>
        </div>
      </div>

      <CreateUserForm roles={roles} onCreated={() => void loadUsers()} />

      <GlobalCard>
        <GlobalCardHeader
          title={t('admin.teamMembers')}
          description={t('admin.teamMembersDesc', { count: users.length })}
        />
        <UserTable
          users={users}
          roles={roles}
          onEdit={(u) => setEditState({ user: u, role_kind: (u.role_kind ?? 'staff') as 'owner' | 'staff', job_role_id: u.job_role_id ?? null, full_name: u.full_name ?? '', department: u.department ?? '', is_active: u.is_active })}
          onDelete={setDeleteTarget}
          loadError={loadError}
        />
      </GlobalCard>
    </PageLayout>
  )
}
