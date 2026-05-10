import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, ShieldAlert, Users, X } from 'lucide-react'

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
      className="max-w-xs cursor-default truncate text-sm text-slate-700 dark:text-slate-300 sm:max-w-md"
      title={text}
    >
      {text}
    </p>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? 'inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200'
          : 'inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-white/15 dark:text-slate-300'
      }
    >
      {active ? 'Aktif' : 'Pasif'}
    </span>
  )
}

function mockEmployeeDetail(row: EmployeePerformanceRow) {
  const y = 2019 + (row.id % 6)
  const m = row.id % 12
  const d = 1 + (row.id % 25)
  const hire = new Date(y, m, d)
  return {
    hireDate: hire.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }),
    manager: 'Ayşe Yılmaz',
    phone: `+90 5${30 + (row.id % 39)} ${200 + (row.id % 700)} ${10_000 + (row.id % 8999)}`,
    location: row.department?.trim() || 'Genel merkez — İstanbul',
    activities: [
      `${new Date().getFullYear()} Q1 performans görüşmesi tamamlandı.`,
      'Son ERP oturumu: bugün, güvenli oturum.',
      'Bekleyen izin onayı yok.',
    ],
  }
}

function EmployeeDetailModal({
  row,
  onClose,
}: {
  row: EmployeePerformanceRow
  onClose: () => void
}) {
  const extra = mockEmployeeDetail(row)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hr-detail-title"
      onClick={onClose}
    >
      <div
        className="relative max-h-[min(90vh,720px)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1a1628]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
          aria-label="Kapat"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="border-b border-slate-100 bg-gradient-to-r from-violet-600/10 to-indigo-600/10 px-6 pb-5 pt-6 dark:border-white/10 dark:from-violet-500/15 dark:to-indigo-600/15">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">Çalışan kartı</p>
          <h2 id="hr-detail-title" className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {row.full_name}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{row.email}</p>
        </div>

        <div className="grid gap-6 px-6 py-6 sm:grid-cols-2">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Rol</div>
            <p className="text-sm font-medium capitalize text-slate-900 dark:text-slate-100">{row.role}</p>
          </div>
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Durum</div>
            <StatusBadge active={row.is_active} />
          </div>
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Departman</div>
            <p className="text-sm text-slate-800 dark:text-slate-200">{row.department ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">İşe giriş</div>
            <p className="text-sm text-slate-800 dark:text-slate-200">{extra.hireDate}</p>
          </div>
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Raporlayan yönetici</div>
            <p className="text-sm text-slate-800 dark:text-slate-200">{extra.manager}</p>
          </div>
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">İletişim</div>
            <p className="text-sm text-slate-800 dark:text-slate-200">{extra.phone}</p>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Lokasyon</div>
            <p className="text-sm text-slate-800 dark:text-slate-200">{extra.location}</p>
          </div>
          <div className="sm:col-span-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">AI performans özeti</div>
            <p className="mt-2 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-800 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200">
              {row.ai_insight} (Skor: {row.ai_score}/100)
            </p>
          </div>
          <div className="sm:col-span-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Son aktiviteler</div>
            <ul className="mt-2 space-y-2">
              {extra.activities.map((line, i) => (
                <li
                  key={i}
                  className="flex gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm text-slate-700 dark:border-white/10 dark:bg-[#12101f] dark:text-slate-300"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 px-6 py-4 dark:border-white/10">
          <button
            type="button"
            onClick={onClose}
            className={secondaryButtonClass + ' px-4 py-2 text-sm font-medium'}
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  )
}

export function HrPage() {
  const { user, hasPermission } = useAuth()
  const canAccessByRole = user?.role === 'admin' || user?.role === 'manager'
  const canViewPerformance = canAccessByRole && hasPermission(PERM_HR_PERFORMANCE)

  const [rows, setRows] = useState<EmployeePerformanceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailRow, setDetailRow] = useState<EmployeePerformanceRow | null>(null)

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
    <PageLayout title="İnsan Kaynakları" subtitle="Çalışanlar ve AI destekli performans özeti.">
      {!canAccessByRole ? (
        <GlobalCard>
          <div className="mx-auto flex max-w-lg flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              <ShieldAlert className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Erişim reddedildi</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Bu sayfayı görüntüleme yetkiniz yok.</p>
          </div>
        </GlobalCard>
      ) : !hasPermission(PERM_HR_PERFORMANCE) ? (
        <GlobalCard>
          <div className="mx-auto flex max-w-lg flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400">
              <Users className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Erişim kısıtlı</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              İnsan kaynakları performans verisi için gerekli izin atanmamış.
            </p>
          </div>
        </GlobalCard>
      ) : (
        <GlobalCard padding={false}>
          <div className="p-5 pb-0">
            <GlobalCardHeader
              title="Çalışan performansı"
              description="AI destekli verimlilik skoru ve değerlendirme (kiracı içi kullanıcılar)."
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
                  <th className="px-5 py-3">E-posta</th>
                  <th className="px-5 py-3">Departman</th>
                  <th className="px-5 py-3">Rol</th>
                  <th className="px-5 py-3">Durum</th>
                  <th className="px-5 py-3">AI skoru</th>
                  <th className="px-5 py-3">AI değerlendirmesi</th>
                  <th className="px-5 py-3 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-slate-500 dark:text-slate-400">
                      Yükleniyor…
                    </td>
                  </tr>
                ) : null}
                {!loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-slate-500 dark:text-slate-400">
                      Kayıtlı çalışan bulunamadı.
                    </td>
                  </tr>
                ) : null}
                {rows.map((r) => (
                  <tr key={r.id} className={tableRowHoverClass}>
                    <td className={`px-5 py-3 font-medium text-slate-900 dark:text-slate-100`}>{r.full_name}</td>
                    <td className={`px-5 py-3 text-xs ${tableCellClass}`}>{r.email}</td>
                    <td className={`px-5 py-3 ${tableCellClass}`}>{r.department ?? '—'}</td>
                    <td className={`px-5 py-3 capitalize ${tableCellClass}`}>{r.role}</td>
                    <td className="px-5 py-3">
                      <StatusBadge active={r.is_active} />
                    </td>
                    <td className="px-5 py-3 align-middle">
                      <AiScoreCell score={r.ai_score} />
                    </td>
                    <td className="px-5 py-3 align-middle">
                      <InsightCell text={r.ai_insight} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setDetailRow(r)}
                        className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-200 dark:hover:bg-violet-500/25"
                      >
                        Görüntüle / düzenle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlobalCard>
      )}

      {detailRow ? <EmployeeDetailModal row={detailRow} onClose={() => setDetailRow(null)} /> : null}
    </PageLayout>
  )
}
