import { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Activity, X, ShoppingCart, CreditCard, MessageSquare, RotateCcw, AlertTriangle } from 'lucide-react'
import { fetchCustomerTimeline, formatCurrency, getActiveLocale, type TimelineEvent } from '../lib/api'

interface Props {
  customerId: number
  customerName: string
  onClose: () => void
}

const KIND_CONFIG: Record<string, {
  icon: React.ReactNode
  color: string
  bg: string
}> = {
  sale:    { icon: <ShoppingCart className="w-3.5 h-3.5" />, color: 'text-violet-600', bg: 'bg-violet-100' },
  payment: { icon: <CreditCard className="w-3.5 h-3.5" />,  color: 'text-emerald-600', bg: 'bg-emerald-100' },
  credit:  { icon: <RotateCcw className="w-3.5 h-3.5" />,   color: 'text-sky-600',     bg: 'bg-sky-100' },
  comment: { icon: <MessageSquare className="w-3.5 h-3.5" />, color: 'text-amber-600',  bg: 'bg-amber-100' },
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(getActiveLocale(), { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

export default function CustomerTimelineModal({ customerId, customerName, onClose }: Props) {
  const { t } = useTranslation()
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCustomerTimeline(customerId)
      .then(setEvents)
      .finally(() => setLoading(false))
  }, [customerId])

  const lastInteraction = events[0]
  const silentDays = lastInteraction ? daysSince(lastInteraction.timestamp) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-violet-500" />
            <div>
              <span className="font-semibold text-gray-800">{customerName}</span>
              <p className="text-xs text-gray-400 leading-none mt-0.5">{t('timeline.subtitle')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4">
          {loading ? (
            <div className="text-center py-10 text-gray-400 text-sm">{t('common.loading')}</div>
          ) : events.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              {t('timeline.noEvents')}
            </div>
          ) : (
            <>
              {/* Silence warning */}
              {silentDays !== null && silentDays >= 28 && (
                <div className="flex items-start gap-2 mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700">
                    <Trans
                      i18nKey="timeline.silenceWarning"
                      values={{ days: silentDays, date: formatDate(lastInteraction.timestamp) }}
                      components={[<strong key="0" />]}
                    />
                  </p>
                </div>
              )}

              {/* Timeline */}
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-[18px] top-2 bottom-2 w-px bg-gray-100" />

                <div className="space-y-4">
                  {events.map((ev, i) => {
                    const cfg = KIND_CONFIG[ev.kind] ?? KIND_CONFIG.sale
                    return (
                      <div key={i} className="flex gap-3 relative">
                        {/* Icon dot */}
                        <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${cfg.bg} ${cfg.color} z-10`}>
                          {cfg.icon}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 pt-1.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-medium text-gray-800 truncate">{ev.title}</span>
                            {ev.amount !== null && (
                              <span className={`text-xs font-semibold tabular-nums shrink-0 ${
                                ev.kind === 'payment' ? 'text-emerald-600' :
                                ev.kind === 'credit'  ? 'text-sky-600' :
                                'text-violet-600'
                              }`}>
                                {ev.kind === 'payment' || ev.kind === 'credit' ? '+' : ''}
                                {formatCurrency(ev.amount)}
                              </span>
                            )}
                          </div>
                          {ev.subtitle && (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{ev.subtitle}</p>
                          )}
                          <p className="text-[10px] text-gray-400 mt-1">{formatDate(ev.timestamp)}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
