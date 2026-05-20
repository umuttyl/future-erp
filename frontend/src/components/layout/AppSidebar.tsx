import { useEffect, useState } from 'react'
import {
  ArrowLeftFromLine,
  Brain,
  Building2,
  ClipboardList,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  ShoppingCart,
  Sliders,
  Sparkles,
  Truck,
  Users,
  Wallet,
} from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'

import { useAuth } from '../../context/AuthContext'
import { fetchActiveModules } from '../../lib/api'
import { stopImpersonation, useImpersonation } from '../../lib/impersonation'
import { HelpModal } from './HelpModal'

type NavDef = {
  to: string
  label: string
  perm: string
  icon: typeof LayoutDashboard
  /** ERP module key that must be active to show this item. null = always visible (dashboard, admin). */
  moduleKey: string | null
}

const MAIN_NAV: NavDef[] = [
  { to: '/dashboard', label: 'Dashboard',          perm: 'sales.read',           icon: LayoutDashboard, moduleKey: null },
  { to: '/sales',     label: 'Satış',              perm: 'sales.read',           icon: ShoppingCart,    moduleKey: 'sales' },
  { to: '/customers', label: 'Müşteriler',         perm: 'sales.read',           icon: Building2,       moduleKey: 'crm' },
  { to: '/stock',     label: 'Stok',               perm: 'catalog.product.read', icon: Package,         moduleKey: 'inventory' },
  { to: '/orders',    label: 'Siparişler',         perm: 'catalog.product.read', icon: ClipboardList,   moduleKey: 'purchasing' },
  { to: '/suppliers', label: 'Tedarikçiler',       perm: 'catalog.product.read', icon: Truck,           moduleKey: 'suppliers' },
  { to: '/finance',   label: 'Finans',             perm: 'finance.read',         icon: Wallet,          moduleKey: 'finance' },
  { to: '/ai',        label: 'AI Analizi',         perm: 'ai.insights.read',     icon: Brain,           moduleKey: 'ai' },
  { to: '/hr',        label: 'İnsan Kaynakları',   perm: 'hr.performance.read',  icon: Users,           moduleKey: 'hr' },
  { to: '/settings',  label: 'Modül Ayarları',     perm: 'admin.users.write',    icon: Sliders,         moduleKey: null },
  { to: '/admin',     label: 'Yönetim',            perm: 'admin.users.write',    icon: Settings,        moduleKey: null },
]

// Rol bazlı sidebar konfigürasyonu
const ROLE_CONFIG = {
  admin: {
    gradient: 'from-red-500 to-rose-700',
    shadow: 'shadow-red-500/25',
    subtitle: 'Platform Yönetimi',
    activeClass: 'bg-red-500/15 text-red-700 dark:bg-red-500/20 dark:text-red-200',
    iconActiveClass: 'text-red-600 dark:text-red-300',
  },
  manager: {
    gradient: 'from-violet-500 to-brand-700',
    shadow: 'shadow-violet-500/25',
    subtitle: 'Şirket Yönetim Paneli',
    activeClass: 'bg-violet-500/15 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200',
    iconActiveClass: 'text-violet-600 dark:text-violet-300',
  },
  employee: {
    gradient: 'from-indigo-500 to-blue-700',
    shadow: 'shadow-indigo-500/25',
    subtitle: 'Operasyon Görünümü',
    activeClass: 'bg-indigo-500/15 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200',
    iconActiveClass: 'text-indigo-600 dark:text-indigo-300',
  },
} as const

type RoleKey = keyof typeof ROLE_CONFIG

const ROLE_LABELS: Record<string, string> = {
  admin: 'Platform Admin',
  manager: 'Şirket Müdürü',
  employee: 'Çalışan',
}

export function AppSidebar() {
  const { user, logout, hasPermission } = useAuth()
  const navigate = useNavigate()
  const [helpOpen, setHelpOpen] = useState(false)
  const [activeModules, setActiveModules] = useState<string[] | null>(null)
  const { tenantId: impersonateTenantId, tenantName: impersonateTenantName } = useImpersonation()

  const role = (user?.role ?? 'employee') as RoleKey
  const cfg = ROLE_CONFIG[role] ?? ROLE_CONFIG.employee

  useEffect(() => {
    fetchActiveModules()
      .then((res) => setActiveModules(res.active_modules))
      .catch(() => setActiveModules(null))
  }, [user?.id, impersonateTenantId])

  const adminNavItems: NavDef[] = [
    { to: '/dashboard', label: 'Platform Paneli',    perm: 'admin.users.write', icon: LayoutDashboard, moduleKey: null },
    { to: '/admin',     label: 'Tenant & Kullanıcı', perm: 'admin.users.write', icon: Users,           moduleKey: null },
    { to: '/ai',        label: 'AI Komuta Merkezi',  perm: 'ai.insights.read',  icon: Brain,           moduleKey: null },
    { to: '/settings',  label: 'Platform Ayarları',   perm: 'admin.users.write', icon: Sliders,         moduleKey: null },
  ]

  const items = role === 'admin' && !impersonateTenantId
    ? adminNavItems
    : MAIN_NAV.filter((n) => {
        if (!hasPermission(n.perm)) return false
        if (n.moduleKey === null) return true
        if (activeModules === null || activeModules.length === 0) return true
        return activeModules.includes(n.moduleKey)
      })

  return (
    <>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-surface-border bg-surface-card dark:border-white/10 dark:bg-[#12101f] dark:shadow-none">

        {/* Logo + rol başlığı */}
        <div className="flex items-center gap-3 px-5 py-6">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${cfg.gradient} text-white shadow-lg ${cfg.shadow}`}>
            <Sparkles className="h-5 w-5" strokeWidth={2} />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Future ERP AI</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">{cfg.subtitle}</div>
          </div>
        </div>

        {/* Impersonation banner — specific tenant context */}
        {role === 'admin' && impersonateTenantName && (
          <div className="mx-3 mb-2 rounded-xl border border-indigo-300 bg-indigo-50 px-3 py-2 dark:border-indigo-500/35 dark:bg-indigo-950/40">
            <p className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
              Şirket: {impersonateTenantName}
            </p>
            <button
              type="button"
              onClick={() => {
                stopImpersonation()
                navigate('/admin')
              }}
              className="mt-1 flex items-center gap-1 text-[10px] font-medium text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-200"
            >
              <ArrowLeftFromLine className="h-3 w-3" />
              Platform Yönetimine Dön
            </button>
          </div>
        )}

        {/* Admin banner — platform-wide access (not impersonating) */}
        {role === 'admin' && !impersonateTenantName && (
          <div className="mx-3 mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 dark:border-red-500/25 dark:bg-red-950/25">
            <p className="text-[11px] font-semibold text-red-700 dark:text-red-300">
              Platform Yöneticisi
            </p>
            <p className="mt-0.5 text-[10px] text-red-500 dark:text-red-400">
              Tüm şirketlere çapraz erişim aktif.
            </p>
          </div>
        )}

        {/* Employee rol banner'ı — çalışanlara net bir görsel bağlam sunar */}
        {role === 'employee' && (
          <div className="mx-3 mb-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 dark:border-indigo-500/30 dark:bg-indigo-950/30">
            <p className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
              {user?.department ? `${user.department} · ` : ''}{ROLE_LABELS.employee}
            </p>
            <p className="mt-0.5 text-[10px] text-indigo-500 dark:text-indigo-400">
              Sadece size atanmış modüllere erişilebilir.
            </p>
          </div>
        )}

        <nav className="flex-1 space-y-0.5 px-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/dashboard'}
              className={({ isActive }) =>
                [
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                  isActive
                    ? cfg.activeClass
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={`h-[18px] w-[18px] shrink-0 ${isActive ? cfg.iconActiveClass : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`}
                    strokeWidth={2}
                  />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-1 border-t border-surface-border px-3 py-4 dark:border-white/10">
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-600 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5"
          >
            <HelpCircle className="h-[18px] w-[18px]" strokeWidth={2} />
            Yardım
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
          >
            <LogOut className="h-[18px] w-[18px]" strokeWidth={2} />
            Çıkış
          </button>
        </div>

        {user ? (
          <div className="border-t border-surface-border px-5 py-4 dark:border-white/10">
            <div className="truncate text-xs font-medium text-slate-800 dark:text-slate-100" title={user.email}>
              {user.full_name?.trim() || user.email}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span className={`inline-block h-1.5 w-1.5 rounded-full bg-gradient-to-br ${cfg.gradient}`} />
              {ROLE_LABELS[user.role] ?? user.role}
              {user.tenant_name && <span className="text-slate-400"> · {user.tenant_name}</span>}
            </div>
          </div>
        ) : null}
      </aside>
    </>
  )
}
