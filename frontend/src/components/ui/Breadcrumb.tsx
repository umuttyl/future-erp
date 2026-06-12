import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'

type Crumb = { labelKey: string; to: string }

const ROUTE_CRUMBS: Record<string, Crumb[]> = {
  '/dashboard':    [{ labelKey: 'nav.dashboard',    to: '/dashboard' }],
  '/sales':        [{ labelKey: 'nav.sales',        to: '/sales' }],
  '/customers':    [{ labelKey: 'nav.customers',    to: '/customers' }],
  '/stock':        [{ labelKey: 'nav.stock',        to: '/stock' }],
  '/suppliers':    [{ labelKey: 'nav.suppliers',    to: '/suppliers' }],
  '/orders':       [{ labelKey: 'nav.orders',       to: '/orders' }],
  '/sales-orders': [
    { labelKey: 'nav.orders',      to: '/orders' },
    { labelKey: 'nav.salesOrders', to: '/sales-orders' },
  ],
  '/finance':      [{ labelKey: 'nav.finance',      to: '/finance' }],
  '/ai':           [{ labelKey: 'nav.ai',           to: '/ai' }],
  '/hr':           [{ labelKey: 'nav.hr',           to: '/hr' }],
  '/settings':     [{ labelKey: 'nav.settings',     to: '/settings' }],
  '/admin':        [{ labelKey: 'nav.platformAdmin', to: '/admin' }],
}

export function Breadcrumb() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const base = '/' + (pathname.split('/').filter(Boolean)[0] ?? '')
  const crumbs = ROUTE_CRUMBS[base] ?? []

  if (crumbs.length <= 1) return null

  return (
    <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1 text-xs">
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <span key={c.to} className="flex items-center gap-1">
            {i > 0 && (
              <ChevronRight className="h-3 w-3 text-slate-300 dark:text-slate-600" strokeWidth={2.5} />
            )}
            {isLast ? (
              <span className="font-semibold text-slate-700 dark:text-slate-200">{t(c.labelKey)}</span>
            ) : (
              <Link
                to={c.to}
                className="text-slate-400 transition-colors hover:text-violet-600 dark:text-slate-500 dark:hover:text-violet-400"
              >
                {t(c.labelKey)}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
