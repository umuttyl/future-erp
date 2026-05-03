import { useEffect } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, Zap } from 'lucide-react'

export type WsToastItem = {
  id: string
  message: string
  kind: 'warning' | 'info' | 'critical' | 'success'
}

type AiWsToastStackProps = {
  items: WsToastItem[]
  onDismiss: (id: string) => void
  durationMs?: number
}

function kindStyles(kind: WsToastItem['kind']) {
  switch (kind) {
    case 'critical':
      return 'border-rose-300/90 bg-white/95 text-rose-950 ring-rose-500/20 dark:border-rose-500/30 dark:bg-[#1a1018]/95 dark:text-rose-50 dark:ring-rose-400/25'
    case 'info':
      return 'border-sky-300/90 bg-white/95 text-slate-900 ring-sky-500/15 dark:border-sky-500/25 dark:bg-[#10141a]/95 dark:text-sky-50 dark:ring-sky-400/20'
    case 'success':
      return 'border-emerald-300/90 bg-white/95 text-emerald-950 ring-emerald-500/20 dark:border-emerald-500/30 dark:bg-[#101a14]/95 dark:text-emerald-50 dark:ring-emerald-400/20'
    default:
      return 'border-amber-300/90 bg-white/95 text-amber-950 ring-amber-500/20 dark:border-amber-500/30 dark:bg-[#1a1610]/95 dark:text-amber-50 dark:ring-amber-400/20'
  }
}

function KindIcon({ kind }: { kind: WsToastItem['kind'] }) {
  const cls = 'mt-0.5 h-5 w-5 shrink-0'
  if (kind === 'critical') return <AlertTriangle className={cls + ' text-rose-600 dark:text-rose-400'} aria-hidden />
  if (kind === 'info') return <Info className={cls + ' text-sky-600 dark:text-sky-400'} aria-hidden />
  if (kind === 'success') return <CheckCircle2 className={cls + ' text-emerald-600 dark:text-emerald-400'} aria-hidden />
  return <Zap className={cls + ' text-amber-600 dark:text-amber-400'} aria-hidden />
}

function ToastRow({ item, durationMs, onDismiss }: { item: WsToastItem; durationMs: number; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const t = window.setTimeout(() => onDismiss(item.id), durationMs)
    return () => window.clearTimeout(t)
  }, [item.id, durationMs, onDismiss])

  return (
    <div
      role="status"
      className={[
        'animate-ws-toast-in flex max-w-md items-start gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-md dark:shadow-card-dark',
        kindStyles(item.kind),
      ].join(' ')}
    >
      <KindIcon kind={item.kind} />
      <p className="min-w-0 flex-1 text-sm font-medium leading-snug">{item.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className="shrink-0 rounded-lg p-1 text-slate-500 transition hover:bg-black/5 dark:hover:bg-white/10"
        aria-label="Kapat"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/** WebSocket AI uyarıları — sağ üst, kısa süre sonra kapanır. */
export function AiWsToastStack({ items, onDismiss, durationMs = 6000 }: AiWsToastStackProps) {
  if (items.length === 0) return null
  return (
    <div className="pointer-events-none fixed right-4 top-20 z-[70] flex max-h-[min(70vh,28rem)] w-[min(100vw-2rem,22rem)] flex-col gap-2 sm:right-6">
      <div className="pointer-events-auto flex flex-col gap-2">
        {items.map((item) => (
          <ToastRow key={item.id} item={item} durationMs={durationMs} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  )
}
