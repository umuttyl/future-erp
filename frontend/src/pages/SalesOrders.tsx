import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Download, FileText, Package, Plus, Send, Truck, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { GlobalCard } from '../components/ui/GlobalCard'
import { PageLayout } from '../components/ui/PageLayout'

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
import { EmptyState } from '../components/ui/EmptyState'
import { SkeletonTable } from '../components/ui/Skeleton'
import {
  inputFieldClass,
  primaryButtonClass,
  secondaryButtonClass,
  selectFieldClass,
  tableCellClass,
  tableHeaderClass,
  tableRowHoverClass,
  textareaFieldClass,
} from '../components/ui/forms'
import {
  cancelOrder,
  confirmOrder,
  createDeliveryNote,
  createInvoice,
  createOrder,
  downloadEFaturaXml,
  fetchCustomers,
  fetchDeliveryNotes,
  fetchInvoices,
  fetchOrder,
  fetchOrders,
  formatCurrency,
  formatDate,
  getApiErrorMessage,
  type Customer,
  type CustomerOrder,
  type CustomerOrderCreate,
  type DeliveryNote,
  type DeliveryNoteCreate,
  type Invoice,
  type InvoiceCreate,
  type Product,
  api,
  downloadExport,
} from '../lib/api'

function fmtCurrency(v: string | number) {
  return formatCurrency(Number(v))
}

const STATUS_LABELS: Record<string, { labelKey: string; cls: string }> = {
  draft: { labelKey: 'orders.draft', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  confirmed: { labelKey: 'salesOrders.confirmed', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
  shipped: { labelKey: 'salesOrders.shipped', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  invoiced: { labelKey: 'salesOrders.invoiced', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  cancelled: { labelKey: 'orders.cancelled', cls: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300' },
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  const s = STATUS_LABELS[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${s?.cls ?? 'bg-slate-100 text-slate-600'}`}>
      {s ? t(s.labelKey) : status}
    </span>
  )
}

// ─── New Order Modal ──────────────────────────────────────────────────────────

type LineItem = {
  product_id: number
  quantity: number
  unit_price: number
  tax_rate: number
}

function NewOrderModal({
  products,
  customers,
  onClose,
  onCreated,
}: {
  products: Product[]
  customers: Customer[]
  onClose: () => void
  onCreated: (o: CustomerOrder) => void
}) {
  const { t } = useTranslation()
  const today = new Date().toISOString().slice(0, 10)
  const [orderNo, setOrderNo] = useState('')
  const [orderDate, setOrderDate] = useState(today)
  const [customerId, setCustomerId] = useState<number | ''>('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineItem[]>([
    { product_id: products[0]?.id ?? 0, quantity: 1, unit_price: Number(products[0]?.unit_price ?? 0), tax_rate: Number(products[0]?.tax_rate ?? 20) },
  ])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function setLine(i: number, patch: Partial<LineItem>) {
    setLines(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  function addLine() {
    setLines(prev => [...prev, { product_id: products[0]?.id ?? 0, quantity: 1, unit_price: Number(products[0]?.unit_price ?? 0), tax_rate: Number(products[0]?.tax_rate ?? 20) }])
  }

  function removeLine(i: number) {
    setLines(prev => prev.filter((_, idx) => idx !== i))
  }

  const totalGross = lines.reduce((s, l) => s + l.unit_price * l.quantity, 0)
  const totalTax = lines.reduce((s, l) => {
    const gross = l.unit_price * l.quantity
    return s + gross * l.tax_rate / (100 + l.tax_rate)
  }, 0)

  async function handleSave() {
    if (!orderNo.trim()) { setErr(t('salesOrders.orderNoRequired')); return }
    if (lines.length === 0) { setErr(t('salesOrders.atLeastOneProduct')); return }
    setSaving(true)
    setErr(null)
    try {
      const payload: CustomerOrderCreate = {
        order_no: orderNo,
        order_date: orderDate,
        customer_id: customerId !== '' ? customerId : null,
        customer_name: customers.find(c => c.id === customerId)?.name ?? null,
        notes: notes || null,
        items: lines.map(l => ({ product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price, tax_rate: l.tax_rate })),
      }
      const created = await createOrder(payload)
      onCreated(created)
    } catch (e) {
      setErr(getApiErrorMessage(e, t('salesOrders.createOrderError')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-[#16122b]" onClick={e => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('salesOrders.newOrder')}</h2>
          <button type="button" aria-label={t('common.close')} onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X size={18} /></button>
        </div>

        {err && <div className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{err}</div>}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="order-no" className="mb-1 block text-xs font-medium text-slate-500">{t('salesOrders.orderNo')}</label>
            <input id="order-no" className={inputFieldClass} value={orderNo} onChange={e => setOrderNo(e.target.value)} placeholder="SIP-001" />
          </div>
          <div>
            <label htmlFor="order-date" className="mb-1 block text-xs font-medium text-slate-500">{t('common.date')}</label>
            <input id="order-date" type="date" className={inputFieldClass} value={orderDate} onChange={e => setOrderDate(e.target.value)} />
          </div>
        </div>

        {customers.length > 0 && (
          <div className="mt-3">
            <label htmlFor="order-customer" className="mb-1 block text-xs font-medium text-slate-500">{t('salesOrders.customer')}</label>
            <select id="order-customer" className={selectFieldClass} value={customerId} onChange={e => setCustomerId(e.target.value !== '' ? Number(e.target.value) : '')}>
              <option value="">{t('salesOrders.selectOption')}</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('salesOrders.products')}</span>
            <button type="button" onClick={addLine} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20"><Plus size={13} /> {t('salesOrders.addLine')}</button>
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_110px_80px_28px] items-center gap-2">
                <select aria-label={t('salesOrders.selectProduct')} className={selectFieldClass} value={l.product_id} onChange={e => {
                  const p = products.find(p => p.id === Number(e.target.value))
                  setLine(i, { product_id: Number(e.target.value), unit_price: Number(p?.unit_price ?? 0), tax_rate: Number(p?.tax_rate ?? 20) })
                }}>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input type="number" min={1} aria-label={t('salesOrders.units')} className={inputFieldClass} value={l.quantity} onChange={e => setLine(i, { quantity: Number(e.target.value) })} placeholder={t('salesOrders.units')} />
                <input type="number" min={0} step="0.01" aria-label={t('salesOrders.unitPrice')} className={inputFieldClass} value={l.unit_price} onChange={e => setLine(i, { unit_price: Number(e.target.value) })} placeholder={t('salesOrders.unitPrice')} />
                <select aria-label={t('salesOrders.vatRate')} className={selectFieldClass} value={l.tax_rate} onChange={e => setLine(i, { tax_rate: Number(e.target.value) })}>
                  {[0, 1, 10, 20].map(r => <option key={r} value={r}>%{r}</option>)}
                </select>
                <button type="button" aria-label={t('salesOrders.deleteLine')} onClick={() => removeLine(i)} className="flex items-center justify-center rounded text-rose-400 hover:text-rose-600"><X size={14} /></button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-6 text-sm text-slate-600 dark:text-slate-400">
            <span>{t('salesOrders.vat')}: <strong className="text-slate-800 dark:text-slate-200">{fmtCurrency(totalTax)}</strong></span>
            <span>{t('salesOrders.total')}: <strong className="text-slate-800 dark:text-slate-200">{fmtCurrency(totalGross)}</strong></span>
          </div>
        </div>

        <div className="mt-3">
          <label htmlFor="order-notes" className="mb-1 block text-xs font-medium text-slate-500">{t('salesOrders.notes')}</label>
          <textarea id="order-notes" rows={2} className={textareaFieldClass} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>{t('common.cancel')}</button>
          <button type="button" onClick={handleSave} disabled={saving} className={primaryButtonClass}>
            {saving ? t('common.saving') : t('salesOrders.createOrder')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delivery Note Modal ──────────────────────────────────────────────────────

function DeliveryNoteModal({
  order,
  onClose,
  onCreated,
}: {
  order: CustomerOrder
  onClose: () => void
  onCreated: (dn: DeliveryNote) => void
}) {
  const { t } = useTranslation()
  const today = new Date().toISOString().slice(0, 10)
  const [dnNo, setDnNo] = useState('')
  const [dnDate, setDnDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState(
    order.items.map(i => ({ order_item_id: i.id, product_id: i.product_id, quantity: i.quantity }))
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSave() {
    if (!dnNo.trim()) { setErr(t('salesOrders.deliveryNoRequired')); return }
    setSaving(true); setErr(null)
    try {
      const payload: DeliveryNoteCreate = {
        delivery_no: dnNo,
        delivery_date: dnDate,
        notes: notes || null,
        items: lines.map(l => ({ order_item_id: l.order_item_id, product_id: l.product_id, quantity: l.quantity })),
      }
      const dn = await createDeliveryNote(order.id, payload)
      onCreated(dn)
    } catch (e) {
      setErr(getApiErrorMessage(e, t('salesOrders.createDeliveryNoteError')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-[#16122b]" onClick={e => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('salesOrders.deliveryNoteCreate')} — {order.order_no}</h2>
          <button type="button" aria-label={t('common.close')} onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X size={18} /></button>
        </div>

        {err && <div className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{err}</div>}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="dn-no" className="mb-1 block text-xs font-medium text-slate-500">{t('salesOrders.deliveryNo')}</label>
            <input id="dn-no" className={inputFieldClass} value={dnNo} onChange={e => setDnNo(e.target.value)} placeholder="IRS-001" />
          </div>
          <div>
            <label htmlFor="dn-date" className="mb-1 block text-xs font-medium text-slate-500">{t('common.date')}</label>
            <input id="dn-date" type="date" className={inputFieldClass} value={dnDate} onChange={e => setDnDate(e.target.value)} />
          </div>
        </div>

        <div className="mt-4">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t('salesOrders.products')}</span>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px] items-center gap-2 text-sm">
                <span className="text-slate-700 dark:text-slate-300">{t('salesOrders.productHash')} #{l.product_id}</span>
                <input type="number" min={1} aria-label={t('salesOrders.units')} className={inputFieldClass} value={l.quantity}
                  onChange={e => setLines(prev => prev.map((x, idx) => idx === i ? { ...x, quantity: Number(e.target.value) } : x))} />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <label htmlFor="dn-notes" className="mb-1 block text-xs font-medium text-slate-500">{t('salesOrders.notes')}</label>
          <textarea id="dn-notes" rows={2} className={textareaFieldClass} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>{t('common.cancel')}</button>
          <button type="button" onClick={handleSave} disabled={saving} className={primaryButtonClass}>
            {saving ? t('common.saving') : t('salesOrders.createDeliveryNote')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Invoice Modal ────────────────────────────────────────────────────────────

function InvoiceModal({
  order,
  deliveryNotes,
  onClose,
  onCreated,
}: {
  order: CustomerOrder
  deliveryNotes: DeliveryNote[]
  onClose: () => void
  onCreated: (inv: Invoice) => void
}) {
  const { t } = useTranslation()
  const today = new Date().toISOString().slice(0, 10)
  const [invNo, setInvNo] = useState('')
  const [invDate, setInvDate] = useState(today)
  const [selectedDn, setSelectedDn] = useState<number | ''>('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSave() {
    if (!invNo.trim()) { setErr(t('salesOrders.invoiceNoRequired')); return }
    setSaving(true); setErr(null)
    try {
      const payload: InvoiceCreate = { invoice_no: invNo, invoice_date: invDate, notes: notes || null }
      const inv = await createInvoice(order.id, payload, selectedDn !== '' ? selectedDn : undefined)
      onCreated(inv)
    } catch (e) {
      setErr(getApiErrorMessage(e, t('salesOrders.createInvoiceError')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-[#16122b]" onClick={e => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('salesOrders.invoiceCreate')} — {order.order_no}</h2>
          <button type="button" aria-label={t('common.close')} onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X size={18} /></button>
        </div>

        {err && <div className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{err}</div>}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="inv-no" className="mb-1 block text-xs font-medium text-slate-500">{t('salesOrders.invoiceNo')}</label>
            <input id="inv-no" className={inputFieldClass} value={invNo} onChange={e => setInvNo(e.target.value)} placeholder="FAT-001" />
          </div>
          <div>
            <label htmlFor="inv-date" className="mb-1 block text-xs font-medium text-slate-500">{t('common.date')}</label>
            <input id="inv-date" type="date" className={inputFieldClass} value={invDate} onChange={e => setInvDate(e.target.value)} />
          </div>
        </div>

        {deliveryNotes.length > 0 && (
          <div className="mt-3">
            <label htmlFor="inv-dn" className="mb-1 block text-xs font-medium text-slate-500">{t('salesOrders.deliveryNoteOptional')}</label>
            <select id="inv-dn" className={selectFieldClass} value={selectedDn} onChange={e => setSelectedDn(e.target.value !== '' ? Number(e.target.value) : '')}>
              <option value="">{t('salesOrders.unlinked')}</option>
              {deliveryNotes.map(dn => <option key={dn.id} value={dn.id}>{dn.delivery_no} ({formatDate(dn.delivery_date)})</option>)}
            </select>
          </div>
        )}

        <div className="mt-3">
          <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
            <span>{t('salesOrders.totalAmount')}</span>
            <strong className="text-slate-800 dark:text-slate-200">{fmtCurrency(order.total_amount)}</strong>
          </div>
          <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
            <span>{t('salesOrders.vat')}</span>
            <strong className="text-slate-800 dark:text-slate-200">{fmtCurrency(order.tax_total)}</strong>
          </div>
        </div>

        <div className="mt-3">
          <label htmlFor="inv-notes" className="mb-1 block text-xs font-medium text-slate-500">{t('salesOrders.notes')}</label>
          <textarea id="inv-notes" rows={2} className={textareaFieldClass} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>{t('common.cancel')}</button>
          <button type="button" onClick={handleSave} disabled={saving} className={primaryButtonClass}>
            {saving ? t('common.saving') : t('salesOrders.createInvoice')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Order Row (expanded detail) ──────────────────────────────────────────────

function OrderRow({
  order: initialOrder,
  onUpdated,
}: {
  order: CustomerOrder
  onUpdated: (o: CustomerOrder) => void
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [order, setOrder] = useState(initialOrder)
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [modal, setModal] = useState<'dn' | 'invoice' | null>(null)
  const [actionErr, setActionErr] = useState<string | null>(null)

  useEffect(() => { setOrder(initialOrder) }, [initialOrder])

  async function expand() {
    if (!expanded) {
      setLoadingDetail(true)
      try {
        const [dns, invs] = await Promise.all([
          fetchDeliveryNotes(order.id),
          fetchInvoices(order.id),
        ])
        setDeliveryNotes(dns)
        setInvoices(invs)
      } finally {
        setLoadingDetail(false)
      }
    }
    setExpanded(v => !v)
  }

  async function handleConfirm() {
    setActionErr(null)
    try {
      const updated = await confirmOrder(order.id)
      setOrder(updated)
      onUpdated(updated)
    } catch (e) {
      setActionErr(getApiErrorMessage(e, t('salesOrders.confirmFailed')))
    }
  }

  async function handleCancel() {
    if (!confirm(t('salesOrders.cancelConfirm'))) return
    setActionErr(null)
    try {
      const updated = await cancelOrder(order.id)
      setOrder(updated)
      onUpdated(updated)
    } catch (e) {
      setActionErr(getApiErrorMessage(e, t('salesOrders.cancelFailed')))
    }
  }

  async function refreshOrder() {
    const fresh = await fetchOrder(order.id)
    setOrder(fresh)
    onUpdated(fresh)
  }

  return (
    <>
      <tr className={tableRowHoverClass}>
        <td className="py-3 pl-4">
          <button type="button" aria-label={expanded ? t('salesOrders.collapse') : t('salesOrders.expand')} onClick={expand} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </td>
        <td className={`py-3 pr-4 font-mono text-sm font-semibold ${tableCellClass}`}>{order.order_no}</td>
        <td className={`py-3 pr-4 text-sm ${tableCellClass}`}>{formatDate(order.order_date)}</td>
        <td className={`py-3 pr-4 text-sm ${tableCellClass}`}>{order.customer_name ?? '—'}</td>
        <td className="py-3 pr-4"><StatusBadge status={order.status} /></td>
        <td className={`py-3 pr-4 text-right text-sm font-semibold ${tableCellClass}`}>{fmtCurrency(order.total_amount)}</td>
        <td className="py-3 pr-4">
          <div className="flex items-center justify-end gap-1">
            {order.status === 'draft' && (
              <button type="button" onClick={handleConfirm} title={t('salesOrders.approveTitle')} className="rounded-lg p-1.5 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20">
                <Send size={14} />
              </button>
            )}
            {order.status === 'confirmed' && (
              <button type="button" onClick={() => setModal('dn')} title={t('salesOrders.createDeliveryNoteTitle')} className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20">
                <Truck size={14} />
              </button>
            )}
            {(order.status === 'confirmed' || order.status === 'shipped') && (
              <button type="button" onClick={() => setModal('invoice')} title={t('salesOrders.createInvoiceTitle')} className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                <FileText size={14} />
              </button>
            )}
            {order.status !== 'invoiced' && order.status !== 'cancelled' && (
              <button type="button" onClick={handleCancel} title={t('salesOrders.cancelTitle')} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20">
                <X size={14} />
              </button>
            )}
          </div>
        </td>
      </tr>

      {actionErr && (
        <tr>
          <td colSpan={7} className="px-4 py-1 text-xs text-rose-600">{actionErr}</td>
        </tr>
      )}

      {expanded && (
        <tr>
          <td colSpan={7} className="bg-slate-50/60 px-6 py-4 dark:bg-white/[0.02]">
            {loadingDetail ? (
              <div className="text-sm text-slate-500">{t('common.loading')}</div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {/* Order Items */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('salesOrders.orderItems')}</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className={`pb-1 text-left ${tableHeaderClass}`}>{t('salesOrders.product')}</th>
                        <th className={`pb-1 text-right ${tableHeaderClass}`}>{t('salesOrders.units')}</th>
                        <th className={`pb-1 text-right ${tableHeaderClass}`}>{t('salesOrders.amount')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map(item => (
                        <tr key={item.id} className="border-t border-slate-100 dark:border-white/5">
                          <td className={`py-1 ${tableCellClass}`}>#{item.product_id}</td>
                          <td className={`py-1 text-right ${tableCellClass}`}>{item.quantity}</td>
                          <td className={`py-1 text-right ${tableCellClass}`}>{fmtCurrency(item.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Delivery Notes */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('salesOrders.deliveryNotes')}</p>
                  {deliveryNotes.length === 0 ? (
                    <p className="text-xs text-slate-400">{t('salesOrders.noDeliveryNotes')}</p>
                  ) : (
                    <ul className="space-y-1 text-xs">
                      {deliveryNotes.map(dn => (
                        <li key={dn.id} className="flex items-center justify-between">
                          <span className="font-mono text-slate-700 dark:text-slate-300">{dn.delivery_no}</span>
                          <span className="text-slate-500">{formatDate(dn.delivery_date)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Invoices */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('salesOrders.invoices')}</p>
                  {invoices.length === 0 ? (
                    <p className="text-xs text-slate-400">{t('salesOrders.noInvoices')}</p>
                  ) : (
                    <ul className="space-y-2 text-xs">
                      {invoices.map(inv => (
                        <li key={inv.id} className="flex items-center justify-between gap-2">
                          <div>
                            <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{inv.invoice_no}</span>
                            <span className="ml-2 text-slate-500">{fmtCurrency(inv.total_amount)}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <a
                              href={`/invoices/${order.id}/${inv.id}/print`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Print Invoice PDF"
                              className="flex items-center gap-1 rounded px-2 py-0.5 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/20"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              PDF
                            </a>
                            <button
                              type="button"
                              title="Download e-Invoice XML (UBL-TR 2.1)"
                              onClick={async () => {
                                try {
                                  await downloadEFaturaXml(order.id, inv.id, inv.invoice_no)
                                } catch (e) {
                                  setActionErr('Failed to download e-Invoice: ' + String(e))
                                }
                              }}
                              className="flex items-center gap-1 rounded px-2 py-0.5 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                            >
                              <Download className="h-3.5 w-3.5" />
                              e-Invoice
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </td>
        </tr>
      )}

      {modal === 'dn' && (
        <DeliveryNoteModal
          order={order}
          onClose={() => setModal(null)}
          onCreated={async (dn) => {
            setDeliveryNotes(prev => [dn, ...prev])
            setModal(null)
            setExpanded(true)
            await refreshOrder()
          }}
        />
      )}

      {modal === 'invoice' && (
        <InvoiceModal
          order={order}
          deliveryNotes={deliveryNotes}
          onClose={() => setModal(null)}
          onCreated={async (inv) => {
            setInvoices(prev => [inv, ...prev])
            setModal(null)
            setExpanded(true)
            await refreshOrder()
          }}
        />
      )}
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SalesOrdersPage() {
  const { t } = useTranslation()
  const [orders, setOrders] = useState<CustomerOrder[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('')

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const [os, ps, cs] = await Promise.all([
        fetchOrders(statusFilter ? { order_status: statusFilter } : undefined),
        api.get<Product[]>('/products', { params: { limit: 500 } }).then(r => r.data),
        fetchCustomers(),
      ])
      setOrders(os)
      setProducts(ps)
      setCustomers(cs)
    } catch (e) {
      setErr(getApiErrorMessage(e, t('salesOrders.loadFailed')))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [statusFilter])

  function handleOrderUpdated(updated: CustomerOrder) {
    setOrders(prev => prev.map(o => o.id === updated.id ? updated : o))
  }

  return (
    <PageLayout
      title={t('orders.customerOrdersTitle')}
      subtitle={t('salesOrders.subtitle')}
      actions={
        <div className="flex items-center gap-2">
          <select aria-label={t('salesOrders.statusFilter')} className={selectFieldClass + ' w-40'} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">{t('salesOrders.allStatuses')}</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{t(v.labelKey)}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void downloadExport('orders', 'orders_report.xlsx')}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-white/5"
            title={t('salesOrders.downloadExcel')}
          >
            <Download size={14} /> {t('salesOrders.excel')}
          </button>
          <button type="button" onClick={() => setShowNew(true)} className={primaryButtonClass + ' flex items-center gap-1'}>
            <Plus size={15} /> {t('salesOrders.newOrder')}
          </button>
        </div>
      }
    >
      <OrderTabs />

      {/* Workflow explainer */}
      <div className="flex items-center gap-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
        <p className="mr-4 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Workflow</p>
        {[
          { label: 'New Order', desc: 'Created', color: 'bg-amber-400' },
          { label: 'Confirm', desc: 'Accepted', color: 'bg-sky-400' },
          { label: 'Delivery Note', desc: 'Shipped', color: 'bg-violet-400' },
          { label: 'Invoice', desc: 'Finance updates', color: 'bg-emerald-500' },
        ].map((s, i) => (
          <div key={s.label} className="flex items-center">
            {i > 0 && <div className="mx-2 h-px w-6 bg-slate-300 dark:bg-white/15" />}
            <div className="text-center">
              <div className={`mx-auto mb-0.5 h-2 w-2 rounded-full ${s.color}`} />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{s.label}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">{s.desc}</p>
            </div>
          </div>
        ))}
        <p className="ml-auto shrink-0 text-xs text-slate-400 dark:text-slate-500">Finance updates when invoice is created</p>
      </div>

      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-100">
          {err}
        </div>
      )}

      <GlobalCard>
        {loading ? (
          <SkeletonTable rows={5} cols={6} />
        ) : orders.length === 0 ? (
          <EmptyState title={t('salesOrders.emptyOrders')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="w-8" aria-label={t('salesOrders.detail')} />
                  <th className={`pb-3 pr-4 text-left ${tableHeaderClass}`}>{t('salesOrders.colOrderNo')}</th>
                  <th className={`pb-3 pr-4 text-left ${tableHeaderClass}`}>{t('salesOrders.colDate')}</th>
                  <th className={`pb-3 pr-4 text-left ${tableHeaderClass}`}>{t('salesOrders.colCustomer')}</th>
                  <th className={`pb-3 pr-4 text-left ${tableHeaderClass}`}>{t('salesOrders.colStatus')}</th>
                  <th className={`pb-3 pr-4 text-right ${tableHeaderClass}`}>{t('salesOrders.colAmount')}</th>
                  <th className={`pb-3 pr-4 text-right ${tableHeaderClass}`}>{t('salesOrders.colAction')}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => (
                  <OrderRow key={order.id} order={order} onUpdated={handleOrderUpdated} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlobalCard>

      {showNew && products.length > 0 && (
        <NewOrderModal
          products={products}
          customers={customers}
          onClose={() => setShowNew(false)}
          onCreated={(o) => {
            setOrders(prev => [o, ...prev])
            setShowNew(false)
          }}
        />
      )}
    </PageLayout>
  )
}
