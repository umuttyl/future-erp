import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Users } from 'lucide-react'

import { GlobalCard, GlobalCardHeader } from '../components/ui/GlobalCard'
import { PageLayout } from '../components/ui/PageLayout'
import { secondaryButtonClass, tableCellClass, tableHeaderClass, tableRowHoverClass } from '../components/ui/forms'
import { useAuth } from '../context/AuthContext'
import { fetchEmployeePerformance, getApiErrorMessage, type EmployeePerformanceRow } from '../lib/api'

const PERM_HR_PERFORMANCE = 'hr.performance.read'

function scoreBarColor(score: number): string {
  if (score < 50) return 'bg-rose-500 shadow-sm shadow-rose-500/30'
  if (score <= 75) return 'bg-amber-400 shadow-sm shadow-amber-400/25'
  return 'bg-emerald-500 shadow-sm shadow-emerald-500/25'
}

function AiScoreCell({ score }: { score: number }) {
  return (
    <div className="flex min-w-[140px] max-w-[220px] items-center gap-3">
      <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/80 dark:bg-white/10 dark:ring-white/10">
        <div
          className={['h-full rounded-full transition-[width] duration-500 ease-out', scoreBarColor(score)].join(' ')}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
        {score}
      </span>
    </div>
  )
}

function InsightCell({ text }: { text: string }) {
  return (
    <p
      className="max-w-md cursor-default truncate text-sm text-slate-700 dark:text-slate-300"
      title={text}
    >
      {text}
    </p>
  )
}

export function HrPage() {
  const { hasPermission } = useAuth()
  const canViewPerformance = hasPermission(PERM_HR_PERFORMANCE)

  const [rows, setRows] = useState<EmployeePerformanceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!canViewPerformance) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchEmployeePerformance()
      setRows(data)
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Performans verisi alınamadı'))
    } finally {
      setLoading(false)
    }
  }, [canViewPerformance])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <PageLayout
      title="İnsan Kaynakları"
      subtitle="Çalışanlar ve AI destekli performans özeti."
    >
      {!canViewPerformance ? (
        <GlobalCard>
          <div className="mx-auto flex max-w-lg flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400">
              <Users className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Erişim kısıtlı</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Çalışan performans tablosunu ve skorları yalnızca <strong className="text-slate-800 dark:text-slate-200">Admin</strong> ve{' '}
              <strong className="text-slate-800 dark:text-slate-200">Manager</strong> rolleri görüntüleyebilir.
            </p>
          </div>
        </GlobalCard>
      ) : (
        <GlobalCard padding={false}>
          <div className="p-5 pb-0">
            <GlobalCardHeader
              title="Çalışan performansı"
              description="AI destekli verimlilik skoru ve değerlendirme (kiracı içi aktif kullanıcılar)."
              right={
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void load()}
                  className={secondaryButtonClass + ' inline-flex items-center gap-2 disabled:opacity-50'}
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
                  Yenile
                </button>
              }
            />
          </div>
          {error ? (
            <div className="mx-5 mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-100">
              {error}
            </div>
          ) : null}
          <div className="overflow-x-auto border-t border-slate-100 dark:border-white/5">
            <table className="min-w-full text-sm">
              <thead>
                <tr className={tableHeaderClass}>
                  <th className="px-5 py-3">İsim</th>
                  <th className="px-5 py-3">Departman</th>
                  <th className="px-5 py-3">Rol</th>
                  <th className="px-5 py-3">AI performans skoru</th>
                  <th className="px-5 py-3">AI değerlendirmesi</th>
                </tr>
              </thead>
              <tbody>
                {loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-slate-500 dark:text-slate-400">
                      Yükleniyor…
                    </td>
                  </tr>
                ) : null}
                {!loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-slate-500 dark:text-slate-400">
                      Kayıtlı çalışan bulunamadı.
                    </td>
                  </tr>
                ) : null}
                {rows.map((r) => (
                  <tr key={r.id} className={tableRowHoverClass}>
                    <td className={`px-5 py-3 font-medium text-slate-900 dark:text-slate-100`}>{r.full_name}</td>
                    <td className={`px-5 py-3 ${tableCellClass}`}>{r.department ?? '—'}</td>
                    <td className={`px-5 py-3 capitalize ${tableCellClass}`}>{r.role}</td>
                    <td className="px-5 py-3 align-middle">
                      <AiScoreCell score={r.ai_score} />
                    </td>
                    <td className="px-5 py-3 align-middle">
                      <InsightCell text={r.ai_insight} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlobalCard>
      )}
    </PageLayout>
  )
}
