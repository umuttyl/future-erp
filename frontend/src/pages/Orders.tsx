import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle, FileText, Package, PackageCheck, Plus, TrendingUp, X, XCircle } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'

import { AIReorderPanel } from '../components/ai/AIReorderPanel'
import { GlobalCard, GlobalCardHeader } from '../components/ui/GlobalCard'
import { PageLayout } from '../components/ui/PageLayout'
import { EmptyState } from '../components/ui/EmptyState'
import { inputFieldClass, primaryButtonClass, selectFieldClass, tableCellClass, tableHeaderClass, tableRowHoverClass } from '../components/ui/forms'
import { useAuth } from '../context/AuthContext'
import { api, formatCurrency, getApiErrorMessage, getActiveLocale, type Product, type Supplier } from '../lib/api'

function OrderTabs() {
  const { t } = useTranslation()
  return (
    <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/5 w-fit">
      {[
        { to: '/orders',       label: t('orders.title'), icon: Package },
        { to: '/sales-orders', label: t('orders.customerOrdersTitle'), icon: FileText },
      ].map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to}
          className={({ isActive }) =>
            `flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-white shadow-sm text-slate-900 dark:bg-white/10 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`
          }
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </NavLink>
      ))}
    </div>
  )
}

interface SupplyOrderRow {
  id: number
  product_id: number
  product_name?: string | null
  supplier_id?: number | null
  supplier_name?: string | null
  quantity: number
  unit_cost?: number | null
  total_cost?: number | null
  status: string
  created_at: string
}

// Visual config per status
const STATUS_CONFIG: Record<string, { badge: string; label: string }> = {
  Draft:     { badge: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',        label: 'orders.draft' },
  Approved:  { badge: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300',            label: 'orders.approved' },
  Received:  { badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300', label: 'orders.received' },
  Cancelled: { badge: 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-400',            label: 'orders.cancelled' },
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG['Draft']
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.badge}`}>
      {t(cfg.label)}
    </span>
  )
}

interface ApprovalToast {
  type: 'ordered' | 'received'
  productName: string
  quantity: number
}

// A minimal timeline stepper for the order flow
function OrderFlowStepper() {
  const steps = [
    { key: 'Draft',    label: 'Draft',    desc: 'Order prepared' },
    { key: 'Approved', label: 'Ordered',  desc: 'Sent to supplier' },
    { key: 'Received', label: 'Received', desc: 'Stock updated' },
  ]
  return (
    <div className="flex items-center gap-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
      <p className="mr-4 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Workflow</p>
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center">
          {i > 0 && <div className="mx-2 h-px w-8 bg-slate-300 dark:bg-white/15" />}
          <div className="text-center">
            <div className={`mx-auto mb-0.5 h-2 w-2 rounded-full ${
              s.key === 'Draft' ? 'bg-amber-400' : s.key === 'Approved' ? 'bg-blue-400' : 'bg-emerald-500'
            }`} />
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{s.label}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">{s.desc}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function NewSupplyOrderModal({
  products,
  suppliers,
  onClose,
  onCreated,
}: {
  products: Product[]
  suppliers: Supplier[]
  onClose: () => void
  onCreated: () => void
}) {
  const { t } = useTranslation()
  const [productId, setProductId] = useState<number>(products[0]?.id ?? 0)
  const [supplierId, setSupplierId] = useState<number | ''>('')
  const [quantity, setQuantity] = useState(1)
  const [unitCost, setUnitCost] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Ürün değişince cost_price'ı unit_cost alanına otomatik doldur
  function handleProductChange(newId: number) {
    setProductId(newId)
    const p = products.find(p => p.id === newId)
    if (p?.cost_price != null && Number(p.cost_price) > 0) {
      setUnitCost(String(p.cost_price))
    } else {
      setUnitCost('')
    }
  }

  // İlk render'da da doldur
  useState(() => {
    const p = products.find(p => p.id === productId)
    if (p?.cost_price != null && Number(p.cost_price) > 0) setUnitCost(String(p.cost_price))
  })

  const totalCost = unitCost && quantity ? (parseFloat(unitCost) * quantity) : null

  async function handleSave() {
    if (!productId) { setErr('Select a product.'); return }
    if (quantity < 1) { setErr('Quantity must be at least 1.'); return }
    setSaving(true)
    setErr(null)
    try {
      await api.post('/inventory/orders', {
        product_id: productId,
        quantity,
        supplier_id: supplierId !== '' ? supplierId : null,
        unit_cost: unitCost ? parseFloat(unitCost) : null,
      })
      onCreated()
    } catch (e: unknown) {
      setErr(getApiErrorMessage(e, 'Failed to create order.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-[#16122b]" onClick={e => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">New Supply Order</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X size={16} /></button>
        </div>

        {err && <div className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{err}</div>}

        <div className="space-y-4">
          <div>
            <label htmlFor="so-product" className="mb-1 block text-xs font-medium text-slate-500">Product</label>
            <select
              id="so-product"
              className={selectFieldClass}
              value={productId}
              onChange={e => handleProductChange(Number(e.target.value))}
            >
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {suppliers.length > 0 && (
            <div>
              <label htmlFor="so-supplier" className="mb-1 block text-xs font-medium text-slate-500">
                Supplier <span className="text-slate-400">(optional)</span>
              </label>
              <select
                id="so-supplier"
                className={selectFieldClass}
                value={supplierId}
                onChange={e => setSupplierId(e.target.value !== '' ? Number(e.target.value) : '')}
              >
                <option value="">— No supplier —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="so-qty" className="mb-1 block text-xs font-medium text-slate-500">Quantity</label>
              <input
                id="so-qty"
                type="number"
                min={1}
                className={inputFieldClass}
                value={quantity}
                onChange={e => setQuantity(Math.max(1, Number(e.target.value)))}
              />
            </div>
            <div>
              <label htmlFor="so-cost" className="mb-1 block text-xs font-medium text-slate-500">
                Unit Cost
              </label>
              <input
                id="so-cost"
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                className={inputFieldClass}
                value={unitCost}
                onChange={e => setUnitCost(e.target.value)}
              />
            </div>
          </div>

          {totalCost != null && totalCost > 0 && (
            <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 dark:border-violet-500/20 dark:bg-violet-950/30">
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Purchase Cost</p>
              <p className="text-base font-semibold text-violet-700 dark:text-violet-300">
                {formatCurrency(totalCost)}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">Will be recorded in Finance automatically when received</p>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className={primaryButtonClass + ' px-4 py-2 text-sm'}
          >
            {saving ? 'Creating…' : 'Create Draft Order'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function OrdersPage() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canAdjust = hasPermission('stock.adjust')

  const [orders, setOrders] = useState<SupplyOrderRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<number | null>(null)
  const [toast, setToast] = useState<ApprovalToast | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [panelRefreshKey, setPanelRefreshKey] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [{ data: orderData }, { data: productData }, { data: supplierData }] = await Promise.all([
        api.get<SupplyOrderRow[]>('/inventory/orders'),
        api.get<Product[]>('/products', { params: { limit: 500 } }),
        api.get<Supplier[]>('/suppliers', { params: { limit: 200 } }),
      ])
      setOrders(orderData)
      setProducts(productData)
      setSuppliers(supplierData)
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, t('orders.loadError')))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(timer)
  }, [toast])

  async function updateStatus(order: SupplyOrderRow, newStatus: string) {
    const name = order.product_name ?? `Product #${order.product_id}`

    if (newStatus === 'Approved') {
      const ok = window.confirm(
        `Send order #${order.id} to supplier?\n\n` +
        `Product: ${name}\n` +
        `Quantity: ${order.quantity} units\n\n` +
        `Stock will update when you mark the delivery as Received.`
      )
      if (!ok) return
    }

    if (newStatus === 'Received') {
      const costLine = order.total_cost
        ? `\nPurchase cost: ${formatCurrency(Number(order.total_cost))} → will be recorded in Finance automatically.`
        : ''
      const ok = window.confirm(
        `Mark order #${order.id} as Received?\n\n` +
        `+${order.quantity} units of "${name}" will be added to stock immediately.` +
        costLine
      )
      if (!ok) return
    }

    setActionBusy(order.id)
    try {
      await api.patch(`/inventory/orders/${order.id}/status`, { status: newStatus })
      await load()
      if (newStatus === 'Approved') {
        setToast({ type: 'ordered', productName: name, quantity: order.quantity })
      } else if (newStatus === 'Received') {
        setToast({ type: 'received', productName: name, quantity: order.quantity })
        setPanelRefreshKey(k => k + 1)
      }
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, t('orders.statusError')))
    } finally {
      setActionBusy(null)
    }
  }

  const draftCount    = orders.filter(o => o.status === 'Draft').length
  const approvedCount = orders.filter(o => o.status === 'Approved').length

  return (
    <PageLayout
      title={t('orders.title')}
      subtitle={t('orders.manageSubtitle')}
      actions={
        canAdjust ? (
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className={primaryButtonClass + ' flex items-center gap-1.5'}
          >
            <Plus size={15} /> New Order
          </button>
        ) : undefined
      }
    >
      <OrderTabs />

      {/* Status toast */}
      {toast && (
        <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${
          toast.type === 'received'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-200'
            : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-950/40 dark:text-blue-200'
        }`}>
          {toast.type === 'received' ? <TrendingUp className="h-4 w-4 shrink-0" /> : <PackageCheck className="h-4 w-4 shrink-0" />}
          <span>
            {toast.type === 'received'
              ? <><strong>Stock updated:</strong> +{toast.quantity} units added to <strong>{toast.productName}</strong></>
              : <><strong>Order sent to supplier.</strong> Mark as Received when goods arrive — stock will update then.</>
            }
          </span>
          {toast.type === 'received' && (
            <Link
              to="/stock"
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
            >
              View Stock →
            </Link>
          )}
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setToast(null)}
            className="ml-auto shrink-0 rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
          >
            <XCircle className="h-3.5 w-3.5 opacity-60" />
          </button>
        </div>
      )}

      {/* Pending-approval info banners */}
      {approvedCount > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-950/30 dark:text-blue-200">
          <PackageCheck className="h-4 w-4 shrink-0" />
          <span>
            <strong>{approvedCount} order{approvedCount > 1 ? 's' : ''} awaiting delivery.</strong>{' '}
            Click <strong>"Mark Received"</strong> when goods arrive — that's when stock updates.
          </span>
        </div>
      )}

      <AIReorderPanel refreshKey={panelRefreshKey} />

      {/* Workflow explainer */}
      <OrderFlowStepper />

      <GlobalCard>
        <GlobalCardHeader
          title={t('orders.title')}
          description={
            draftCount > 0
              ? `${draftCount} draft${draftCount > 1 ? 's' : ''} to send · ${approvedCount} awaiting delivery`
              : approvedCount > 0
                ? `${approvedCount} order${approvedCount > 1 ? 's' : ''} awaiting delivery`
                : undefined
          }
        />
        {error && <p className="mb-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            title={t('orders.empty')}
            description={t('orders.emptyHint')}
          />
        ) : (
          <div className="-mx-5 overflow-x-auto border-t border-slate-100 dark:border-white/5">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <th className={`py-3 pl-5 pr-4 ${tableHeaderClass}`}>ID</th>
                  <th className={`py-3 pr-4 ${tableHeaderClass}`}>Product</th>
                  <th className={`py-3 pr-4 ${tableHeaderClass}`}>Supplier</th>
                  <th className={`py-3 pr-4 ${tableHeaderClass}`}>Qty</th>
                  <th className={`py-3 pr-4 ${tableHeaderClass} text-right`}>Total Cost</th>
                  <th className={`py-3 pr-4 ${tableHeaderClass}`}>{t('orders.status')}</th>
                  <th className={`py-3 pr-4 ${tableHeaderClass}`}>{t('orders.colCreatedAt')}</th>
                  {canAdjust && <th className={`py-3 pr-5 ${tableHeaderClass}`}>{t('common.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className={tableRowHoverClass}>
                    <td className="py-3 pl-5 pr-4 font-mono text-xs text-slate-400 dark:text-slate-500">#{o.id}</td>
                    <td className={`py-3 pr-4 font-medium ${tableCellClass}`}>
                      {o.product_name ?? `Product #${o.product_id}`}
                    </td>
                    <td className={`py-3 pr-4 ${tableCellClass}`}>
                      {o.supplier_name
                        ? <span className="text-slate-700 dark:text-slate-300">{o.supplier_name}</span>
                        : <span className="text-slate-300 dark:text-slate-600">—</span>
                      }
                    </td>
                    <td className={`py-3 pr-4 ${tableCellClass}`}>
                      <span className="font-semibold tabular-nums">{o.quantity}</span>
                      {o.status === 'Draft' && (
                        <span className="ml-1.5 text-[11px] text-slate-400">units</span>
                      )}
                      {o.status === 'Approved' && (
                        <span className="ml-1.5 text-[11px] text-blue-500 dark:text-blue-400">on the way</span>
                      )}
                      {o.status === 'Received' && (
                        <span className="ml-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">+added to stock</span>
                      )}
                    </td>
                    <td className={`py-3 pr-4 text-right tabular-nums ${tableCellClass}`}>
                      {o.total_cost != null && Number(o.total_cost) > 0
                        ? (
                          <span className={o.status === 'Received' ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}>
                            {formatCurrency(Number(o.total_cost))}
                          </span>
                        )
                        : <span className="text-slate-300 dark:text-slate-600">—</span>
                      }
                    </td>
                    <td className="py-3 pr-4"><StatusBadge status={o.status} /></td>
                    <td className={`py-3 pr-4 ${tableCellClass}`}>{new Date(o.created_at).toLocaleDateString(getActiveLocale())}</td>
                    {canAdjust && (
                      <td className="py-3 pr-5">
                        {o.status === 'Draft' && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={actionBusy === o.id}
                              onClick={() => void updateStatus(o, 'Approved')}
                              title="Send this order to the supplier"
                              className="flex h-7 items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
                            >
                              {actionBusy === o.id
                                ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                                : <CheckCircle className="h-3.5 w-3.5" />
                              }
                              {t('orders.approve')}
                            </button>
                            <button
                              type="button"
                              disabled={actionBusy === o.id}
                              onClick={() => void updateStatus(o, 'Cancelled')}
                              className="flex h-7 items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              {t('orders.cancel')}
                            </button>
                          </div>
                        )}
                        {o.status === 'Approved' && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={actionBusy === o.id}
                              onClick={() => void updateStatus(o, 'Received')}
                              title="Mark as received — stock will be updated"
                              className="flex h-7 items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                            >
                              {actionBusy === o.id
                                ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                                : <PackageCheck className="h-3.5 w-3.5" />
                              }
                              {t('orders.markReceived')}
                            </button>
                            <button
                              type="button"
                              disabled={actionBusy === o.id}
                              onClick={() => void updateStatus(o, 'Cancelled')}
                              className="flex h-7 items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              {t('orders.cancel')}
                            </button>
                          </div>
                        )}
                        {(o.status === 'Received' || o.status === 'Cancelled') && (
                          <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlobalCard>

      {showNewModal && products.length > 0 && (
        <NewSupplyOrderModal
          products={products}
          suppliers={suppliers}
          onClose={() => setShowNewModal(false)}
          onCreated={() => {
            setShowNewModal(false)
            void load()
          }}
        />
      )}
    </PageLayout>
  )
}
