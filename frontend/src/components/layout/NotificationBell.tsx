import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, BellOff, CheckCheck, Loader2, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../../context/AuthContext'
import { formatNumber, getApiErrorMessage, postInventoryAutoDraft } from '../../lib/api'
import {
  getNotificationWebSocketUrl,
  resolveWsNotificationProductId,
  wsNotificationActionLabel,
  type WsAiNotificationPayload,
} from '../../lib/wsNotifications'
import { AiWsToastStack, type WsToastItem } from './AiWsToastStack'

type StoredNotification = {
  id: string
  payload: WsAiNotificationPayload
  read: boolean
  receivedAt: number
}

function mapPayloadKind(t: string): WsToastItem['kind'] {
  const x = t.toLowerCase()
  if (x === 'critical') return 'critical'
  if (x === 'warning') return 'warning'
  return 'info'
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

const TOAST_MUTE_STORAGE_KEY = 'erp_notifications_toast_mute'

function readToastMuteFromStorage(): boolean {
  try {
    return globalThis.localStorage?.getItem(TOAST_MUTE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** Edge a11y linter accepts literal tokens, not JSX ternary on `aria-expanded`. */
function menuButtonAria(open: boolean): { 'aria-expanded': 'true' | 'false' } {
  return { 'aria-expanded': open ? 'true' : 'false' }
}

export function NotificationBell() {
  const navigate = useNavigate()
  const { user, hasPermission } = useAuth()
  const canWs = hasPermission('ai.insights.read')
  const canStockAction = hasPermission('stock.adjust')

  const [items, setItems] = useState<StoredNotification[]>([])
  const [toasts, setToasts] = useState<WsToastItem[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({})
  const [toastMuted, setToastMutedState] = useState(readToastMuteFromStorage)

  const rootRef = useRef<HTMLDivElement>(null)
  const toastMutedRef = useRef(toastMuted)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const aliveRef = useRef(true)

  toastMutedRef.current = toastMuted

  const setToastMuted = useCallback((value: boolean) => {
    setToastMutedState(value)
    try {
      globalThis.localStorage?.setItem(TOAST_MUTE_STORAGE_KEY, value ? '1' : '0')
    } catch {
      /* */
    }
  }, [])

  const unread = items.filter((i) => !i.read).length

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const MAX_TOASTS = 2

  const pushToast = useCallback((message: string, kind: WsToastItem['kind']) => {
    const tid = `toast-${newId()}`
    setToasts((prev) => [...prev, { id: tid, message, kind }].slice(-MAX_TOASTS))
  }, [])

  const appendNotification = useCallback((payload: WsAiNotificationPayload) => {
    if (!aliveRef.current) return
    const id = newId()
    const toastId = `toast-${id}`
    setItems((prev) => [{ id, payload, read: false, receivedAt: Date.now() }, ...prev].slice(0, 80))
    if (!toastMutedRef.current) {
      setToasts((prev) =>
        [...prev, { id: toastId, message: payload.message, kind: mapPayloadKind(payload.type || 'info') }].slice(
          -MAX_TOASTS,
        ),
      )
    }
  }, [])

  useEffect(() => {
    if (!user || !canWs) return

    aliveRef.current = true

    const clearReconnect = () => {
      if (reconnectTimerRef.current != null) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }

    const connect = () => {
      clearReconnect()
      const url = getNotificationWebSocketUrl()
      if (!url || !aliveRef.current) return

      try {
        const ws = new WebSocket(url)
        wsRef.current = ws

        ws.onmessage = (ev) => {
          if (!aliveRef.current) return
          try {
            const data = JSON.parse(String(ev.data)) as WsAiNotificationPayload
            if (data && typeof data.message === 'string') appendNotification(data)
          } catch {
            /* geçersiz JSON */
          }
        }

        ws.onclose = () => {
          wsRef.current = null
          if (!aliveRef.current) return
          clearReconnect()
          reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = null
            if (aliveRef.current && getNotificationWebSocketUrl()) connect()
          }, 4000)
        }

        ws.onerror = () => {
          try {
            ws.close()
          } catch {
            /* */
          }
        }
      } catch {
        clearReconnect()
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null
          if (aliveRef.current && getNotificationWebSocketUrl()) connect()
        }, 4000)
      }
    }

    connect()

    return () => {
      aliveRef.current = false
      clearReconnect()
      try {
        wsRef.current?.close()
      } catch {
        /* */
      }
      wsRef.current = null
    }
  }, [user?.id, canWs, appendNotification])

  useEffect(() => {
    if (!dropdownOpen) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [dropdownOpen])

  const markRead = (id: string) => {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, read: true } : x)))
  }

  const markAllRead = () => {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })))
  }

  const removeReadFromList = () => {
    setItems((prev) => prev.filter((x) => !x.read))
  }

  const handleCardActivate = (row: StoredNotification) => {
    markRead(row.id)
    if (row.payload.platform_summary) {
      navigate('/admin')
    } else {
      const pid = resolveWsNotificationProductId(row.payload)
      if (pid != null) navigate(`/stock?productId=${pid}`)
      else navigate('/stock')
    }
    setDropdownOpen(false)
  }

  const handleNotificationAction = async (row: StoredNotification) => {
    const pid = resolveWsNotificationProductId(row.payload)
    const sku = (row.payload.product_sku ?? '').trim() || 'Ürün'
    if (pid == null || !canStockAction) return

    setActionBusy((b) => ({ ...b, [row.id]: true }))
    try {
      const res = await postInventoryAutoDraft(pid, { isAiOverride: true })
      const qty = res.order.quantity
      pushToast(`${sku} için ${formatNumber(qty)} adet sipariş taslağı başarıyla oluşturuldu.`, 'success')
      setItems((prev) => prev.filter((x) => x.id !== row.id))
    } catch (e: unknown) {
      pushToast(getApiErrorMessage(e, 'İşlem yapılamadı.'), 'critical')
    } finally {
      setActionBusy((b) => {
        const next = { ...b }
        delete next[row.id]
        return next
      })
    }
  }

  if (!user || !canWs) return null

  return (
    <>
      <AiWsToastStack items={toasts} onDismiss={dismissToast} durationMs={6500} />

      <div className="relative" ref={rootRef}>
        <button
          type="button"
          {...menuButtonAria(dropdownOpen)}
          onClick={() => setDropdownOpen((o) => !o)}
          className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          aria-label="Bildirimler"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 ? (
            <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-white dark:ring-[#12101f]">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </button>

        {dropdownOpen ? (
          <div className="absolute right-0 top-11 z-50 w-[min(calc(100vw-2rem),22rem)] origin-top-right rounded-2xl border border-slate-200/90 bg-white py-2 shadow-xl dark:border-white/10 dark:bg-[#16122b] dark:shadow-card-dark">
            <div className="border-b border-slate-100 px-4 py-3 dark:border-white/10">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {toastMuted ? (
                    <BellOff className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden />
                  ) : (
                    <Bell className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden />
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">Sustur</div>
                    <div className="truncate text-[10px] text-slate-500 dark:text-slate-400">Açıkken toast gösterilmez</div>
                  </div>
                </div>
                <label className="relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center">
                  <span className="sr-only">Bildirim toastlarını sustur</span>
                  <input
                    type="checkbox"
                    checked={toastMuted}
                    onChange={(e) => setToastMuted(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span
                    className={[
                      'pointer-events-none absolute inset-0 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-violet-500 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white dark:peer-focus-visible:ring-offset-[#16122b]',
                      toastMuted ? 'bg-violet-600 dark:bg-violet-500' : 'bg-slate-200 dark:bg-white/15',
                    ].join(' ')}
                    aria-hidden
                  />
                  <span
                    className={[
                      'pointer-events-none absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform',
                      toastMuted ? 'left-5' : 'left-0.5',
                    ].join(' ')}
                    aria-hidden
                  />
                </label>
              </div>
            </div>

            <div className="border-b border-slate-100 px-4 pb-2 pt-1 dark:border-white/10">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">Bildirimler</div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">AI anomali uyarıları (canlı)</div>
            </div>

            <div className="max-h-72 overflow-y-auto px-2 py-2">
              {items.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">Henüz bildirim yok.</p>
              ) : (
                <ul className="space-y-1">
                  {items.map((row) => {
                    const isPlatformSummary = Boolean(row.payload.platform_summary)
                    const actionLabel = isPlatformSummary ? null : wsNotificationActionLabel(row.payload)
                    const productId = isPlatformSummary ? null : resolveWsNotificationProductId(row.payload)
                    const busy = Boolean(actionBusy[row.id])
                    const showAction = Boolean(actionLabel && productId != null)

                    return (
                      <li key={row.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              handleCardActivate(row)
                            }
                          }}
                          onClick={() => handleCardActivate(row)}
                          className={[
                            'w-full cursor-pointer rounded-xl px-3 py-2.5 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-violet-500/60',
                            row.read
                              ? 'opacity-70 hover:bg-slate-50 dark:hover:bg-white/5'
                              : isPlatformSummary
                                ? 'bg-red-50/80 hover:bg-red-100/70 dark:bg-red-950/20 dark:hover:bg-red-950/40'
                                : 'bg-violet-50/80 hover:bg-violet-100/90 dark:bg-violet-950/30 dark:hover:bg-violet-950/50',
                          ].join(' ')}
                        >
                          <div className="flex items-center gap-2">
                            {isPlatformSummary ? (
                              <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-700 dark:bg-red-950/50 dark:text-red-300">
                                Platform
                              </span>
                            ) : (
                              <span
                                className={[
                                  'rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                                  mapPayloadKind(row.payload.type || 'info') === 'critical'
                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200'
                                    : mapPayloadKind(row.payload.type || 'info') === 'warning'
                                      ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100'
                                      : 'bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-100',
                                ].join(' ')}
                              >
                                {row.payload.type || 'info'}
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400">
                              {new Date(row.receivedAt).toLocaleString('tr-TR', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-slate-800 dark:text-slate-200">{row.payload.message}</p>

                          {isPlatformSummary && row.payload.tenant_issues && row.payload.tenant_issues.length > 0 ? (
                            <ul className="mt-1.5 space-y-0.5">
                              {row.payload.tenant_issues.map((ti) => (
                                <li key={ti.tenant_id} className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                                  <span className="truncate">{ti.tenant_name}</span>
                                  <span className="ml-2 shrink-0 rounded bg-rose-100 px-1 py-0.5 font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                                    {ti.critical_count} ürün
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : null}

                          {!isPlatformSummary && row.payload.product_sku ? (
                            <p className="mt-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">{row.payload.product_sku}</p>
                          ) : null}

                          {showAction ? (
                            <div className="mt-2">
                              <button
                                type="button"
                                disabled={!canStockAction || busy}
                                title={!canStockAction ? 'Bu işlem için stok düzenleme izni gerekir' : undefined}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void handleNotificationAction(row)
                                }}
                                className={[
                                  'inline-flex w-full items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-semibold transition',
                                  canStockAction && !busy
                                    ? 'bg-violet-600 text-white shadow-sm hover:bg-violet-500 dark:bg-violet-500 dark:hover:bg-violet-400'
                                    : 'cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-400',
                                ].join(' ')}
                              >
                                {busy ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden /> : null}
                                {busy ? 'Oluşturuluyor…' : actionLabel}
                              </button>
                            </div>
                          ) : actionLabel ? (
                            <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">Ürün bilgisi eksik; aksiyon kullanılamıyor.</p>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {items.length > 0 ? (
              <div className="flex flex-wrap gap-2 border-t border-slate-100 px-3 py-2 dark:border-white/10">
                <button
                  type="button"
                  onClick={markAllRead}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-[#1a1628] dark:text-slate-200 dark:hover:bg-white/10"
                >
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                  Tümünü okundu
                </button>
                <button
                  type="button"
                  onClick={removeReadFromList}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-[#1a1628] dark:text-slate-200 dark:hover:bg-white/10"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Okunanları sil
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  )
}
