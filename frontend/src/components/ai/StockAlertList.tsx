import { GlobalCard, GlobalCardHeader } from '../ui/GlobalCard'
import type { StockAlert } from '../../lib/api'

export function StockAlertList({ alerts }: { alerts: StockAlert[] }) {
  const isCrossTenant = alerts.some((a) => a.tenant_name)

  return (
    <GlobalCard>
      <GlobalCardHeader
        title="Stok uyarıları"
        description={isCrossTenant ? 'Tüm şirketler — eşik altı ürünler' : 'Eşik altı ürünler'}
      />
      {alerts.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-100">
          Şu an kritik seviyede olan ürün yok.
        </div>
      ) : (
        <ul className="space-y-2 text-sm">
          {alerts.map((a) => (
            <li
              key={`${a.tenant_name ?? ''}-${a.id}`}
              className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 dark:border-rose-500/25 dark:bg-rose-950/30"
            >
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">{a.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {a.sku}
                  {a.tenant_name && (
                    <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 py-px text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      {a.tenant_name}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono font-semibold text-rose-800 dark:text-rose-200">
                  {a.stock_quantity} / {a.reorder_level}
                </div>
                <div className="text-[10px] text-slate-500">stok / eşik</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </GlobalCard>
  )
}
