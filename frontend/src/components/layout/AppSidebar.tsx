import { useState } from 'react'
import {
  Brain,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  ShoppingCart,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { useAuth } from '../../context/AuthContext'
import { HelpModal } from './HelpModal'

type NavDef = { to: string; label: string; perm: string; icon: typeof LayoutDashboard }

const MAIN_NAV: NavDef[] = [
  { to: '/dashboard', label: 'Dashboard', perm: 'sales.read', icon: LayoutDashboard },
  { to: '/sales', label: 'Satış', perm: 'sales.read', icon: ShoppingCart },
  { to: '/stock', label: 'Stok', perm: 'catalog.product.read', icon: Package },
  { to: '/finance', label: 'Finans', perm: 'finance.read', icon: Wallet },
  { to: '/ai', label: 'AI Analizi', perm: 'ai.insights.read', icon: Brain },
  { to: '/hr', label: 'İnsan Kaynakları', perm: 'hr.performance.read', icon: Users },
  { to: '/admin', label: 'Yönetim', perm: 'admin.access', icon: Settings },
]

export function AppSidebar() {
  const { user, logout, hasPermission } = useAuth()
  const items = MAIN_NAV.filter((n) => hasPermission(n.perm))
  const [helpOpen, setHelpOpen] = useState(false)

  return (
    <>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-surface-border bg-surface-card dark:border-white/10 dark:bg-[#12101f] dark:shadow-none">
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-brand-700 text-white shadow-lg shadow-violet-500/25">
          <Sparkles className="h-5 w-5" strokeWidth={2} />
        </div>
        <div>
          <div className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Future ERP AI</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Analytics &amp; operasyon</div>
        </div>
      </div>

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
                  ? 'bg-violet-500/15 text-violet-700 shadow-sm dark:bg-violet-500/20 dark:text-violet-200'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-violet-600 dark:text-violet-300' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`}
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
          <div className="mt-0.5 text-[11px] capitalize text-slate-500 dark:text-slate-400">{user.role}</div>
        </div>
      ) : null}
    </aside>
    </>
  )
}
