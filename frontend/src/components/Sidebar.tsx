import { NavLink } from 'react-router-dom'

const nav = [
  { to: '/', label: 'Dashboard' },
  { to: '/sales', label: 'Satış' },
  { to: '/stock', label: 'Stok' },
  { to: '/finance', label: 'Finans' },
  { to: '/ai', label: 'AI Analizi' },
]

export function Sidebar() {
  return (
    <aside className="flex h-full w-64 flex-col border-r border-slate-800 bg-slate-950/60 backdrop-blur">
      <div className="px-5 py-5">
        <div className="text-sm font-semibold tracking-wide text-slate-200">
          Future ERP AI
        </div>
        <div className="mt-1 text-xs text-slate-400">
          Sales • Inventory • Finance • AI
        </div>
      </div>

      <nav className="flex-1 px-3">
        <ul className="space-y-1">
          {nav.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
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

      <div className="px-5 py-4 text-xs text-slate-500">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
          Backend: <span className="text-slate-300">FastAPI</span>
        </div>
      </div>
    </aside>
  )
}

