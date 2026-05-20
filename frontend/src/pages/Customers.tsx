import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Pencil, Plus, Trash2, X } from 'lucide-react'

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
import { api, formatDate, getApiErrorMessage, type Customer, type CustomerCreate } from '../lib/api'
import { downloadCsv } from '../lib/csvExport'

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

function CustomerModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Customer | null
  onClose: () => void
  onSaved: () => void
}) {
  const editing = !!initial
  const [form, setForm] = useState<CustomerCreate>({
    name: initial?.name ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
    address: initial?.address ?? '',
    customer_type: (initial?.customer_type as 'B2B' | 'B2C') ?? 'B2B',
    notes: initial?.notes ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setErr('İsim zorunludur.'); return }
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
      setErr(getApiErrorMessage(e, 'Kayıt başarısız.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1a1628]" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Kapat" className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
        <div className="border-b border-slate-100 px-6 py-5 dark:border-white/10">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{editing ? 'Müşteri düzenle' : 'Yeni müşteri'}</h2>
        </div>
        <form className="grid gap-3 px-6 py-5" onSubmit={onSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label htmlFor="cm-name" className="text-xs font-medium text-slate-600 dark:text-slate-400">İsim *</label>
              <input id="cm-name" required className={inputFieldClass + ' mt-1'} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label htmlFor="cm-email" className="text-xs font-medium text-slate-600 dark:text-slate-400">E-posta</label>
              <input id="cm-email" type="email" className={inputFieldClass + ' mt-1'} value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label htmlFor="cm-phone" className="text-xs font-medium text-slate-600 dark:text-slate-400">Telefon</label>
              <input id="cm-phone" className={inputFieldClass + ' mt-1'} value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+90 5xx xxx xx xx" />
            </div>
            <div>
              <label htmlFor="cm-type" className="text-xs font-medium text-slate-600 dark:text-slate-400">Tip</label>
              <select id="cm-type" className={selectFieldClass + ' mt-1'} value={form.customer_type} onChange={(e) => setForm({ ...form, customer_type: e.target.value as 'B2B' | 'B2C' })}>
                <option value="B2B">B2B (Kurumsal)</option>
                <option value="B2C">B2C (Bireysel)</option>
              </select>
            </div>
            <div>
              <label htmlFor="cm-address" className="text-xs font-medium text-slate-600 dark:text-slate-400">Adres</label>
              <input id="cm-address" className={inputFieldClass + ' mt-1'} value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label htmlFor="cm-notes" className="text-xs font-medium text-slate-600 dark:text-slate-400">Notlar</label>
              <textarea id="cm-notes" rows={2} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 dark:border-white/10 dark:bg-[#1a1628] dark:text-slate-100 resize-none" value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          {err && <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">İptal</button>
            <button type="submit" disabled={busy} className={primaryButtonClass + ' px-4 py-2 text-sm'}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function CustomersPage() {
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('sales.write')

  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Customer | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get<Customer[]>('/customers', { params: { limit: 500 } })
      setCustomers(data)
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Müşteriler yüklenemedi.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

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
    setDeleting(true)
    try {
      await api.delete(`/customers/${deleteTarget.id}`)
      setDeleteTarget(null)
      void load()
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Silme başarısız.'))
    } finally {
      setDeleting(false)
    }
  }

  function handleExport() {
    downloadCsv(
      filtered.map((c) => ({
        ID: c.id,
        İsim: c.name,
        Tip: c.customer_type,
        'E-posta': c.email ?? '',
        Telefon: c.phone ?? '',
        Adres: c.address ?? '',
        Notlar: c.notes ?? '',
        Oluşturulma: formatDate(c.created_at),
      })),
      'musteriler.csv',
    )
  }

  return (
    <PageLayout
      title="Müşteriler"
      subtitle="CRM — müşteri listesi, profil ve satış geçmişi."
      actions={
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleExport} disabled={filtered.length === 0} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
          {canWrite && (
            <button type="button" onClick={() => { setEditTarget(null); setModalOpen(true) }} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 active:scale-95">
              <Plus className="h-3.5 w-3.5" />
              Yeni Müşteri
            </button>
          )}
        </div>
      }
    >
      {/* Filtreler */}
      <GlobalCard>
        <div className="flex flex-wrap gap-3">
          <input
            aria-label="Müşteri ara"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="İsim veya e-posta ara…"
            className={inputFieldClass + ' max-w-xs'}
          />
          <select
            aria-label="Müşteri tipi filtrele"
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
            className={selectFieldClass + ' w-40'}
          >
            <option value="">Tüm tipler</option>
            <option value="B2B">B2B</option>
            <option value="B2C">B2C</option>
          </select>
        </div>
      </GlobalCard>

      {/* Tablo */}
      {loading && customers.length === 0 ? (
        <SkeletonTable rows={8} cols={5} />
      ) : (
        <GlobalCard>
          <GlobalCardHeader
            title="Müşteri listesi"
            description={`${filtered.length} kayıt`}
            right={error ? <span className="text-sm text-rose-600 dark:text-rose-300">{error}</span> : null}
          />
          {filtered.length === 0 ? (
            <EmptyState
              title="Müşteri bulunamadı"
              description={search ? 'Farklı bir arama terimi deneyin.' : 'Henüz müşteri eklenmemiş.'}
              action={
                canWrite ? (
                  <button type="button" onClick={() => { setEditTarget(null); setModalOpen(true) }} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700">
                    <Plus className="h-3.5 w-3.5" />
                    Müşteri ekle
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
                        İsim <SortArrow k="name" />
                      </th>
                      <th className="cursor-pointer py-2 pr-4 select-none" onClick={() => toggleSort('customer_type')}>
                        Tip <SortArrow k="customer_type" />
                      </th>
                      <th className="py-2 pr-4">E-posta</th>
                      <th className="py-2 pr-4">Telefon</th>
                      <th className="cursor-pointer py-2 pr-4 select-none" onClick={() => toggleSort('created_at')}>
                        Oluşturulma <SortArrow k="created_at" />
                      </th>
                      {canWrite && <th className="py-2 pr-5 sr-only">İşlemler</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((c) => (
                      <tr key={c.id} className={tableRowHoverClass + ' border-b border-slate-100 dark:border-white/5'}>
                        <td className={`py-2.5 pl-5 pr-4 font-medium ${tableCellClass}`}>{c.name}</td>
                        <td className="py-2.5 pr-4"><TypeBadge type={c.customer_type} /></td>
                        <td className={`py-2.5 pr-4 ${tableCellClass}`}>{c.email ?? '—'}</td>
                        <td className={`py-2.5 pr-4 ${tableCellClass}`}>{c.phone ?? '—'}</td>
                        <td className={`py-2.5 pr-4 ${tableCellClass}`}>{formatDate(c.created_at)}</td>
                        {canWrite && (
                          <td className="py-2.5 pr-5">
                            <div className="flex items-center gap-1">
                              <button type="button" aria-label="Düzenle" onClick={() => { setEditTarget(c); setModalOpen(true) }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-violet-50 hover:text-violet-600 dark:text-slate-400 dark:hover:bg-violet-500/10 dark:hover:text-violet-300">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button type="button" aria-label="Sil" onClick={() => setDeleteTarget(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
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
          onSaved={() => { setModalOpen(false); void load() }}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#1a1628]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Müşteriyi sil?</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400"><strong>{deleteTarget.name}</strong> adlı müşteri arşivlenecek (veri korunur).</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300">İptal</button>
              <button type="button" disabled={deleting} onClick={() => void confirmDelete()} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60">
                {deleting ? 'Siliniyor…' : 'Sil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  )
}
