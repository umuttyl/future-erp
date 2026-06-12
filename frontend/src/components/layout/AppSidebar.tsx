import { useEffect, useState } from 'react'
import {
  ArrowLeftFromLine,
  Brain,
  Building2,
  ChevronLeft,
  ChevronRight,
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
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { NavLink, useNavigate } from 'react-router-dom'

import { useAuth } from '../../context/AuthContext'
import { fetchActiveModules } from '../../lib/api'
import { stopImpersonation, useImpersonation } from '../../lib/impersonation'
import { HelpModal } from './HelpModal'

type NavDef = {
  to: string
  labelKey: string
  perm: string
  anyPerm?: string[]
  icon: typeof LayoutDashboard
  moduleKey: string | null
  adminOnly?: boolean
}

const MAIN_NAV: NavDef[] = [
  { to: '/dashboard', labelKey: 'nav.dashboard',     perm: 'sales.read',           icon: LayoutDashboard, moduleKey: null },
  { to: '/sales',     labelKey: 'nav.sales',         perm: 'sales.read',           icon: ShoppingCart,    moduleKey: 'sales' },
  { to: '/customers', labelKey: 'nav.customers',     perm: 'sales.read',           icon: Building2,       moduleKey: 'crm' },
  { to: '/stock',     labelKey: 'nav.stock',         perm: 'catalog.product.read', icon: Package,         moduleKey: 'inventory' },
  { to: '/orders',    labelKey: 'nav.orders',        perm: 'orders.read',          icon: ClipboardList,   moduleKey: 'purchasing' },
  { to: '/suppliers', labelKey: 'nav.suppliers',     perm: 'catalog.product.read', icon: Truck,           moduleKey: 'suppliers' },
  { to: '/finance',   labelKey: 'nav.finance',       perm: 'finance.read',         icon: Wallet,          moduleKey: 'finance' },
  { to: '/ai',        labelKey: 'nav.ai',            perm: 'ai.insights.read',     icon: Brain,           moduleKey: 'ai' },
  { to: '/hr',        labelKey: 'nav.hr',            perm: 'hr.performance.read',  anyPerm: ['hr.performance.read', 'hr.tasks.read'], icon: Users, moduleKey: 'hr' },
  { to: '/settings',  labelKey: 'nav.settings',      perm: 'admin.users.write',    icon: Sliders,         moduleKey: null },
  { to: '/admin',     labelKey: 'nav.platformAdmin', perm: 'admin.users.write',    icon: Settings,        moduleKey: null, adminOnly: true },
]

const ROLE_CONFIG = {
  admin: {
    gradient:       'from-red-500 to-rose-700',
    shadow:         'shadow-red-500/25',
    subtitleKey:    'roleSubtitle.platform_admin',
    activeClass:    'text-red-700 dark:text-red-200',
    iconActiveClass:'text-red-600 dark:text-red-300',
    activeBg:       'bg-red-500/8 dark:bg-red-500/12',
    accentBar:      'from-red-500 to-red-500/0',
  },
  manager: {
    gradient:       'from-violet-500 to-brand-700',
    shadow:         'shadow-violet-500/25',
    subtitleKey:    'roleSubtitle.owner',
    activeClass:    'text-violet-700 dark:text-violet-200',
    iconActiveClass:'text-violet-600 dark:text-violet-300',
    activeBg:       'bg-violet-500/8 dark:bg-violet-500/12',
    accentBar:      'from-violet-500 to-violet-500/0',
  },
  employee: {
    gradient:       'from-indigo-500 to-blue-700',
    shadow:         'shadow-indigo-500/25',
    subtitleKey:    'roleSubtitle.staff',
    activeClass:    'text-indigo-700 dark:text-indigo-200',
    iconActiveClass:'text-indigo-600 dark:text-indigo-300',
    activeBg:       'bg-indigo-500/8 dark:bg-indigo-500/12',
    accentBar:      'from-indigo-500 to-indigo-500/0',
  },
} as const

type RoleKey = keyof typeof ROLE_CONFIG

const ROLE_LABEL_KEYS: Record<string, string> = {
  admin:    'roleLabel.admin',
  manager:  'roleLabel.manager',
  employee: 'roleLabel.employee',
}

const COMPACT_KEY = 'erp_sidebar_compact'

export function AppSidebar() {
  const { t } = useTranslation()
  const { user, logout, hasPermission } = useAuth()
  const navigate = useNavigate()
  const [helpOpen, setHelpOpen] = useState(false)
  const [activeModules, setActiveModules] = useState<string[] | null>(null)
  const { tenantId: impersonateTenantId, tenantName: impersonateTenantName } = useImpersonation()
  const [compact, setCompact] = useState(() => {
    try { return localStorage.getItem(COMPACT_KEY) === '1' } catch { return false }
  })

  const role = (user?.role ?? 'employee') as RoleKey
  const cfg  = ROLE_CONFIG[role] ?? ROLE_CONFIG.employee

  useEffect(() => {
    fetchActiveModules()
      .then((res) => setActiveModules(res.active_modules))
      .catch(() => setActiveModules(null))
  }, [user?.id, impersonateTenantId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault()
        toggleCompact()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function toggleCompact() {
    setCompact((v) => {
      const next = !v
      try { localStorage.setItem(COMPACT_KEY, next ? '1' : '0') } catch { /* */ }
      return next
    })
  }

  const adminNavItems: NavDef[] = [
    { to: '/dashboard', labelKey: 'nav.platformPanel',    perm: 'admin.users.write', icon: LayoutDashboard, moduleKey: null },
    { to: '/admin',     labelKey: 'nav.tenantUsers',      perm: 'admin.users.write', icon: Users,           moduleKey: null },
    { to: '/ai',        labelKey: 'nav.aiCommand',        perm: 'ai.insights.read',  icon: Brain,           moduleKey: null },
    { to: '/settings',  labelKey: 'nav.platformSettings', perm: 'admin.users.write', icon: Sliders,         moduleKey: null },
  ]

  const items = role === 'admin' && !impersonateTenantId
    ? adminNavItems
    : MAIN_NAV.filter((n) => {
        if (n.adminOnly) return false
        // All staff always see Team (task access requires no special permission)
        if (n.moduleKey === 'hr' && user?.role_kind === 'staff') return true
        const permOk = n.anyPerm ? n.anyPerm.some(p => hasPermission(p)) : hasPermission(n.perm)
        if (!permOk) return false
        if (n.moduleKey === null) return true
        if (activeModules === null || activeModules.length === 0) return true
        return activeModules.includes(n.moduleKey)
      })

  const userInitial = (user?.full_name?.trim() || user?.email || '?')[0].toUpperCase()

  return (
    <>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <aside
        className={`flex shrink-0 flex-col border-r border-ui-border-sub bg-ui-sidebar transition-[width] duration-200 dark:border-white/[0.06] ${compact ? 'w-16' : 'w-[260px]'}`}
      >
        {/* Logo + compact toggle */}
        <div className={`relative flex items-center gap-3 border-b border-ui-border-sub py-5 dark:border-white/[0.04] ${compact ? 'justify-center px-2' : 'px-4'}`}>
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${cfg.gradient} text-white shadow-lg ${cfg.shadow}`}>
            <Sparkles className="h-4 w-4" strokeWidth={2} />
          </div>
          {!compact && (
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold tracking-tight text-ui-text">Future ERP AI</div>
              <div className="text-[11px] text-ui-muted">{t(cfg.subtitleKey)}</div>
            </div>
          )}
          <button
            type="button"
            onClick={toggleCompact}
            title={compact ? 'Expand (Ctrl+B)' : 'Collapse (Ctrl+B)'}
            className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-ui-border bg-ui-surface text-ui-muted shadow-sm transition hover:border-ui-accent/40 hover:bg-ui-surface-2 hover:text-ui-accent dark:border-white/10 dark:hover:border-ui-accent/30"
          >
            {compact
              ? <ChevronRight className="h-3 w-3" strokeWidth={2.5} />
              : <ChevronLeft className="h-3 w-3" strokeWidth={2.5} />
            }
          </button>
        </div>

        {/* Impersonation banner */}
        {role === 'admin' && impersonateTenantName && !compact && (
          <div className="mx-3 mb-2 rounded-xl border border-indigo-200/80 bg-indigo-50 px-3 py-2 dark:border-indigo-500/25 dark:bg-indigo-950/40">
            <p className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
              {t('sidebar.impersonating', { name: impersonateTenantName })}
            </p>
            <button
              type="button"
              onClick={() => { stopImpersonation(); navigate('/admin') }}
              className="mt-1 flex items-center gap-1 text-[10px] font-medium text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-200"
            >
              <ArrowLeftFromLine className="h-3 w-3" />
              {t('sidebar.backToPlatform')}
            </button>
          </div>
        )}

        {/* Admin banner */}
        {role === 'admin' && !impersonateTenantName && !compact && (
          <div className="mx-3 mb-2 rounded-xl border border-red-200/70 bg-red-50/80 px-3 py-2 dark:border-red-500/20 dark:bg-red-950/20">
            <p className="text-[11px] font-semibold text-red-700 dark:text-red-300">{t('sidebar.platformAdminBanner')}</p>
            <p className="mt-0.5 text-[10px] text-red-500 dark:text-red-400">{t('sidebar.platformAdminBannerHint')}</p>
          </div>
        )}

        {/* Employee banner */}
        {role === 'employee' && !compact && (
          <div className="mx-3 mb-2 rounded-xl border border-indigo-200/70 bg-indigo-50/80 px-3 py-2 dark:border-indigo-500/20 dark:bg-indigo-950/25">
            <p className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
              {user?.department ? `${user.department} · ` : ''}{t('roleLabel.employee')}
            </p>
            <p className="mt-0.5 text-[10px] text-indigo-500 dark:text-indigo-400">
              {t('sidebar.employeeBannerHint')}
            </p>
          </div>
        )}

        {/* Nav */}
        <nav className={`flex-1 space-y-0.5 overflow-y-auto py-2 ${compact ? 'px-1.5' : 'px-2.5'}`}>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/dashboard'}
              title={compact ? t(item.labelKey) : undefined}
              className={({ isActive }) =>
                [
                  'group relative flex items-center rounded-xl py-2.5 text-sm font-medium transition-all duration-150',
                  compact ? 'justify-center px-0' : 'gap-3 px-3',
                  isActive
                    ? `${cfg.activeBg} ${cfg.activeClass}`
                    : 'text-ui-muted hover:bg-ui-surface-2 hover:text-ui-text',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  {/* Left accent bar — animated with layoutId */}
                  {isActive && !compact && (
                    <motion.span
                      layoutId="nav-active-bar"
                      className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-gradient-to-b ${cfg.accentBar}`}
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  )}
                  <item.icon
                    className={`h-[18px] w-[18px] shrink-0 ${isActive ? cfg.iconActiveClass : 'text-ui-muted group-hover:text-ui-text'}`}
                    strokeWidth={2}
                  />
                  {!compact && <span>{t(item.labelKey)}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom actions */}
        <div className={`mt-auto space-y-0.5 border-t border-ui-border-sub py-3 dark:border-white/[0.06] ${compact ? 'px-1.5' : 'px-2.5'}`}>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            title={compact ? t('nav.help') : undefined}
            className={`flex w-full items-center rounded-xl py-2.5 text-left text-sm text-ui-muted transition-all duration-150 hover:bg-ui-surface-2 hover:text-ui-text ${compact ? 'justify-center px-0' : 'gap-3 px-3'}`}
          >
            <HelpCircle className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
            {!compact && <span>{t('nav.help')}</span>}
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            title={compact ? t('nav.logout') : undefined}
            className={`flex w-full items-center rounded-xl py-2.5 text-left text-sm text-rose-500 transition-all duration-150 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-300 ${compact ? 'justify-center px-0' : 'gap-3 px-3'}`}
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
            {!compact && <span>{t('nav.logout')}</span>}
          </button>
        </div>

        {/* User profile card */}
        {user && !compact && (
          <div className="border-t border-ui-border-sub px-3 py-3 dark:border-white/[0.06]">
            <div className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-ui-surface-2">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${cfg.gradient} text-xs font-bold text-white shadow-md ring-2 ring-white/10`}>
                {userInitial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-ui-text" title={user.email}>
                  {user.full_name?.trim() || user.email}
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-[10px] text-ui-muted">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full bg-gradient-to-br ${cfg.gradient}`} />
                  {ROLE_LABEL_KEYS[user.role] ? t(ROLE_LABEL_KEYS[user.role]) : user.role}
                  {user.tenant_name && <span className="truncate"> · {user.tenant_name}</span>}
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
