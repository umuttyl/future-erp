import { useCallback, useEffect, useRef, useState } from 'react'
import { Command } from 'cmdk'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Bot,
  Building2,
  CreditCard,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  Users,
  Warehouse,
  UserPlus,
  Plus,
  Search,
  Loader2,
} from 'lucide-react'
import { api } from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SearchResult {
  id: number
  label: string
  sub?: string
}

// ── Static pages & actions ────────────────────────────────────────────────────

const PAGES = [
  { id: 'dashboard',   labelKey: 'cmdk.pageDashboard', icon: <LayoutDashboard className="w-4 h-4" />, path: '/dashboard' },
  { id: 'sales',       labelKey: 'cmdk.pageSales',     icon: <ShoppingCart className="w-4 h-4" />,    path: '/sales' },
  { id: 'customers',   labelKey: 'cmdk.pageCustomers', icon: <Users className="w-4 h-4" />,           path: '/customers' },
  { id: 'stock',       labelKey: 'cmdk.pageStock',     icon: <Warehouse className="w-4 h-4" />,       path: '/stock' },
  { id: 'orders',      labelKey: 'cmdk.pageOrders',    icon: <Package className="w-4 h-4" />,         path: '/orders' },
  { id: 'finance',     labelKey: 'cmdk.pageFinance',   icon: <BarChart3 className="w-4 h-4" />,       path: '/finance' },
  { id: 'cashbook',    labelKey: 'cmdk.pageCashbook',  icon: <CreditCard className="w-4 h-4" />,      path: '/cashbook' },
  { id: 'suppliers',   labelKey: 'cmdk.pageSuppliers', icon: <Building2 className="w-4 h-4" />,       path: '/suppliers' },
  { id: 'ai',          labelKey: 'cmdk.pageAi',        icon: <Bot className="w-4 h-4" />,             path: '/ai' },
  { id: 'settings',    labelKey: 'cmdk.pageSettings',  icon: <Settings className="w-4 h-4" />,        path: '/settings' },
]

const ACTIONS = [
  { id: 'new-sale',     labelKey: 'cmdk.newSale',     icon: <Plus className="w-4 h-4" />,    path: '/sales' },
  { id: 'new-customer', labelKey: 'cmdk.newCustomer', icon: <UserPlus className="w-4 h-4" />, path: '/customers' },
  { id: 'ask-ai',       labelKey: 'cmdk.askAi',       icon: <Bot className="w-4 h-4" />,     path: '/ai' },
]

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
}

export default function CommandPalette({ open, onClose }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState<SearchResult[]>([])
  const [products, setProducts] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Live search
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (!q) {
      setCustomers([])
      setProducts([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const [cRes, pRes] = await Promise.allSettled([
          api.get('/customers', { params: { search: q, limit: 5 } }),
          api.get('/products',  { params: { search: q, limit: 5 } }),
        ])
        if (cRes.status === 'fulfilled') {
          setCustomers(
            (cRes.value.data as { id: number; name: string; customer_type?: string }[]).map(c => ({
              id: c.id,
              label: c.name,
              sub: c.customer_type,
            }))
          )
        }
        if (pRes.status === 'fulfilled') {
          setProducts(
            (pRes.value.data as { id: number; name: string; sku?: string }[]).map(p => ({
              id: p.id,
              label: p.name,
              sub: p.sku,
            }))
          )
        }
      } finally {
        setSearching(false)
      }
    }, 220)
  }, [query, open])

  // Reset on close
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const go = useCallback((path: string) => {
    navigate(path)
    onClose()
  }, [navigate, onClose])

  if (!open) return null

  const showPages = !query.trim()

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg mx-4 bg-ui-surface rounded-2xl shadow-2xl border border-ui-border-sub dark:border-white/[0.08] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <Command className="[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ui-muted">

          {/* Search input */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-ui-border-sub">
            {searching
              ? <Loader2 className="w-4 h-4 text-ui-muted shrink-0 animate-spin" />
              : <Search className="w-4 h-4 text-ui-muted shrink-0" />
            }
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder={t('cmdk.searchPlaceholder')}
              className="flex-1 bg-transparent text-sm text-ui-text placeholder:text-ui-muted outline-none"
              autoFocus
            />
            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-ui-border px-1.5 py-0.5 text-[10px] text-ui-muted font-mono">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[360px] overflow-y-auto py-2">
            <Command.Empty className="py-10 text-center text-sm text-ui-muted">
              {t('cmdk.noResults')}
            </Command.Empty>

            {/* Quick actions */}
            <Command.Group heading={t('cmdk.groupActions')}>
              {ACTIONS.map(a => (
                <Command.Item
                  key={a.id}
                  value={t(a.labelKey)}
                  onSelect={() => go(a.path)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-ui-text cursor-pointer rounded-lg mx-1 aria-selected:bg-ui-accent/8 aria-selected:text-ui-accent"
                >
                  <span className="text-violet-500">{a.icon}</span>
                  {t(a.labelKey)}
                </Command.Item>
              ))}
            </Command.Group>

            {/* Pages — shown when no query */}
            {showPages && (
              <Command.Group heading={t('cmdk.groupPages')}>
                {PAGES.map(p => (
                  <Command.Item
                    key={p.id}
                    value={t(p.labelKey)}
                    onSelect={() => go(p.path)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-ui-text cursor-pointer rounded-lg mx-1 aria-selected:bg-ui-accent/8 aria-selected:text-ui-accent"
                  >
                    <span className="text-ui-muted">{p.icon}</span>
                    {t(p.labelKey)}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Live: customers */}
            {customers.length > 0 && (
              <Command.Group heading={t('cmdk.groupCustomers')}>
                {customers.map(c => (
                  <Command.Item
                    key={`customer-${c.id}`}
                    value={`${t('cmdk.groupCustomers')} ${c.label}`}
                    onSelect={() => go('/customers')}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-ui-text cursor-pointer rounded-lg mx-1 aria-selected:bg-ui-accent/8 aria-selected:text-ui-accent"
                  >
                    <span className="text-ui-muted"><Users className="w-4 h-4" /></span>
                    <span className="flex-1 truncate">{c.label}</span>
                    {c.sub && <span className="text-xs text-ui-muted">{c.sub}</span>}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Live: products */}
            {products.length > 0 && (
              <Command.Group heading={t('cmdk.groupProducts')}>
                {products.map(p => (
                  <Command.Item
                    key={`product-${p.id}`}
                    value={`${t('cmdk.groupProducts')} ${p.label}`}
                    onSelect={() => go('/stock')}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-ui-text cursor-pointer rounded-lg mx-1 aria-selected:bg-ui-accent/8 aria-selected:text-ui-accent"
                  >
                    <span className="text-ui-muted"><Package className="w-4 h-4" /></span>
                    <span className="flex-1 truncate">{p.label}</span>
                    {p.sub && <span className="text-xs text-ui-muted font-mono">{p.sub}</span>}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>

          {/* Footer hint */}
          <div className="flex items-center gap-3 border-t border-ui-border-sub px-4 py-2">
            <span className="text-[10px] text-ui-muted flex items-center gap-1">
              <kbd className="rounded border border-ui-border px-1 font-mono">↑↓</kbd> {t('cmdk.navHint')}
            </span>
            <span className="text-[10px] text-ui-muted flex items-center gap-1">
              <kbd className="rounded border border-ui-border px-1 font-mono">↵</kbd> {t('cmdk.selectHint')}
            </span>
            <span className="text-[10px] text-ui-muted flex items-center gap-1">
              <kbd className="rounded border border-ui-border px-1 font-mono">ESC</kbd> {t('cmdk.closeHint')}
            </span>
          </div>
        </Command>
      </div>
    </div>
  )
}
