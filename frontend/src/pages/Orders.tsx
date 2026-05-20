import { useCallback, useEffect, useState } from 'react'
import { CheckCircle, XCircle } from 'lucide-react'

import { GlobalCard, GlobalCardHeader } from '../components/ui/GlobalCard'
import { PageLayout } from '../components/ui/PageLayout'
import { EmptyState } from '../components/ui/EmptyState'
import { tableCellClass, tableHeaderClass, tableRowHoverClass } from '../components/ui/forms'
import { useAuth } from '../context/AuthContext'
import { api, getApiErrorMessage } from '../lib/api'

interface SupplyOrderRow {
  id: number
  product_id: number
  quantity: number
  status: string
  created_at: string
}

const STATUS_LABELS: Record<string, string> = {
  Draft: 'Taslak',
  Approved: 'Onaylandı',
  Cancelled: 'İptal',
}

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200',
  Approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
  Cancelled: 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-400',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[status] ?? STATUS_COLORS['Draft']}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

export function OrdersPage() {
  const { hasPermission } = useAuth()
  const canAdjust = hasPermission('stock.adjust')

  const [orders, setOrders] = useState<SupplyOrderRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get<SupplyOrderRow[]>('/inventory/orders')
      setOrders(data)
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Siparişler yüklenemedi.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function updateStatus(id: number, status: string) {
    setActionBusy(id)
    try {
      await api.patch(`/inventory/orders/${id}/status`, { status })
      await load()
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Durum güncellenemedi.'))
    } finally {
      setActionBusy(null)
    }
  }

  return (
    <PageLayout
      title="Tedarik Siparişleri"
      subtitle="AI tarafından oluşturulan taslak siparişleri inceleyin ve onaylayın."
    >
      <GlobalCard>
        <GlobalCardHeader title="Sipariş listesi" />
        {error && <p className="mb-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            title="Sipariş bulunamadı"
            description="Stok sayfasından AI taslak sipariş oluşturabilirsiniz."
          />
        ) : (
          <div className="-mx-5 overflow-x-auto border-t border-slate-100 dark:border-white/5">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={`border-b border-slate-200 dark:border-white/10 ${tableHeaderClass}`}>
                  <th className="py-2 pr-4">ID</th>
                  <th className="py-2 pr-4">Ürün ID</th>
                  <th className="py-2 pr-4">Miktar</th>
                  <th className="py-2 pr-4">Durum</th>
                  <th className="py-2 pr-4">Oluşturulma</th>
                  {canAdjust && <th className="py-2">İşlemler</th>}
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className={tableRowHoverClass + ' border-b border-slate-100 dark:border-white/5'}>
                    <td className="py-2 pr-4 font-mono text-slate-500 dark:text-slate-400">{o.id}</td>
                    <td className={`py-2 pr-4 ${tableCellClass}`}>#{o.product_id}</td>
                    <td className={`py-2 pr-4 ${tableCellClass}`}>{o.quantity}</td>
                    <td className="py-2 pr-4"><StatusBadge status={o.status} /></td>
                    <td className={`py-2 pr-4 ${tableCellClass}`}>{new Date(o.created_at).toLocaleDateString('tr-TR')}</td>
                    {canAdjust && (
                      <td className="py-2">
                        {o.status === 'Draft' ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={actionBusy === o.id}
                              onClick={() => void updateStatus(o.id, 'Approved')}
                              className="flex h-8 items-center gap-1 rounded-lg bg-emerald-50 px-2.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              Onayla
                            </button>
                            <button
                              type="button"
                              disabled={actionBusy === o.id}
                              onClick={() => void updateStatus(o.id, 'Cancelled')}
                              className="flex h-8 items-center gap-1 rounded-lg bg-rose-50 px-2.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              İptal
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
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
    </PageLayout>
  )
}
