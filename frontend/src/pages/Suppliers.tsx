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
  tableCellClass,
  tableHeaderClass,
  tableRowHoverClass,
} from '../components/ui/forms'
import { useAuth } from '../context/AuthContext'
import { api, formatDate, getApiErrorMessage, type Supplier, type SupplierCreate } from '../lib/api'
import { downloadCsv } from '../lib/csvExport'

const PAGE_SIZE = 20
type SortKey = 'name' | 'contact_person' | 'created_at'
type SortDir = 'asc' | 'desc'

function SupplierModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Supplier | null
  onClose: () => void
  onSaved: () => void
}) {
  const editing = !!initial
  const [form, setForm] = useState<SupplierCreate>({
    name: initial?.name ?? '',
    contact_person: initial?.contact_person ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
    payment_terms: initial?.payment_terms ?? '',
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
        contact_person: form.contact_person?.trim() || null,
        email: form.email?.trim() || null,
        phone: form.phone?.trim() || null,
        payment_terms: form.payment_terms?.trim() || null,
        notes: form.notes?.trim() || null,
      }
      if (editing) {
        await api.patch(`/suppliers/${initial!.id}`, payload)
      } else {
        await api.post('/suppliers', payload)
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
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{editing ? 'Tedarikçi düzenle' : 'Yeni tedarikçi'}</h2>
        </div>
        <form className="grid gap-3 px-6 py-5" onSubmit={onSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label htmlFor="sm-name" className="text-xs font-medium text-slate-600 dark:text-slate-400">Firma adı *</label>
              <input id="sm-name" required className={inputFieldClass + ' mt-1'} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label htmlFor="sm-contact" className="text-xs font-medium text-slate-600 dark:text-slate-400">İletişim kişisi</label>
              <input id="sm-contact" className={inputFieldClass + ' mt-1'} value={form.contact_person ?? ''} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
            </div>
            <div>
              <label htmlFor="sm-email" className="text-xs font-medium text-slate-600 dark:text-slate-400">E-posta</label>
              <input id="sm-email" type="email" className={inputFieldClass + ' mt-1'} value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label htmlFor="sm-phone" className="text-xs font-medium text-slate-600 dark:text-slate-400">Telefon</label>
              <input id="sm-phone" className={inputFieldClass + ' mt-1'} value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+90 2xx xxx xx xx" />
            </div>
            <div>
              <label htmlFor="sm-terms" className="text-xs font-medium text-slate-600 dark:text-slate-400">Ödeme koşulları</label>
              <input id="sm-terms" className={inputFieldClass + ' mt-1'} value={form.payment_terms ?? ''} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} placeholder="30 gün net" />
            </div>
            <div className="col-span-2">
              <label htmlFor="sm-notes" className="text-xs font-medium text-slate-600 dark:text-slate-400">Notlar</label>
              <textarea id="sm-notes" rows={2} className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 dark:border-white/10 dark:bg-[#1a1628] dark:text-slate-100" value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          {err && <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300">İptal</button>
            <button type="submit" disabled={busy} className={primaryButtonClass + ' px-4 py-2 text-sm'}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function SuppliersPage() {
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('catalog.product.write')

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Supplier | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get<Supplier[]>('/suppliers', { params: { limit: 500 } })
      setSuppliers(data)
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Tedarikçiler yüklenemedi.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    let list = suppliers
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((s) => s.name.toLowerCase().includes(q) || s.contact_person?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q))
    }
    list = [...list].sort((a, b) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      const cmp = String(av).localeCompare(String(bv), 'tr')
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [suppliers, search, sortKey, sortDir])

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
      await api.delete(`/suppliers/${deleteTarget.id}`)
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
      filtered.map((s) => ({
        ID: s.id,
        'Firma Adı': s.name,
        'İletişim Kişisi': s.contact_person ?? '',
        'E-posta': s.email ?? '',
        Telefon: s.phone ?? '',
        'Ödeme Koşulları': s.payment_terms ?? '',
        Notlar: s.notes ?? '',
        Oluşturulma: formatDate(s.created_at),
      })),
      'tedarikciler.csv',
    )
  }

  return (
    <PageLayout
      title="Tedarikçiler"
      subtitle="Tedarik zinciri — tedarikçi listesi ve iletişim bilgileri."
      actions={
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleExport} disabled={filtered.length === 0} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
          {canWrite && (
            <button type="button" onClick={() => { setEditTarget(null); setModalOpen(true) }} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 active:scale-95">
              <Plus className="h-3.5 w-3.5" />
              Yeni Tedarikçi
            </button>
          )}
        </div>
      }
    >
      <GlobalCard>
        <input
          aria-label="Tedarikçi ara"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Firma adı, kişi veya e-posta ara…"
          className={inputFieldClass + ' max-w-xs'}
        />
      </GlobalCard>

      {loading && suppliers.length === 0 ? (
        <SkeletonTable rows={8} cols={5} />
      ) : (
        <GlobalCard>
          <GlobalCardHeader
            title="Tedarikçi listesi"
            description={`${filtered.length} kayıt`}
            right={error ? <span className="text-sm text-rose-600 dark:text-rose-300">{error}</span> : null}
          />
          {filtered.length === 0 ? (
            <EmptyState
              title="Tedarikçi bulunamadı"
              description={search ? 'Farklı bir arama terimi deneyin.' : 'Henüz tedarikçi eklenmemiş.'}
              action={
                canWrite ? (
                  <button type="button" onClick={() => { setEditTarget(null); setModalOpen(true) }} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700">
                    <Plus className="h-3.5 w-3.5" />
                    Tedarikçi ekle
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
                        Firma <SortArrow k="name" />
                      </th>
                      <th className="cursor-pointer py-2 pr-4 select-none" onClick={() => toggleSort('contact_person')}>
                        İletişim <SortArrow k="contact_person" />
                      </th>
                      <th className="py-2 pr-4">E-posta</th>
                      <th className="py-2 pr-4">Telefon</th>
                      <th className="py-2 pr-4">Ödeme</th>
                      <th className="cursor-pointer py-2 pr-4 select-none" onClick={() => toggleSort('created_at')}>
                        Oluşturulma <SortArrow k="created_at" />
                      </th>
                      {canWrite && <th className="py-2 pr-5 sr-only">İşlemler</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((s) => (
                      <tr key={s.id} className={tableRowHoverClass + ' border-b border-slate-100 dark:border-white/5'}>
                        <td className={`py-2.5 pl-5 pr-4 font-medium ${tableCellClass}`}>{s.name}</td>
                        <td className={`py-2.5 pr-4 ${tableCellClass}`}>{s.contact_person ?? '—'}</td>
                        <td className={`py-2.5 pr-4 ${tableCellClass}`}>{s.email ?? '—'}</td>
                        <td className={`py-2.5 pr-4 ${tableCellClass}`}>{s.phone ?? '—'}</td>
                        <td className={`py-2.5 pr-4 ${tableCellClass}`}>{s.payment_terms ?? '—'}</td>
                        <td className={`py-2.5 pr-4 ${tableCellClass}`}>{formatDate(s.created_at)}</td>
                        {canWrite && (
                          <td className="py-2.5 pr-5">
                            <div className="flex items-center gap-1">
                              <button type="button" aria-label="Düzenle" onClick={() => { setEditTarget(s); setModalOpen(true) }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-violet-50 hover:text-violet-600 dark:text-slate-400 dark:hover:bg-violet-500/10 dark:hover:text-violet-300">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button type="button" aria-label="Sil" onClick={() => setDeleteTarget(s)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400">
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

      {modalOpen && (
        <SupplierModal
          initial={editTarget}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); void load() }}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#1a1628]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Tedarikçiyi sil?</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400"><strong>{deleteTarget.name}</strong> adlı tedarikçi arşivlenecek.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 dark:border-white/10 dark:text-slate-300">İptal</button>
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
