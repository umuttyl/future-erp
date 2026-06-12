import { useCallback, useEffect, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle, Landmark, Plus, RefreshCw, X } from 'lucide-react'
import {
  addCashTransaction,
  createCashAccount,
  fetchCashAccounts,
  fetchCashTransactions,
  fetchDailyReport,
  formatCurrency,
  getApiErrorMessage,
  type CashAccountOut,
  type CashTransactionOut,
  type DailyReportOut,
} from '../../lib/api'
import { GlobalCard, GlobalCardHeader } from '../ui/GlobalCard'
import {
  inputFieldClass,
  primaryButtonClass,
  selectFieldClass,
  tableCellClass,
  tableHeaderClass,
  tableRowHoverClass,
} from '../ui/forms'

const TX_LABELS: Record<string, string> = {
  income:       'Income',
  expense:      'Expense',
  transfer_in:  'Transfer In',
  transfer_out: 'Transfer Out',
}

const TX_COLOR: Record<string, string> = {
  income:       'text-emerald-600 dark:text-emerald-400',
  expense:      'text-rose-600 dark:text-rose-400',
  transfer_in:  'text-blue-600 dark:text-blue-400',
  transfer_out: 'text-orange-600 dark:text-orange-400',
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Create account modal
// ---------------------------------------------------------------------------

function CreateAccountModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName]       = useState('')
  const [type, setType]       = useState<'cash' | 'bank'>('cash')
  const [opening, setOpening] = useState('0')
  const [busy, setBusy]       = useState(false)
  const [err, setErr]         = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      await createCashAccount({
        name: name.trim(),
        account_type: type,
        opening_balance: Number(opening) || 0,
      })
      onCreated()
    } catch (e: unknown) {
      setErr(getApiErrorMessage(e, 'Could not create account.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1a1628]" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10" aria-label="Close"><X className="h-4 w-4" /></button>
        <div className="border-b border-slate-100 px-6 py-5 dark:border-white/10">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Add new account</h2>
        </div>
        <form className="grid gap-4 px-6 py-5" onSubmit={onSubmit}>
          <div>
            <label htmlFor="ca-name" className="text-xs font-medium text-slate-600 dark:text-slate-400">Account name</label>
            <input id="ca-name" required className={inputFieldClass + ' mt-1'} value={name} onChange={(e) => setName(e.target.value)} placeholder="Main Cash" />
          </div>
          <div>
            <label htmlFor="ca-type" className="text-xs font-medium text-slate-600 dark:text-slate-400">Type</label>
            <select id="ca-type" className={selectFieldClass + ' mt-1'} value={type} onChange={(e) => setType(e.target.value as 'cash' | 'bank')}>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
            </select>
          </div>
          <div>
            <label htmlFor="ca-open" className="text-xs font-medium text-slate-600 dark:text-slate-400">Opening balance</label>
            <input id="ca-open" type="number" min="0" step="0.01" className={inputFieldClass + ' mt-1'} value={opening} onChange={(e) => setOpening(e.target.value)} />
          </div>
          {err && <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
            <button type="submit" disabled={busy} className={primaryButtonClass + ' px-4 py-2 text-sm'}>{busy ? 'Saving…' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add transaction modal
// ---------------------------------------------------------------------------

function AddTransactionModal({
  account,
  onClose,
  onSaved,
}: {
  account: CashAccountOut
  onClose: () => void
  onSaved: () => void
}) {
  const [txType, setTxType]   = useState<'income' | 'expense' | 'transfer_in' | 'transfer_out'>('income')
  const [amount, setAmount]   = useState('')
  const [desc, setDesc]       = useState('')
  const [ref, setRef]         = useState('')
  const [txDate, setTxDate]   = useState(todayStr())
  const [busy, setBusy]       = useState(false)
  const [err, setErr]         = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      await addCashTransaction(account.id, {
        transaction_type: txType,
        amount: Number(amount),
        description: desc || null,
        reference: ref || null,
        transaction_date: txDate,
      })
      onSaved()
    } catch (e: unknown) {
      setErr(getApiErrorMessage(e, 'Could not save transaction.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1a1628]" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10" aria-label="Close"><X className="h-4 w-4" /></button>
        <div className="border-b border-slate-100 px-6 py-5 dark:border-white/10">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Add transaction</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{account.name}</p>
        </div>
        <form className="grid gap-4 px-6 py-5" onSubmit={onSubmit}>
          <div>
            <label htmlFor="tx-type" className="text-xs font-medium text-slate-600 dark:text-slate-400">Type</label>
            <select id="tx-type" className={selectFieldClass + ' mt-1'} value={txType} onChange={(e) => setTxType(e.target.value as typeof txType)}>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="transfer_in">Transfer In</option>
              <option value="transfer_out">Transfer Out</option>
            </select>
          </div>
          <div>
            <label htmlFor="tx-amount" className="text-xs font-medium text-slate-600 dark:text-slate-400">Amount</label>
            <input id="tx-amount" required type="number" min="0.01" step="0.01" className={inputFieldClass + ' mt-1'} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label htmlFor="tx-date" className="text-xs font-medium text-slate-600 dark:text-slate-400">Date</label>
            <input id="tx-date" required type="date" className={inputFieldClass + ' mt-1'} value={txDate} onChange={(e) => setTxDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="tx-desc" className="text-xs font-medium text-slate-600 dark:text-slate-400">Description</label>
            <input id="tx-desc" type="text" className={inputFieldClass + ' mt-1'} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label htmlFor="tx-ref" className="text-xs font-medium text-slate-600 dark:text-slate-400">Reference</label>
            <input id="tx-ref" type="text" className={inputFieldClass + ' mt-1'} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Invoice no. etc." />
          </div>
          {err && <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
            <button type="submit" disabled={busy} className={primaryButtonClass + ' px-4 py-2 text-sm'}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CashbookTab — rendered inside Finance page as a tab (no PageLayout wrapper)
// ---------------------------------------------------------------------------

export function CashbookTab() {
  const [accounts,    setAccounts]    = useState<CashAccountOut[]>([])
  const [selected,    setSelected]    = useState<CashAccountOut | null>(null)
  const [txs,         setTxs]         = useState<CashTransactionOut[]>([])
  const [report,      setReport]      = useState<DailyReportOut | null>(null)
  const [reportDate,  setReportDate]  = useState(todayStr())
  const [loading,     setLoading]     = useState(true)
  const [txLoading,   setTxLoading]   = useState(false)
  const [err,         setErr]         = useState<string | null>(null)
  const [showCreate,  setShowCreate]  = useState(false)
  const [showAddTx,   setShowAddTx]   = useState(false)
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')

  const loadAccounts = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const [accs, rep] = await Promise.all([
        fetchCashAccounts(),
        fetchDailyReport(reportDate),
      ])
      setAccounts(accs)
      setReport(rep)
      if (accs.length > 0 && selected === null) setSelected(accs[0])
    } catch (e: unknown) {
      setErr(getApiErrorMessage(e, 'Could not load data.'))
    } finally {
      setLoading(false)
    }
  }, [reportDate, selected])

  const loadTxs = useCallback(async (acc: CashAccountOut) => {
    setTxLoading(true)
    try {
      const data = await fetchCashTransactions(acc.id, {
        date_from: dateFrom || undefined,
        date_to:   dateTo   || undefined,
      })
      setTxs(data)
    } catch {
      setTxs([])
    } finally {
      setTxLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => { void loadAccounts() }, [loadAccounts])

  useEffect(() => {
    if (selected) void loadTxs(selected)
  }, [selected, loadTxs])

  return (
    <div className="space-y-6">
      {showCreate && (
        <CreateAccountModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); void loadAccounts() }}
        />
      )}
      {showAddTx && selected && (
        <AddTransactionModal
          account={selected}
          onClose={() => setShowAddTx(false)}
          onSaved={() => { setShowAddTx(false); void loadTxs(selected); void loadAccounts() }}
        />
      )}

      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-300">
          {err}
        </div>
      )}

      {/* Daily summary cards */}
      {report && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Opening Balance', value: report.total_opening,  color: 'text-slate-600 dark:text-slate-300' },
            { label: 'Total Income',   value: report.total_income,   color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Total Expense',  value: report.total_expense,  color: 'text-rose-600 dark:text-rose-400' },
            { label: 'Closing Balance',value: report.total_closing,  color: 'text-violet-600 dark:text-violet-400' },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <div className={`text-xl font-bold ${s.color}`}>{formatCurrency(s.value)}</div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Report date + daily report table */}
      <GlobalCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <GlobalCardHeader title="Daily Report" description="Opening / closing by account" />
          <div className="flex items-center gap-2">
            <input
              type="date"
              className={inputFieldClass + ' text-sm'}
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
            />
            <button
              type="button"
              onClick={() => void loadAccounts()}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
              aria-label="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className={primaryButtonClass + ' flex items-center gap-1.5 px-3 py-2 text-sm'}
            >
              <Plus className="h-4 w-4" />
              Add Account
            </button>
          </div>
        </div>
        {loading ? (
          <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
        ) : accounts.length === 0 ? (
          <div className="py-8 text-center">
            <Landmark className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No cash / bank accounts yet.</p>
            <button type="button" onClick={() => setShowCreate(true)} className={primaryButtonClass + ' mt-4 px-4 py-2 text-sm'}>
              Create First Account
            </button>
          </div>
        ) : (
          <div className="-mx-5 overflow-x-auto border-t border-slate-100 dark:border-white/5">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={`border-b border-slate-200 dark:border-white/10 ${tableHeaderClass}`}>
                  <th className="py-2 pr-4">Account</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4 text-right">Opening</th>
                  <th className="py-2 pr-4 text-right">Income</th>
                  <th className="py-2 pr-4 text-right">Expense</th>
                  <th className="py-2 pr-4 text-right">Closing</th>
                  <th className="py-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {(report?.accounts ?? []).map((entry) => (
                  <tr
                    key={entry.account_id}
                    className={`${tableRowHoverClass} cursor-pointer border-b border-slate-100 dark:border-white/5 ${selected?.id === entry.account_id ? 'bg-violet-50 dark:bg-violet-900/10' : ''}`}
                    onClick={() => {
                      const acc = accounts.find((a) => a.id === entry.account_id)
                      if (acc) setSelected(acc)
                    }}
                  >
                    <td className={`py-2 pr-4 font-medium ${tableCellClass}`}>{entry.account_name}</td>
                    <td className={`py-2 pr-4 ${tableCellClass}`}>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${entry.account_type === 'cash' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'}`}>
                        {entry.account_type === 'cash' ? 'Cash' : 'Bank'}
                      </span>
                    </td>
                    <td className={`py-2 pr-4 text-right ${tableCellClass}`}>{formatCurrency(entry.opening_balance)}</td>
                    <td className="py-2 pr-4 text-right font-medium text-emerald-600 dark:text-emerald-400">{formatCurrency(entry.total_income)}</td>
                    <td className="py-2 pr-4 text-right font-medium text-rose-600 dark:text-rose-400">{formatCurrency(entry.total_expense)}</td>
                    <td className={`py-2 pr-4 text-right font-bold ${tableCellClass}`}>{formatCurrency(entry.closing_balance)}</td>
                    <td className="py-2 text-center">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelected(accounts.find((a) => a.id === entry.account_id) ?? null); setShowAddTx(true) }}
                        className="rounded-lg bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-300"
                      >
                        + Transaction
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlobalCard>

      {/* Transaction list for selected account */}
      {selected && (
        <GlobalCard>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <GlobalCardHeader
              title={`${selected.name} — Transactions`}
              description={`Current balance: ${formatCurrency(selected.balance)}`}
            />
            <div className="flex items-center gap-2">
              <input type="date" className={inputFieldClass + ' text-sm'} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="From" />
              <span className="text-slate-400">–</span>
              <input type="date" className={inputFieldClass + ' text-sm'} value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="To" />
              <button
                type="button"
                onClick={() => void loadTxs(selected)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
                aria-label="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowAddTx(true)}
                className={primaryButtonClass + ' flex items-center gap-1.5 px-3 py-2 text-sm'}
              >
                <Plus className="h-4 w-4" />
                Add Transaction
              </button>
            </div>
          </div>
          {txLoading ? (
            <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
          ) : (
            <div className="-mx-5 overflow-x-auto border-t border-slate-100 dark:border-white/5">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className={`border-b border-slate-200 dark:border-white/10 ${tableHeaderClass}`}>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Description</th>
                    <th className="py-2 pr-4">Reference</th>
                    <th className="py-2 pr-4 text-right">Amount</th>
                    <th className="py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.length === 0 && (
                    <tr><td colSpan={6} className="py-6 text-center text-sm text-slate-400">No transactions found</td></tr>
                  )}
                  {txs.map((tx) => {
                    const isIn = tx.transaction_type === 'income' || tx.transaction_type === 'transfer_in'
                    return (
                      <tr key={tx.id} className={`${tableRowHoverClass} border-b border-slate-100 dark:border-white/5`}>
                        <td className={`py-2 pr-4 ${tableCellClass}`}>{tx.transaction_date}</td>
                        <td className="py-2 pr-4">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${TX_COLOR[tx.transaction_type]}`}>
                            {isIn
                              ? <ArrowDownCircle className="h-3.5 w-3.5" />
                              : <ArrowUpCircle className="h-3.5 w-3.5" />}
                            {TX_LABELS[tx.transaction_type]}
                          </span>
                        </td>
                        <td className={`py-2 pr-4 ${tableCellClass}`}>{tx.description ?? '—'}</td>
                        <td className={`py-2 pr-4 font-mono text-xs ${tableCellClass}`}>{tx.reference ?? '—'}</td>
                        <td className={`py-2 pr-4 text-right font-semibold ${TX_COLOR[tx.transaction_type]}`}>
                          {isIn ? '+' : '–'}{formatCurrency(tx.amount)}
                        </td>
                        <td className={`py-2 text-right font-mono text-xs ${tableCellClass}`}>{formatCurrency(tx.balance_after)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </GlobalCard>
      )}
    </div>
  )
}
