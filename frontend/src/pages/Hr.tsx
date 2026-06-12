import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Check,
  CheckCircle2,
  Circle,
  Clock,
  ListTodo,
  Lock,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
  X,
} from 'lucide-react'

import { GlobalCard, GlobalCardHeader } from '../components/ui/GlobalCard'
import { PageLayout } from '../components/ui/PageLayout'
import { SkeletonTable } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { LoadingState } from '../components/ui/LoadingState'
import {
  inputFieldClass,
  primaryButtonClass,
  selectFieldClass,
  tableCellClass,
  tableHeaderClass,
  tableRowHoverClass,
} from '../components/ui/forms'
import { useAuth } from '../context/AuthContext'
import {
  api,
  createRole,
  createTeamTask,
  deleteRole,
  deleteTeamTask,
  fetchCustomers,
  fetchEmployeePerformance,
  fetchRoles,
  fetchTeamTasks,
  getActiveLocale,
  getApiErrorMessage,
  updateRole,
  updateTeamTask,
  type AuthUserRow,
  type Customer,
  type EmployeePerformance,
  type RoleOut,
  type TeamTask,
  type TeamTaskCreate,
} from '../lib/api'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCurrency(v: number) {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v) + ' ₺'
}

const PRIORITY_KEY: Record<string, string> = { low: 'team.priLow', medium: 'team.priMedium', high: 'team.priHigh' }
const STATUS_KEY: Record<string, string> = { todo: 'team.stTodo', in_progress: 'team.stInProgress', done: 'team.stDone' }

const PRIORITY_CLS: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  high: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
}

const STATUS_CLS: Record<string, string> = {
  todo: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  in_progress: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
}

const ALL_PERMS: string[] = [
  'admin.access', 'admin.users.read', 'admin.users.write',
  'catalog.product.read', 'catalog.product.write', 'catalog.product.delete',
  'stock.adjust', 'sales.read', 'sales.write', 'finance.read', 'forecast.run',
  'ai.insights.read', 'nlp.query.execute', 'hr.performance.read',
  'hr.tasks.read', 'hr.tasks.write', 'customers.read', 'customers.write',
  'suppliers.read', 'cashbook.read', 'cashbook.write', 'accounts.read',
  'accounts.write', 'orders.read', 'orders.write',
]

function permLabel(t: (k: string) => string, code: string): string {
  const label = t(`team.perm.${code}`)
  return label === `team.perm.${code}` ? code : label
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-400' : 'bg-rose-500'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="tabular-nums text-xs font-semibold text-slate-700 dark:text-slate-200">{score}</span>
    </div>
  )
}

// ─── Task Modal ───────────────────────────────────────────────────────────────

function TaskModal({
  initial, users, customers, onClose, onSaved,
}: {
  initial?: TeamTask | null
  users: AuthUserRow[]
  customers: Customer[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const editing = !!initial
  const [form, setForm] = useState<TeamTaskCreate>({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    assignee_id: initial?.assignee_id ?? null,
    due_date: initial?.due_date ?? null,
    priority: initial?.priority ?? 'medium',
    status: initial?.status ?? 'todo',
    customer_id: initial?.customer_id ?? null,
    supply_order_id: initial?.supply_order_id ?? null,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { setErr(t('team.taskTitleRequired')); return }
    setErr(null); setBusy(true)
    try {
      editing ? await updateTeamTask(initial!.id, form) : await createTeamTask(form)
      onSaved()
    } catch (e: unknown) {
      setErr(getApiErrorMessage(e, t('team.taskSaveError')))
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1a1628]" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label={t('common.close')} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
        <div className="border-b border-slate-100 px-6 py-5 dark:border-white/10">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{editing ? t('team.editTask') : t('team.newTask')}</h2>
        </div>
        <form className="grid gap-3 px-6 py-5" onSubmit={onSubmit}>
          <div>
            <label htmlFor="task-title" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('team.titleField')}</label>
            <input id="task-title" required className={inputFieldClass + ' mt-1'} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label htmlFor="task-desc" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('team.description')}</label>
            <textarea id="task-desc" rows={2} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 dark:border-white/10 dark:bg-[#1a1628] dark:text-slate-100 resize-none" value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="task-assignee" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('team.assignee')}</label>
              <select id="task-assignee" className={selectFieldClass + ' mt-1'} value={form.assignee_id ?? ''} onChange={(e) => setForm({ ...form, assignee_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{t('team.notSelected')}</option>
                {users.filter(u => u.is_active).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.email.split('@')[0]}
                    {u.role_kind === 'owner' ? ' (Owner)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="task-due" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('team.dueDate')}</label>
              <input id="task-due" type="date" title={t('team.dueDate')} className={inputFieldClass + ' mt-1'} value={form.due_date ?? ''} onChange={(e) => setForm({ ...form, due_date: e.target.value || null })} />
            </div>
            <div>
              <label htmlFor="task-priority" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('team.priority')}</label>
              <select id="task-priority" className={selectFieldClass + ' mt-1'} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as 'low' | 'medium' | 'high' })}>
                <option value="low">{t('team.priLow')}</option>
                <option value="medium">{t('team.priMedium')}</option>
                <option value="high">{t('team.priHigh')}</option>
              </select>
            </div>
            <div>
              <label htmlFor="task-status" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('team.status')}</label>
              <select id="task-status" className={selectFieldClass + ' mt-1'} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'todo' | 'in_progress' | 'done' })}>
                <option value="todo">{t('team.stTodo')}</option>
                <option value="in_progress">{t('team.stInProgress')}</option>
                <option value="done">{t('team.stDone')}</option>
              </select>
            </div>
          </div>
          {customers.length > 0 && (
            <div>
              <label htmlFor="task-customer" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('team.relatedCustomer')} <span className="text-slate-400">{t('team.optional')}</span></label>
              <select id="task-customer" className={selectFieldClass + ' mt-1'} value={form.customer_id ?? ''} onChange={(e) => setForm({ ...form, customer_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{t('team.customerNotSelected')}</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {err && <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">{t('common.cancel')}</button>
            <button type="submit" disabled={busy} className={primaryButtonClass + ' px-4 py-2 text-sm'}>{busy ? t('common.saving') : t('common.save')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Task Done Toggle ─────────────────────────────────────────────────────────

function TaskDoneToggle({ task, isEmployee, onUpdated }: { task: TeamTask; isEmployee: boolean; onUpdated: () => void }) {
  const [busy, setBusy] = useState(false)
  const isDone = task.status === 'done'

  async function toggle() {
    setBusy(true)
    try {
      await updateTeamTask(task.id, { status: isDone ? 'todo' : 'done' })
      onUpdated()
    } finally { setBusy(false) }
  }

  if (isEmployee) {
    return (
      <button type="button" onClick={toggle} disabled={busy}
        title={isDone ? 'Reopen task' : 'Mark as done'}
        className={[
          'flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all duration-150 disabled:opacity-50',
          isDone
            ? 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600 hover:border-emerald-600'
            : 'border-slate-300 text-transparent hover:border-violet-500 hover:text-violet-500 dark:border-slate-600',
        ].join(' ')}>
        {busy ? <Clock className="h-3 w-3 animate-spin text-slate-400" /> : <Check className="h-3 w-3" />}
      </button>
    )
  }

  // Manager: 3-state cycle (todo → in_progress → done → todo)
  const NEXT: Record<string, TeamTask['status']> = { todo: 'in_progress', in_progress: 'done', done: 'todo' }
  const Icon = task.status === 'done' ? CheckCircle2 : task.status === 'in_progress' ? Clock : Circle
  const cls = task.status === 'done' ? 'text-emerald-500' : task.status === 'in_progress' ? 'text-sky-500' : 'text-slate-400'
  return (
    <button type="button" onClick={async () => { setBusy(true); try { await updateTeamTask(task.id, { status: NEXT[task.status] }); onUpdated() } finally { setBusy(false) } }} disabled={busy}
      title={`${task.status} → ${NEXT[task.status]}`}
      className={`flex h-7 w-7 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-50 ${cls}`}>
      {busy ? <Clock className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
    </button>
  )
}

// ─── User Edit Modal ──────────────────────────────────────────────────────────

function UserEditModal({ user, roles, onClose, onSaved }: {
  user: AuthUserRow
  roles: RoleOut[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [roleKind, setRoleKind] = useState<'owner' | 'staff'>((user.role_kind ?? 'staff') as 'owner' | 'staff')
  const [jobRoleId, setJobRoleId] = useState<number | null>(user.job_role_id ?? null)
  const [fullName, setFullName] = useState(user.full_name ?? '')
  const [department, setDep] = useState(user.department ?? '')
  const [isActive, setIsActive] = useState(user.is_active)
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setBusy(true)
    try {
      await api.patch(`/auth/users/${user.id}`, {
        role: roleKind === 'owner' ? 'manager' : 'employee',
        role_kind: roleKind,
        job_role_id: roleKind === 'staff' ? jobRoleId : null,
        full_name: fullName,
        department,
        is_active: isActive,
        ...(newPassword ? { new_password: newPassword } : {}),
      })
      onSaved()
    } catch (e: unknown) {
      setErr(getApiErrorMessage(e, t('team.updateError')))
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1a1628]" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label={t('common.close')} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
        <div className="border-b border-slate-100 px-6 py-5 dark:border-white/10">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t('team.editUser')}</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
        </div>
        <form className="grid gap-4 px-6 py-5" onSubmit={onSubmit}>
          <div>
            <label htmlFor="ue-name" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('team.fullName')}</label>
            <input id="ue-name" type="text" className={inputFieldClass + ' mt-1'} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="ue-dept" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('team.department')}</label>
            <input id="ue-dept" type="text" className={inputFieldClass + ' mt-1'} value={department} onChange={(e) => setDep(e.target.value)} />
          </div>
          <div>
            <label htmlFor="ue-kind" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('team.roleType')}</label>
            <select id="ue-kind" className={selectFieldClass + ' mt-1'} value={roleKind} onChange={(e) => { setRoleKind(e.target.value as 'owner' | 'staff'); setJobRoleId(null) }}>
              <option value="owner">{t('team.ownerOption')}</option>
              <option value="staff">{t('team.staffOption')}</option>
            </select>
          </div>
          {roleKind === 'staff' && (
            <div>
              <label htmlFor="ue-jobrole" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('team.roleTemplate')}</label>
              <select id="ue-jobrole" className={selectFieldClass + ' mt-1'} value={jobRoleId ?? ''} onChange={(e) => setJobRoleId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">{t('team.selectTemplate')}</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}{r.is_system ? ' ⭐' : ''}</option>)}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="ue-active" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            <label htmlFor="ue-active" className="text-sm text-slate-700 dark:text-slate-300">{t('common.active')}</label>
          </div>
          <div>
            <label htmlFor="ue-newpw" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('team.passwordField')} <span className="text-slate-400">{t('team.resetPasswordHint', { defaultValue: '(leave blank to keep current)' })}</span></label>
            <input id="ue-newpw" type="password" minLength={8} className={inputFieldClass + ' mt-1'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password (optional)" />
          </div>
          {err && <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">{t('common.cancel')}</button>
            <button type="submit" disabled={busy} className={primaryButtonClass + ' px-4 py-2 text-sm'}>{busy ? t('common.saving') : t('common.save')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── User Create Modal ────────────────────────────────────────────────────────

function UserCreateModal({ roles, onClose, onSaved }: {
  roles: RoleOut[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [department, setDep] = useState('')
  const [roleKind, setRoleKind] = useState<'owner' | 'staff'>('staff')
  const [jobRoleId, setJobRoleId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setBusy(true)
    try {
      await api.post('/auth/users', {
        email,
        password,
        full_name: fullName || null,
        department: department || null,
        role: roleKind === 'owner' ? 'manager' : 'employee',
        role_kind: roleKind,
        job_role_id: roleKind === 'staff' ? jobRoleId : null,
      })
      onSaved()
    } catch (e: unknown) {
      setErr(getApiErrorMessage(e, t('team.createUserError')))
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1a1628]" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label={t('common.close')} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
        <div className="border-b border-slate-100 px-6 py-5 dark:border-white/10">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t('team.newUser')}</h2>
        </div>
        <form className="grid gap-4 px-6 py-5" onSubmit={onSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="uc-name" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('team.fullName')}</label>
              <input id="uc-name" type="text" className={inputFieldClass + ' mt-1'} value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="uc-dept" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('team.department')}</label>
              <input id="uc-dept" type="text" className={inputFieldClass + ' mt-1'} value={department} onChange={(e) => setDep(e.target.value)} />
            </div>
          </div>
          <div>
            <label htmlFor="uc-email" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('team.emailField')}</label>
            <input id="uc-email" type="email" required className={inputFieldClass + ' mt-1'} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label htmlFor="uc-pass" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('team.passwordField')} <span className="text-slate-400">{t('team.passwordHint')}</span></label>
            <input id="uc-pass" type="password" required minLength={8} className={inputFieldClass + ' mt-1'} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <label htmlFor="uc-kind" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('team.roleType')}</label>
            <select id="uc-kind" className={selectFieldClass + ' mt-1'} value={roleKind} onChange={(e) => { setRoleKind(e.target.value as 'owner' | 'staff'); setJobRoleId(null) }}>
              <option value="staff">{t('team.staffOption')}</option>
              <option value="owner">{t('team.ownerOption')}</option>
            </select>
          </div>
          {roleKind === 'staff' && (
            <div>
              <label htmlFor="uc-jobrole" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('team.roleTemplate')}</label>
              <select id="uc-jobrole" className={selectFieldClass + ' mt-1'} value={jobRoleId ?? ''} onChange={(e) => setJobRoleId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">{t('team.selectTemplate')}</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}{r.is_system ? ' ⭐' : ''}</option>)}
              </select>
            </div>
          )}
          {err && <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">{t('common.cancel')}</button>
            <button type="submit" disabled={busy} className={primaryButtonClass + ' px-4 py-2 text-sm'}>{busy ? t('team.creating') : t('team.addBtn')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const { t } = useTranslation()
  const { user: me } = useAuth()
  const [users, setUsers] = useState<AuthUserRow[]>([])
  const [roles, setRoles] = useState<RoleOut[]>([])
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState<AuthUserRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const roleMap = new Map(roles.map((r) => [r.id, r.name]))

  async function load() {
    setLoading(true)
    try {
      const [usersRes, rolesData] = await Promise.all([
        api.get<AuthUserRow[]>('/auth/users'),
        fetchRoles(),
      ])
      setUsers(usersRes.data)
      setRoles(rolesData)
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, t('team.usersLoadError')))
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  async function onDelete(u: AuthUserRow) {
    if (!confirm(t('team.deleteUserConfirm', { name: u.full_name ?? u.email }))) return
    setDeletingId(u.id)
    try {
      await api.delete(`/auth/users/${u.id}`)
      await load()
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, t('team.deleteUserError')))
    } finally { setDeletingId(null) }
  }

  if (loading) return <LoadingState />

  return (
    <GlobalCard>
      <div className="flex items-center justify-between">
        <GlobalCardHeader title={t('team.teamMembers')} description={t('team.userCount', { count: users.length })} />
        <button type="button" onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 active:scale-95">
          <Plus className="h-3.5 w-3.5" /> {t('team.addUser')}
        </button>
      </div>
      {error && <p className="mb-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="-mx-5 overflow-x-auto border-t border-slate-100 dark:border-white/5">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className={`border-b border-slate-200 dark:border-white/10 ${tableHeaderClass}`}>
              <th className="py-2 pl-5 pr-4">{t('team.fullName')}</th>
              <th className="py-2 pr-4">{t('common.email')}</th>
              <th className="py-2 pr-4">{t('team.colAuth')}</th>
              <th className="py-2 pr-4">{t('team.roleTemplate')}</th>
              <th className="py-2 pr-4">{t('team.status')}</th>
              <th className="py-2 pr-5 sr-only">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-sm text-slate-400">{t('team.emptyUsers')}</td></tr>
            )}
            {users.map((u) => {
              const isOwner = u.role_kind === 'owner' || u.role === 'manager'
              const isSelf = u.id === me?.id
              return (
                <tr key={u.id} className={tableRowHoverClass + ' border-b border-slate-100 dark:border-white/5'}>
                  <td className={`py-2.5 pl-5 pr-4 font-medium ${tableCellClass}`}>
                    {u.full_name ?? '—'}
                    {isSelf && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-white/10 dark:text-slate-400">{t('team.self')}</span>}
                  </td>
                  <td className={`py-2.5 pr-4 ${tableCellClass}`}>{u.email}</td>
                  <td className="py-2.5 pr-4">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isOwner ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                      {isOwner ? t('team.managerBadge') : t('team.staffBadge')}
                    </span>
                  </td>
                  <td className={`py-2.5 pr-4 ${tableCellClass}`}>
                    {u.job_role_id ? (
                      <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:ring-violet-500/30">
                        {roleMap.get(u.job_role_id) ?? `#${u.job_role_id}`}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">{t('team.unassigned')}</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-slate-100 text-slate-500'}`}>
                      {u.is_active ? t('common.active') : t('common.passive')}
                    </span>
                  </td>
                  <td className="py-2.5 pr-5">
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setEditTarget(u)} aria-label={t('common.edit')}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-violet-50 hover:text-violet-600 dark:text-slate-400 dark:hover:bg-violet-500/10 dark:hover:text-violet-300">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => void onDelete(u)} aria-label={t('common.delete')}
                        disabled={isSelf || deletingId === u.id}
                        title={isSelf ? t('team.cantDeleteSelf') : t('team.deleteUserTitle')}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30 dark:text-slate-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {editTarget && (
        <UserEditModal user={editTarget} roles={roles} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); void load() }} />
      )}
      {creating && (
        <UserCreateModal roles={roles} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void load() }} />
      )}
    </GlobalCard>
  )
}

// ─── Role Modal ───────────────────────────────────────────────────────────────

function RoleModal({ initial, onClose, onSaved }: { initial?: RoleOut; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const isEdit = !!initial
  const [name, setName] = useState(initial?.name ?? '')
  const [perms, setPerms] = useState<Set<string>>(new Set(initial?.permissions ?? []))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function togglePerm(p: string) {
    setPerms((prev) => { const next = new Set(prev); next.has(p) ? next.delete(p) : next.add(p); return next })
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true)
    try {
      isEdit ? await updateRole(initial!.id, { name: name.trim(), permissions: [...perms] })
              : await createRole({ name: name.trim(), permissions: [...perms] })
      onSaved()
    } catch (e: unknown) {
      setErr(getApiErrorMessage(e, t('team.roleSaveError')))
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1a1628]" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label={t('common.close')} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
        <div className="border-b border-slate-100 px-6 py-5 dark:border-white/10">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{isEdit ? t('team.editRoleTitle') : t('team.newRoleTitle')}</h2>
        </div>
        <form className="space-y-4 px-6 py-5" onSubmit={onSubmit}>
          <div>
            <label htmlFor="role-name" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('team.roleName')}</label>
            <input id="role-name" type="text" required placeholder={t('team.roleNamePlaceholder')} className={inputFieldClass + ' mt-1'} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-400">{t('team.permissions')}</p>
            <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-1">
              {ALL_PERMS.map((p) => (
                <label key={p} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5">
                  <input type="checkbox" checked={perms.has(p)} onChange={() => togglePerm(p)} className="h-3.5 w-3.5 rounded accent-violet-600" />
                  <span className="text-slate-700 dark:text-slate-300">{permLabel(t, p)}</span>
                </label>
              ))}
            </div>
          </div>
          {err && <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">{t('common.cancel')}</button>
            <button type="submit" disabled={busy} className={primaryButtonClass + ' px-4 py-2 text-sm'}>{busy ? t('common.saving') : isEdit ? t('common.save') : t('team.createBtn')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Roles Tab ────────────────────────────────────────────────────────────────

function RolesTab({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation()
  const [roles, setRoles] = useState<RoleOut[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<'create' | RoleOut | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    try { setRoles(await fetchRoles()); setError(null) }
    catch (e: unknown) { setError(getApiErrorMessage(e, t('team.rolesLoadError'))) }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  async function onDelete(role: RoleOut) {
    if (!confirm(t('team.deleteRoleConfirm', { name: role.name }))) return
    setDeleting(role.id)
    try { await deleteRole(role.id); await load() }
    catch (e: unknown) { setError(getApiErrorMessage(e, t('team.deleteRoleError'))) }
    finally { setDeleting(null) }
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800 dark:text-white">
            {t('team.rolesTitle')}
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">{t('team.roleCount', { count: roles.length })}</span>
          </h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t('team.rolesProtectedNote')}</p>
        </div>
        {canEdit && (
          <button type="button" onClick={() => setModal('create')} className={primaryButtonClass + ' flex items-center gap-1.5 text-sm'}>
            <Plus className="h-4 w-4" /> {t('team.newRoleBtn')}
          </button>
        )}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">{error}</div>}

      <div className="space-y-3">
        {roles.map((role) => (
          <div key={role.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#16122b]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900 dark:text-white">{role.name}</span>
                  {role.is_system && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                      <Lock className="h-3 w-3" /> {t('team.systemRoleBadge')}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {role.permissions.length === 0 ? (
                    <span className="text-xs text-slate-400">{t('team.permNone')}</span>
                  ) : role.permissions.map((p) => (
                    <span key={p} className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                      {permLabel(t, p)}
                    </span>
                  ))}
                </div>
              </div>
              {canEdit && (
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => setModal(role)} title={t('common.edit')}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-violet-50 hover:text-violet-600 dark:text-slate-400 dark:hover:bg-violet-500/10 dark:hover:text-violet-300">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" disabled={role.is_system || deleting === role.id} onClick={() => void onDelete(role)}
                    title={role.is_system ? t('team.systemRoleDeleteTitle') : t('common.delete')}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30 dark:text-slate-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {roles.length === 0 && <p className="py-8 text-center text-sm text-slate-400">{t('team.emptyRolesNote')}</p>}
      </div>

      {modal === 'create' && <RoleModal onClose={() => setModal(null)} onSaved={() => { setModal(null); void load() }} />}
      {modal && modal !== 'create' && <RoleModal initial={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load() }} />}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'performance' | 'tasks' | 'users' | 'roles'

export function HrPage() {
  const { t } = useTranslation()
  const { hasPermission, user } = useAuth()
  const canWrite = hasPermission('hr.tasks.write')
  const canManageUsers = hasPermission('admin.users.write')

  const isStaff = user?.role_kind === 'staff'
  const [tab, setTab] = useState<Tab>(isStaff ? 'tasks' : 'performance')

  const [members, setMembers] = useState<EmployeePerformance[]>([])
  const [users, setUsers] = useState<AuthUserRow[]>([])
  const [tasks, setTasks] = useState<TeamTask[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<TeamTask | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TeamTask | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const taskParams = isStaff && user?.id ? { assignee_id: user.id } : undefined
      const [perf, taskList, customerList, usersRes] = await Promise.all([
        fetchEmployeePerformance().catch(() => [] as EmployeePerformance[]),
        fetchTeamTasks(taskParams).catch(() => [] as TeamTask[]),
        fetchCustomers().catch(() => [] as Customer[]),
        api.get<AuthUserRow[]>('/auth/users').then(r => r.data).catch(() => [] as AuthUserRow[]),
      ])
      setMembers(perf); setTasks(taskList); setCustomers(customerList); setUsers(usersRes)
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, t('team.tasksLoadError')))
    } finally { setLoading(false) }
  }, [t, isStaff, user?.id])

  useEffect(() => { void load() }, [load])

  const filteredTasks = statusFilter ? tasks.filter((t) => t.status === statusFilter) : tasks
  const todoCount = tasks.filter((t) => t.status === 'todo').length
  const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length
  const doneCount = tasks.filter((t) => t.status === 'done').length

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try { await deleteTeamTask(deleteTarget.id); setDeleteTarget(null); void load() }
    catch (e: unknown) { setError(getApiErrorMessage(e, t('team.deleteTaskError'))) }
    finally { setDeleting(false) }
  }

  const TABS = isStaff
    ? [{ id: 'tasks' as Tab, label: t('team.tabTasks'), icon: ListTodo }]
    : [
        { id: 'performance' as Tab, label: t('team.tabPerformance'), icon: Users },
        { id: 'tasks'       as Tab, label: t('team.tabTasks'),       icon: ListTodo },
        { id: 'users'       as Tab, label: t('team.tabUsers'),       icon: UserCog },
        { id: 'roles'       as Tab, label: t('team.tabRoles'),       icon: ShieldCheck },
      ]

  return (
    <PageLayout
      title={t('team.title')}
      subtitle={t('team.subtitle')}
      actions={
        canWrite && !isStaff && tab === 'tasks' ? (
          <button type="button" onClick={() => { setEditTarget(null); setModalOpen(true) }}
            className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 active:scale-95">
            <Plus className="h-3.5 w-3.5" /> {t('team.newTaskBtn')}
          </button>
        ) : undefined
      }
    >
      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/5 w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === id ? 'bg-white shadow-sm text-slate-900 dark:bg-white/10 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
            <Icon className="h-3.5 w-3.5" />
            {label}
            {id === 'tasks' && tasks.length > 0 && (
              <span className="ml-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">{tasks.length}</span>
            )}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      {/* ── Performans ── */}
      {tab === 'performance' && (
        loading ? <SkeletonTable rows={5} cols={7} /> : members.length === 0 ? (
          <GlobalCard><EmptyState title={t('team.emptyEmployees')} description={t('team.emptyEmployeesHint')} /></GlobalCard>
        ) : (
          <GlobalCard>
            <GlobalCardHeader title={t('team.performanceTitle')} description={`${members.length}`} />
            <div className="-mx-5 overflow-x-auto border-t border-slate-100 dark:border-white/5">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className={`border-b border-slate-200 dark:border-white/10 ${tableHeaderClass}`}>
                    <th className="py-2 pl-5 pr-4">{t('team.colEmployee')}</th>
                    <th className="py-2 pr-4">{t('team.colDepartment')}</th>
                    <th className="py-2 pr-4">{t('team.colRole')}</th>
                    <th className="py-2 pr-4 text-right">{t('team.colSales')}</th>
                    <th className="py-2 pr-4 text-right">{t('team.colRevenue')}</th>
                    <th className="py-2 pr-4 text-right">{t('team.colTasks')}</th>
                    <th className="py-2 pr-5">{t('team.colScore')}</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} className={tableRowHoverClass + ' border-b border-slate-100 dark:border-white/5'}>
                      <td className="py-2.5 pl-5 pr-4">
                        <div className="font-medium text-slate-900 dark:text-white">{m.full_name}</div>
                        <div className="text-xs text-slate-400 dark:text-slate-500">{m.email}</div>
                      </td>
                      <td className={`py-2.5 pr-4 ${tableCellClass}`}>{m.department ?? '—'}</td>
                      <td className="py-2.5 pr-4">
                        <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 capitalize">{m.role}</span>
                      </td>
                      <td className={`py-2.5 pr-4 text-right tabular-nums ${tableCellClass}`}>{m.sales_count}</td>
                      <td className={`py-2.5 pr-4 text-right tabular-nums font-medium ${tableCellClass}`}>{m.sales_revenue > 0 ? fmtCurrency(m.sales_revenue) : '—'}</td>
                      <td className={`py-2.5 pr-4 text-right tabular-nums ${tableCellClass}`}>
                        {m.tasks_total > 0 ? (
                          <span title={`${m.tasks_done} completed / ${m.tasks_total} total`}>
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">{m.tasks_done}</span>
                            <span className="text-slate-400">/{m.tasks_total}</span>
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-2.5 pr-5">
                        <ScoreBar score={m.ai_score} />
                        <div className="mt-0.5 text-xs text-slate-400 dark:text-slate-500 max-w-xs">{m.ai_insight}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlobalCard>
        )
      )}

      {/* ── Görevler ── */}
      {tab === 'tasks' && (
        <>
          {isStaff && (
            <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
              <ListTodo className="h-4 w-4 shrink-0" />
              <span>Showing tasks assigned to you. Contact your manager to see or create other tasks.</span>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            {([
              { label: t('team.stTodo'),       count: todoCount,       cls: 'text-slate-600 dark:text-slate-400' },
              { label: t('team.stInProgress'), count: inProgressCount, cls: 'text-sky-600 dark:text-sky-400' },
              { label: t('team.stDone'),       count: doneCount,       cls: 'text-emerald-600 dark:text-emerald-400' },
            ] as const).map((s) => (
              <GlobalCard key={s.label}>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{s.label}</div>
                <div className={`mt-1 text-2xl font-bold tabular-nums ${s.cls}`}>{s.count}</div>
              </GlobalCard>
            ))}
          </div>
          <GlobalCard>
            <select aria-label={t('team.filterByStatus')} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectFieldClass + ' w-44'}>
              <option value="">{t('team.allStatuses')}</option>
              <option value="todo">{t('team.stTodo')}</option>
              <option value="in_progress">{t('team.stInProgress')}</option>
              <option value="done">{t('team.stDone')}</option>
            </select>
          </GlobalCard>
          {loading && tasks.length === 0 ? <SkeletonTable rows={5} cols={7} /> : filteredTasks.length === 0 ? (
            <GlobalCard>
              <EmptyState
                title={isStaff ? 'No tasks assigned to you' : t('team.emptyTasks')}
                description={isStaff ? 'Your manager will assign tasks here.' : (statusFilter ? t('team.emptyTasksFilterHint') : t('team.emptyTasksHint'))}
                action={canWrite && !isStaff ? (
                  <button type="button" onClick={() => { setEditTarget(null); setModalOpen(true) }}
                    className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700">
                    <Plus className="h-3.5 w-3.5" /> {t('team.addTask')}
                  </button>
                ) : undefined}
              />
            </GlobalCard>
          ) : isStaff ? (
            /* ── Employee: card layout ── */
            <div className="space-y-3">
              {filteredTasks.map((task) => {
                const isDone = task.status === 'done'
                const isOverdue = task.due_date && new Date(task.due_date) < new Date() && !isDone
                return (
                  <div key={task.id} className={[
                    'rounded-xl border p-4 transition-all',
                    isDone
                      ? 'border-emerald-200/60 bg-emerald-50/40 dark:border-emerald-500/20 dark:bg-emerald-500/5 opacity-70'
                      : isOverdue
                        ? 'border-rose-200 bg-rose-50/40 dark:border-rose-500/20 dark:bg-rose-500/5'
                        : 'border-slate-200 bg-white dark:border-white/10 dark:bg-[#16122b]',
                  ].join(' ')}>
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        <TaskDoneToggle task={task} isEmployee={true} onUpdated={() => void load(true)} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className={`font-semibold text-slate-900 dark:text-white text-sm ${isDone ? 'line-through text-slate-400 dark:text-slate-500' : ''}`}>
                              {task.title}
                            </p>
                            {task.description && (
                              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{task.description}</p>
                            )}
                          </div>
                          <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_CLS[task.priority]}`}>
                            {t(PRIORITY_KEY[task.priority])}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${STATUS_CLS[task.status]}`}>
                            {t(STATUS_KEY[task.status])}
                          </span>
                          {task.due_date && (
                            <span className={isOverdue ? 'text-rose-600 dark:text-rose-400 font-medium' : ''}>
                              Due: {new Date(task.due_date).toLocaleDateString(getActiveLocale())}
                              {isOverdue && ' — Overdue!'}
                            </span>
                          )}
                          {task.customer_name && (
                            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                              {task.customer_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* ── Manager: table layout ── */
            <GlobalCard>
              <GlobalCardHeader title={t('team.taskListTitle')} description={t('team.taskCount', { count: filteredTasks.length })} />
              <div className="-mx-5 overflow-x-auto border-t border-slate-100 dark:border-white/5">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className={`border-b border-slate-200 dark:border-white/10 ${tableHeaderClass}`}>
                      <th className="py-2 pl-5 pr-2 sr-only">{t('team.status')}</th>
                      <th className="py-2 pr-4">{t('team.colTitle')}</th>
                      <th className="py-2 pr-4">{t('team.colAssignee')}</th>
                      <th className="py-2 pr-4">{t('team.colCustomer')}</th>
                      <th className="py-2 pr-4">{t('team.colPriority')}</th>
                      <th className="py-2 pr-4">{t('team.colStatus')}</th>
                      <th className="py-2 pr-4">{t('team.colDueDate')}</th>
                      <th className="py-2 pr-5 sr-only">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTasks.map((task) => (
                      <tr key={task.id} className={tableRowHoverClass + ' border-b border-slate-100 dark:border-white/5' + (task.status === 'done' ? ' opacity-60' : '')}>
                        <td className="py-2.5 pl-5 pr-2"><TaskDoneToggle task={task} isEmployee={false} onUpdated={() => void load(true)} /></td>
                        <td className="py-2.5 pr-4">
                          <div className={`font-medium text-slate-900 dark:text-white ${task.status === 'done' ? 'line-through' : ''}`}>{task.title}</div>
                          {task.description && <div className="text-xs text-slate-400 dark:text-slate-500 line-clamp-1">{task.description}</div>}
                        </td>
                        <td className={`py-2.5 pr-4 ${tableCellClass}`}>{task.assignee_name ?? '—'}</td>
                        <td className={`py-2.5 pr-4 ${tableCellClass}`}>
                          {task.customer_name ? (
                            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">{task.customer_name}</span>
                          ) : '—'}
                        </td>
                        <td className="py-2.5 pr-4"><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_CLS[task.priority]}`}>{t(PRIORITY_KEY[task.priority])}</span></td>
                        <td className="py-2.5 pr-4"><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLS[task.status]}`}>{t(STATUS_KEY[task.status])}</span></td>
                        <td className={`py-2.5 pr-4 ${tableCellClass}`}>{task.due_date ? new Date(task.due_date).toLocaleDateString(getActiveLocale()) : '—'}</td>
                        <td className="py-2.5 pr-5">
                          <div className="flex items-center gap-1">
                            <button type="button" aria-label={t('common.edit')} onClick={() => { setEditTarget(task); setModalOpen(true) }}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-violet-50 hover:text-violet-600 dark:text-slate-400 dark:hover:bg-violet-500/10 dark:hover:text-violet-300">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" aria-label={t('common.delete')} onClick={() => setDeleteTarget(task)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlobalCard>
          )}
        </>
      )}

      {/* ── Kullanıcılar ── */}
      {tab === 'users' && <UsersTab />}

      {/* ── Roller ── */}
      {tab === 'roles' && <RolesTab canEdit={canManageUsers} />}

      {/* Task Modal */}
      {modalOpen && (
        <TaskModal initial={editTarget} users={users} customers={customers}
          onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); void load() }} />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#1a1628]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">{t('team.deleteTaskTitle')}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400"><strong>{deleteTarget.title}</strong> {t('team.deleteTaskNote')}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300">{t('common.cancel')}</button>
              <button type="button" disabled={deleting} onClick={() => void confirmDelete()} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60">
                {deleting ? t('common.deleting') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  )
}
