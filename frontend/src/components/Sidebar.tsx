import { NavLink } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'

type NavItem = { to: string; label: string; perm: string }

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', perm: 'sales.read' },
  { to: '/sales', label: 'Satış', perm: 'sales.read' },
  { to: '/stock', label: 'Stok', perm: 'catalog.product.read' },
  { to: '/finance', label: 'Finans', perm: 'finance.read' },
  { to: '/ai', label: 'AI Analizi', perm: 'ai.insights.read' },
  { to: '/admin', label: 'Yönetim', perm: 'admin.access' },
]

export function Sidebar() {
  const { user, logout, hasPermission } = useAuth()

  const items = NAV.filter((item) => hasPermission(item.perm))

  return (
    <aside className="flex h-full w-64 flex-col border-r border-slate-800 bg-slate-950/60 backdrop-blur">
      <div className="px-5 py-5">
        <div className="text-sm font-semibold tracking-wide text-slate-200">Future ERP AI</div>
        <div className="mt-1 text-xs text-slate-400">Sales • Inventory • Finance • AI</div>
      </div>

      <nav className="flex-1 px-3">
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/dashboard'}
                className={({ isActive }) =>
                  [
                    'block rounded-lg px-3 py-2 text-sm transition',
                    isActive
                      ? 'bg-slate-800/60 text-slate-50'
                      : 'text-slate-300 hover:bg-slate-900 hover:text-slate-50',
                  ].join(' ')
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-2 px-5 py-4">
        {user ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
            <div className="truncate text-slate-200" title={user.email}>
              {user.full_name?.trim() ? user.full_name : user.email}
            </div>
            <div className="mt-0.5 capitalize text-slate-500">{user.role}</div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => void logout()}
          className="w-full rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 transition hover:bg-slate-900 hover:text-slate-50"
        >
          Çıkış
        </button>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-500">
          Backend: <span className="text-slate-300">FastAPI</span>
        </div>
      </div>
    </aside>
  )
}
