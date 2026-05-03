import { CalendarDays, ChevronDown, Moon, Search, Sun } from 'lucide-react'

import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { NotificationBell } from './NotificationBell'

export function AppTopbar() {
  const { theme, toggleTheme } = useTheme()
  const { user } = useAuth()

  const displayName = user?.full_name?.trim() || user?.email || 'Kullanıcı'
  const roleLabel = user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : ''

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b border-surface-border bg-surface-card/90 px-4 backdrop-blur-md dark:border-white/10 dark:bg-[#12101f]/90 md:px-8">
      <div className="relative min-w-0 max-w-xl flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Ara… (ürün, müşteri, kayıt)"
          className="w-full rounded-full border border-surface-border bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-800 outline-none ring-violet-500/30 placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 dark:border-white/10 dark:bg-[#1a1628] dark:text-slate-100 dark:placeholder:text-slate-500"
          readOnly
          title="Arama yakında"
        />
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          aria-label={theme === 'dark' ? 'Açık tema' : 'Koyu tema'}
        >
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <NotificationBell />
        <button
          type="button"
          className="hidden h-10 items-center gap-2 rounded-full border border-surface-border px-3 text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5 sm:flex"
          aria-label="Takvim"
        >
          <CalendarDays className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 rounded-2xl border border-surface-border bg-slate-50 py-1.5 pl-1.5 pr-2 dark:border-white/10 dark:bg-[#1a1628]">
          <div className="relative">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-bold text-white">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-[#1a1628]" />
          </div>
          <div className="hidden min-w-0 text-left sm:block">
            <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{displayName}</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">{roleLabel}</div>
          </div>
          <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
        </div>
      </div>
    </header>
  )
}
