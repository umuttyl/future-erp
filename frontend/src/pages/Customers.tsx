import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Activity, BookOpen, CreditCard, Download, MessageSquare, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import CommentsTagsModal from '../components/CommentsTagsModal'
import CustomerTimelineModal from '../components/CustomerTimelineModal'

import { CustomerAiBadges } from '../components/ui/AiBadge'
import { FormHint } from '../components/ui/FormHint'
import { GlobalCard, GlobalCardHeader } from '../components/ui/GlobalCard'
import { PageLayout } from '../components/ui/PageLayout'
import { EmptyState } from '../components/ui/EmptyState'
import { Pagination } from '../components/ui/Pagination'
import { SkeletonTable } from '../components/ui/Skeleton'
import {
  inputFieldClass,
  primaryButtonClass,
  selectFieldClass,
  tableCellClass,
  tableHeaderClass,
  tableRowHoverClass,
} from '../components/ui/forms'
import { useAuth } from '../context/AuthContext'
import {
  api,
  formatCurrency,
  formatDate,
  getApiErrorMessage,
  fetchCustomerSignals,
  fetchCustomerStatement,
  recordPayment,
  type Customer,
  type CustomerCreate,
  type StatementOut,
  type PaymentCreate,
} from '../lib/api'
import { useQueryClient } from '@tanstack/react-query'
import {
  useCustomers,
  useCustomerBalances,
  useCustomerHealth,
  useCustomerTags,
  useDeleteCustomer,
} from '../hooks/useQueries'
import { downloadCsv } from '../lib/csvExport'
import { ImportModal } from '../components/ui/ImportModal'

const PAGE_SIZE = 20

type SortKey = 'name' | 'customer_type' | 'created_at'
type SortDir = 'asc' | 'desc'

function TypeBadge({ type }: { type: string }) {
  const cls =
    type === 'B2B'
      ? 'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200'
      : 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{type}</span>
  )
}

function HealthBadge({ score, tier }: { score: number; tier: string }) {
  const { t } = useTranslation()
  const config: Record<string, { bg: string; text: string; labelKey: string }> = {
    healthy:  { bg: 'bg-emerald-100 dark:bg-emerald-500/20', text: 'text-emerald-700 dark:text-emerald-300', labelKey: 'customers.healthHealthy' },
    good:     { bg: 'bg-sky-100 dark:bg-sky-500/20',         text: 'text-sky-700 dark:text-sky-300',         labelKey: 'customers.healthGood' },
    at_risk:  { bg: 'bg-amber-100 dark:bg-amber-500/20',    text: 'text-amber-700 dark:text-amber-300',    labelKey: 'customers.healthAtRisk' },
    critical: { bg: 'bg-rose-100 dark:bg-rose-500/20',      text: 'text-rose-700 dark:text-rose-400',      labelKey: 'customers.healthCritical' },
  }
  const c = config[tier] ?? config.good
  return (
    <span
      title={t('customers.healthScoreTitle', { score, label: t(c.labelKey) })}
      className={`ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${c.bg} ${c.text}`}
    >
      {score}
    </span>
  )
}

function fmtCurrency(v: number | string | null | undefined): string {
  return formatCurrency(Number(v ?? 0))
}

// ─── Payment Modal ────────────────────────────────────────────────────────────

function PaymentModal({
  customer,
  onClose,
  onSaved,
  prefillAmount,
  prefillInvoiceNo,
}: {
  customer: Customer
  onClose: () => void
  onSaved: () => void
  prefillAmount?: number
  prefillInvoiceNo?: string
}) {
  const { t } = useTranslation()
  const [form, setForm] = useState<PaymentCreate>({
    amount: prefillAmount ?? 0,
    description: prefillInvoiceNo ? `Invoice ${prefillInvoiceNo}` : '',
    movement_date: new Date().toISOString().slice(0, 10),
    invoice_no: prefillInvoiceNo ?? null,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.amount || form.amount <= 0) { setErr(t('customers.amountPositive')); return }
    setErr(null)
    setBusy(true)
    try {
      await recordPayment(customer.id, form)
      onSaved()
    } catch (e: unknown) {
      setErr(getApiErrorMessage(e, t('customers.paymentSaveError')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1a1628]" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label={t('common.close')} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
        <div className="border-b border-slate-100 px-6 py-5 dark:border-white/10">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t('customers.collectPayment')}</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{customer.name}</p>
          {prefillInvoiceNo && (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
              Invoice #{prefillInvoiceNo} — Finance will update automatically
            </span>
          )}
        </div>
        <form className="grid gap-3 px-6 py-5" onSubmit={onSubmit}>
          <div>
            <label htmlFor="pm-amount" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('customers.amountField')}</label>
            <input
              id="pm-amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              className={inputFieldClass + ' mt-1'}
              value={form.amount || ''}
              onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label htmlFor="pm-date" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('common.date')}</label>
            <input
              id="pm-date"
              type="date"
              className={inputFieldClass + ' mt-1'}
              value={form.movement_date ?? ''}
              onChange={(e) => setForm({ ...form, movement_date: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="pm-desc" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('customers.description')}</label>
            <input
              id="pm-desc"
              className={inputFieldClass + ' mt-1'}
              value={form.description ?? ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={t('customers.paymentDescPlaceholder')}
            />
          </div>
          {err && <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">{t('common.cancel')}</button>
            <button type="submit" disabled={busy} className={primaryButtonClass + ' px-4 py-2 text-sm'}>{busy ? t('common.saving') : t('common.save')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Account Statement Modal ───────────────────────────────────────────────────

function AccountStatementModal({
  customer,
  canWrite,
  onClose,
  onPaymentSaved,
}: {
  customer: Customer
  canWrite: boolean
  onClose: () => void
  onPaymentSaved: () => void
}) {
  const { t } = useTranslation()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [statement, setStatement] = useState<StatementOut | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [payPrefillAmount, setPayPrefillAmount] = useState<number | undefined>(undefined)
  const [payPrefillInvoiceNo, setPayPrefillInvoiceNo] = useState<string | undefined>(undefined)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const params: Record<string, string> = {}
      if (startDate) params.start_date = startDate
      if (endDate) params.end_date = endDate
      const data = await fetchCustomerStatement(customer.id, params)
      setStatement(data)
    } catch (e: unknown) {
      setErr(getApiErrorMessage(e, t('customers.statementLoadError')))
    } finally {
      setLoading(false)
    }
  }, [customer.id, startDate, endDate, t])

  useEffect(() => { void load() }, [load])

  function handlePaymentSaved() {
    setPaymentOpen(false)
    setPayPrefillAmount(undefined)
    setPayPrefillInvoiceNo(undefined)
    void load()
    onPaymentSaved()
  }

  function openPayForInvoice(invoiceNo: string, amount: number) {
    setPayPrefillInvoiceNo(invoiceNo)
    setPayPrefillAmount(amount)
    setPaymentOpen(true)
  }

  const balance = statement?.closing_balance ?? 0
  const balanceNum = Number(balance)

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/55 p-4 backdrop-blur-sm" onClick={onClose}>
        <div
          className="relative my-8 w-full max-w-3xl rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1a1628]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5 dark:border-white/10">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t('customers.statementTitle')}</h2>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{customer.name}</p>
            </div>
            <div className="flex items-center gap-2">
              {canWrite && (
                <button
                  type="button"
                  onClick={() => setPaymentOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 active:scale-95"
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  {t('customers.collectPayment')}
                </button>
              )}
              <button type="button" onClick={onClose} aria-label={t('common.close')} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-6 py-4 dark:border-white/10">
            <div>
              <label htmlFor="stmt-start" className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('finance.start')}</label>
              <input id="stmt-start" type="date" title={t('customers.startTitle')} className={inputFieldClass + ' mt-1 w-40'} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label htmlFor="stmt-end" className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('finance.end')}</label>
              <input id="stmt-end" type="date" title={t('customers.endTitle')} className={inputFieldClass + ' mt-1 w-40'} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            {(startDate || endDate) && (
              <button type="button" onClick={() => { setStartDate(''); setEndDate('') }} className="self-end rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5">
                {t('sales.clear')}
              </button>
            )}
            {statement && (
              <div className="ml-auto flex items-center gap-4 text-sm">
                {startDate && (
                  <span className="text-slate-500 dark:text-slate-400">
                    {t('customers.opening')}: <span className="font-medium text-slate-700 dark:text-slate-200">{fmtCurrency(statement.opening_balance)}</span>
                  </span>
                )}
                <span className="text-slate-500 dark:text-slate-400">
                  {t('customers.balance')}:{' '}
                  <span className={`font-semibold ${balanceNum > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {fmtCurrency(statement.closing_balance)}
                  </span>
                </span>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto px-0">
            {loading ? (
              <div className="py-12 text-center text-sm text-slate-400">{t('common.loading')}</div>
            ) : err ? (
              <div className="py-8 text-center text-sm text-rose-600 dark:text-rose-400">{err}</div>
            ) : !statement || statement.entries.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">
                {statement ? t('customers.noMovementsRange') : t('customers.statementLoading')}
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className={`border-b border-slate-200 dark:border-white/10 ${tableHeaderClass}`}>
                    <th className="py-2 pl-6 pr-4">{t('common.date')}</th>
                    <th className="py-2 pr-4">{t('customers.colDescription')}</th>
                    <th className="py-2 pr-4 text-right">{t('customers.colDebit')}</th>
                    <th className="py-2 pr-4 text-right">{t('customers.colCredit')}</th>
                    <th className="py-2 pr-4 text-right">{t('customers.balance')}</th>
                    {canWrite && <th className="py-2 pr-6"><span className="sr-only">Pay</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {statement.entries.map((entry) => (
                    <tr key={entry.id} className={`border-b border-slate-100 dark:border-white/5 ${tableRowHoverClass}`}>
                      <td className={`py-2.5 pl-6 pr-4 ${tableCellClass}`}>{formatDate(entry.movement_date)}</td>
                      <td className={`py-2.5 pr-4 ${tableCellClass}`}>
                        <span>{entry.description ?? '—'}</span>
                        {entry.reference && (
                          <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">#{entry.reference}</span>
                        )}
                      </td>
                      <td className={`py-2.5 pr-4 text-right ${Number(entry.debit) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-300 dark:text-slate-600'}`}>
                        {Number(entry.debit) > 0 ? fmtCurrency(entry.debit) : '—'}
                      </td>
                      <td className={`py-2.5 pr-4 text-right ${Number(entry.credit) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-300 dark:text-slate-600'}`}>
                        {Number(entry.credit) > 0 ? fmtCurrency(entry.credit) : '—'}
                      </td>
                      <td className={`py-2.5 pr-4 text-right font-medium ${Number(entry.balance) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {fmtCurrency(entry.balance)}
                      </td>
                      {canWrite && (
                        <td className="py-2.5 pr-6 text-right">
                          {entry.movement_type === 'debit' && entry.reference && Number(entry.debit) > 0 && (
                            <button
                              type="button"
                              onClick={() => openPayForInvoice(entry.reference!, Number(entry.debit))}
                              className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                            >
                              Collect
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="px-6 py-4 text-xs text-slate-400 dark:text-slate-500">
            {t('customers.statementFooter')}
          </div>
        </div>
      </div>

      {paymentOpen && (
        <PaymentModal
          customer={customer}
          onClose={() => setPaymentOpen(false)}
          onSaved={handlePaymentSaved}
          prefillAmount={payPrefillAmount}
          prefillInvoiceNo={payPrefillInvoiceNo}
        />
      )}
    </>
  )
}

// ─── Customer Modal ────────────────────────────────────────────────────────────

function CustomerModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Customer | null
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const PERSONAL_DOMAINS = new Set(['gmail.com','hotmail.com','yahoo.com','outlook.com','yandex.com','icloud.com','live.com','mail.com','msn.com','me.com'])

  function detectType(email: string): 'B2B' | 'B2C' | null {
    const domain = email.split('@')[1]?.toLowerCase()
    if (!domain) return null
    return PERSONAL_DOMAINS.has(domain) ? 'B2C' : 'B2B'
  }

  const editing = !!initial
  const [form, setForm] = useState<CustomerCreate>({
    name: initial?.name ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
    address: initial?.address ?? '',
    customer_type: (initial?.customer_type as 'B2B' | 'B2C') ?? 'B2B',
    notes: initial?.notes ?? '',
  })
  const [aiTypeHint, setAiTypeHint] = useState<'B2B' | 'B2C' | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setErr(t('customers.nameRequired')); return }
    setErr(null)
    setBusy(true)
    try {
      const payload = {
        ...form,
        email: form.email?.trim() || null,
        phone: form.phone?.trim() || null,
        address: form.address?.trim() || null,
        notes: form.notes?.trim() || null,
      }
      if (editing) {
        await api.patch(`/customers/${initial!.id}`, payload)
      } else {
        await api.post('/customers', payload)
      }
      onSaved()
    } catch (e: unknown) {
      setErr(getApiErrorMessage(e, t('customers.saveError')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1a1628]" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label={t('common.close')} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
        <div className="border-b border-slate-100 px-6 py-5 dark:border-white/10">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{editing ? t('customers.editTitle') : t('customers.newTitle')}</h2>
        </div>
        <form className="grid gap-3 px-6 py-5" onSubmit={onSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label htmlFor="cm-name" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('customers.nameField')}</label>
              <input id="cm-name" required className={inputFieldClass + ' mt-1'} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label htmlFor="cm-email" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('customers.email')}</label>
              <input
                id="cm-email"
                type="email"
                className={inputFieldClass + ' mt-1'}
                value={form.email ?? ''}
                onChange={(e) => {
                  const email = e.target.value
                  setForm((f) => ({ ...f, email }))
                  const detected = detectType(email)
                  if (detected && !editing) {
                    setForm((f) => ({ ...f, email, customer_type: detected }))
                    setAiTypeHint(detected)
                  } else {
                    setAiTypeHint(null)
                  }
                }}
              />
              {aiTypeHint && (
                <FormHint
                  label={t('customers.typeDetected')}
                  value={aiTypeHint === 'B2C' ? t('customers.b2cLabel') : t('customers.b2bLabel')}
                  onAccept={() => setForm((f) => ({ ...f, customer_type: aiTypeHint }))}
                />
              )}
            </div>
            <div>
              <label htmlFor="cm-phone" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('customers.phone')}</label>
              <input id="cm-phone" className={inputFieldClass + ' mt-1'} value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+90 5xx xxx xx xx" />
            </div>
            <div>
              <label htmlFor="cm-type" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('customers.type')}</label>
              <select id="cm-type" className={selectFieldClass + ' mt-1'} value={form.customer_type} onChange={(e) => setForm({ ...form, customer_type: e.target.value as 'B2B' | 'B2C' })}>
                <option value="B2B">{t('customers.b2bLabel')}</option>
                <option value="B2C">{t('customers.b2cLabel')}</option>
              </select>
            </div>
            <div>
              <label htmlFor="cm-address" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('customers.address')}</label>
              <input id="cm-address" className={inputFieldClass + ' mt-1'} value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label htmlFor="cm-notes" className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('customers.notes')}</label>
              <textarea id="cm-notes" rows={2} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 dark:border-white/10 dark:bg-[#1a1628] dark:text-slate-100 resize-none" value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          {err && <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">{t('common.cancel')}</button>
            <button type="submit" disabled={busy} className={primaryButtonClass + ' px-4 py-2 text-sm'}>{busy ? t('common.saving') : t('common.save')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function CustomersPage() {
  const { t } = useTranslation()
  const { hasPermission, user } = useAuth()
  const qc = useQueryClient()
  const canWrite = hasPermission('sales.write')
  const isManager = user?.role === 'admin' || user?.role === 'manager'

  // ── React Query ──────────────────────────────────────────────────────────────
  const { data: customers = [], isLoading: loading, error: queryError } = useCustomers()
  const { data: balances = new Map() } = useCustomerBalances()
  const { data: healthMap = new Map() } = useCustomerHealth()
  const { data: tagsMap = new Map() } = useCustomerTags()
  const deleteCustomerMutation = useDeleteCustomer()

  const [customerSignalMap, setCustomerSignalMap] = useState<Map<number, string[]>>(new Map())
  const error = queryError ? getApiErrorMessage(queryError, t('customers.loadError')) : null
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Customer | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)
  const [showImport, setShowImport] = useState(false)

  const [statementTarget, setStatementTarget] = useState<Customer | null>(null)
  const [commentsTarget, setCommentsTarget] = useState<Customer | null>(null)
  const [timelineTarget, setTimelineTarget] = useState<Customer | null>(null)

  // AI signals — izin gerektiriyor, ayrı yükleme
  useEffect(() => {
    fetchCustomerSignals().then((signals) => {
      const smap = new Map<number, string[]>()
      for (const s of signals) smap.set(s.customer_id, s.signals)
      setCustomerSignalMap(smap)
    }).catch(() => { /* no ai.insights.read permission */ })
  }, [])

  const filtered = useMemo(() => {
    let list = customers
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q))
    }
    if (typeFilter) list = list.filter((c) => c.customer_type === typeFilter)
    list = [...list].sort((a, b) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      const cmp = String(av).localeCompare(String(bv), 'tr')
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [customers, search, typeFilter, sortKey, sortDir])

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  function SortArrow({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="ml-1 opacity-30">↕</span>
    return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await deleteCustomerMutation.mutateAsync(deleteTarget.id)
      setDeleteTarget(null)
    } catch {
      // error state handled by React Query, toast varsa oraya taşı
    }
  }
  const deleting = deleteCustomerMutation.isPending

  function handleExport() {
    downloadCsv(
      filtered.map((c) => ({
        ID: c.id,
        [t('customers.colName')]: c.name,
        [t('customers.colType')]: c.customer_type,
        [t('customers.email')]: c.email ?? '',
        [t('customers.phone')]: c.phone ?? '',
        [t('customers.address')]: c.address ?? '',
        [t('customers.notes')]: c.notes ?? '',
        [t('customers.colBalance')]: balances.get(c.id) ?? 0,
        [t('customers.colCreatedAt')]: formatDate(c.created_at),
      })),
      'musteriler.csv',
    )
  }

  return (
    <PageLayout
      title={t('customers.title')}
      subtitle={t('customers.subtitle')}
      actions={
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleExport} disabled={filtered.length === 0} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
          {canWrite && (
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
              title="Import from Excel/CSV"
            >
              <Upload className="h-3.5 w-3.5" />
              Import
            </button>
          )}
          {canWrite && (
            <button type="button" onClick={() => { setEditTarget(null); setModalOpen(true) }} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 active:scale-95">
              <Plus className="h-3.5 w-3.5" />
              {t('customers.new')}
            </button>
          )}
        </div>
      }
    >
      {/* Filtreler */}
      <GlobalCard>
        <div className="flex flex-wrap gap-3">
          <input
            aria-label={t('customers.searchPlaceholder')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder={t('customers.searchPlaceholder')}
            className={inputFieldClass + ' max-w-xs'}
          />
          <select
            aria-label={t('customers.filterByType')}
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
            className={selectFieldClass + ' w-40'}
          >
            <option value="">{t('customers.allTypes')}</option>
            <option value="B2B">B2B</option>
            <option value="B2C">B2C</option>
          </select>
        </div>
      </GlobalCard>

      {/* Tablo */}
      {loading && customers.length === 0 ? (
        <SkeletonTable rows={8} cols={6} />
      ) : (
        <GlobalCard>
          <GlobalCardHeader
            title={t('customers.listTitle')}
            description={t('customers.recordCount', { count: filtered.length })}
            right={error ? <span className="text-sm text-rose-600 dark:text-rose-300">{error}</span> : null}
          />
          {filtered.length === 0 ? (
            <EmptyState
              title={t('customers.empty')}
              description={search ? t('customers.emptySearchHint') : t('customers.emptyHint')}
              action={
                canWrite ? (
                  <button type="button" onClick={() => { setEditTarget(null); setModalOpen(true) }} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700">
                    <Plus className="h-3.5 w-3.5" />
                    {t('customers.addCustomer')}
                  </button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="-mx-5 overflow-x-auto border-t border-slate-100 dark:border-white/5">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className={`border-b border-slate-200 dark:border-white/10 ${tableHeaderClass}`}>
                      <th className="cursor-pointer py-2 pl-5 pr-4 select-none" onClick={() => toggleSort('name')}>
                        {t('customers.colName')} <SortArrow k="name" />
                      </th>
                      <th className="cursor-pointer py-2 pr-4 select-none" onClick={() => toggleSort('customer_type')}>
                        {t('customers.colType')} <SortArrow k="customer_type" />
                      </th>
                      <th className="py-2 pr-4">{t('common.email')}</th>
                      <th className="py-2 pr-4">{t('common.phone')}</th>
                      <th className="py-2 pr-4 text-right">{t('customers.colBalance')}</th>
                      <th className="cursor-pointer py-2 pr-4 select-none" onClick={() => toggleSort('created_at')}>
                        {t('customers.colCreatedAt')} <SortArrow k="created_at" />
                      </th>
                      <th className="py-2 pr-5 sr-only">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((c) => {
                      const bal = balances.get(c.id) ?? 0
                      return (
                        <tr key={c.id} className={tableRowHoverClass + ' border-b border-slate-100 dark:border-white/5'}>
                          <td className={`py-2.5 pl-5 pr-4 font-medium ${tableCellClass}`}>
                            <span className="inline-flex items-center flex-wrap gap-x-1">
                              {c.name}
                              {(() => { const h = healthMap.get(c.id); return h ? <HealthBadge score={h.score} tier={h.tier} /> : null })()}
                              <CustomerAiBadges signals={customerSignalMap.get(c.id) ?? []} />
                            </span>
                            {(tagsMap.get(c.id) ?? []).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {(tagsMap.get(c.id) ?? []).map((tag: string) => (
                                  <span key={tag} className="inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 pr-4"><TypeBadge type={c.customer_type} /></td>
                          <td className={`py-2.5 pr-4 ${tableCellClass}`}>{c.email ?? '—'}</td>
                          <td className={`py-2.5 pr-4 ${tableCellClass}`}>{c.phone ?? '—'}</td>
                          <td className={`py-2.5 pr-4 text-right tabular-nums font-medium ${bal > 0 ? 'text-rose-600 dark:text-rose-400' : bal < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                            {fmtCurrency(bal)}
                          </td>
                          <td className={`py-2.5 pr-4 ${tableCellClass}`}>{formatDate(c.created_at)}</td>
                          <td className="py-2.5 pr-5">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                aria-label={t('customers.statementAction')}
                                onClick={() => setStatementTarget(c)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-sky-50 hover:text-sky-600 dark:text-slate-400 dark:hover:bg-sky-500/10 dark:hover:text-sky-300"
                              >
                                <BookOpen className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label={t('customers.interactionHistory')}
                                onClick={() => setTimelineTarget(c)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-violet-50 hover:text-violet-600 dark:text-slate-400 dark:hover:bg-violet-500/10 dark:hover:text-violet-300"
                              >
                                <Activity className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label={t('customers.commentsTags')}
                                onClick={() => setCommentsTarget(c)}
                                className="relative flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
                              >
                                <MessageSquare className="h-3.5 w-3.5" />
                                {(tagsMap.get(c.id) ?? []).length > 0 && (
                                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-indigo-500" />
                                )}
                              </button>
                              {canWrite && (
                                <>
                                  <button type="button" aria-label={t('common.edit')} onClick={() => { setEditTarget(c); setModalOpen(true) }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-violet-50 hover:text-violet-600 dark:text-slate-400 dark:hover:bg-violet-500/10 dark:hover:text-violet-300">
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button type="button" aria-label={t('common.delete')} onClick={() => setDeleteTarget(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 px-1">
                <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
              </div>
            </>
          )}
        </GlobalCard>
      )}

      {/* Create / Edit modal */}
      {modalOpen && (
        <CustomerModal
          initial={editTarget}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false)
            void qc.invalidateQueries({ queryKey: ['customers'] })
          }}
        />
      )}

      {showImport && (
        <ImportModal
          resource="customers"
          title="Import Customers"
          onClose={() => setShowImport(false)}
          onSuccess={() => { void qc.invalidateQueries({ queryKey: ['customers'] }); setShowImport(false) }}
        />
      )}

      {/* Account Statement modal */}
      {statementTarget && (
        <AccountStatementModal
          customer={statementTarget}
          canWrite={canWrite}
          onClose={() => setStatementTarget(null)}
          onPaymentSaved={() => void qc.invalidateQueries({ queryKey: ['customer-balances'] })}
        />
      )}

      {/* Timeline modal */}
      {timelineTarget && (
        <CustomerTimelineModal
          customerId={timelineTarget.id}
          customerName={timelineTarget.name}
          onClose={() => setTimelineTarget(null)}
        />
      )}

      {/* Comments & Tags modal */}
      {commentsTarget && (
        <CommentsTagsModal
          entityType="customer"
          entityId={commentsTarget.id}
          entityName={commentsTarget.name}
          currentUserId={user?.id ?? 0}
          isManager={isManager}
          onClose={() => {
            setCommentsTarget(null)
            void qc.invalidateQueries({ queryKey: ['customer-tags'] })
          }}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#1a1628]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">{t('customers.deleteCustomerConfirm')}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400"><strong>{deleteTarget.name}</strong> {t('customers.deleteArchiveNote')}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300">{t('common.cancel')}</button>
              <button type="button" disabled={deleting} onClick={() => void confirmDelete()} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60">
                {deleting ? t('common.deleting') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  )
}
