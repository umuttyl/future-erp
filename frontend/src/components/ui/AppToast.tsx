import { useEffect } from 'react'
import { CheckCircle2, X, XCircle } from 'lucide-react'

type AppToastProps = {
  message: string
  variant: 'success' | 'error'
  onDismiss: () => void
  /** ms; varsayılan 5200 */
  durationMs?: number
}

export function AppToast({ message, variant, onDismiss, durationMs = 5200 }: AppToastProps) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, durationMs)
    return () => window.clearTimeout(t)
  }, [durationMs, onDismiss])

  const isOk = variant === 'success'

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'fixed bottom-4 right-4 z-[60] flex max-w-md items-start gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-sm transition-all dark:shadow-card-dark sm:bottom-6 sm:right-6',
        isOk
          ? 'border-emerald-200/90 bg-white/95 text-slate-800 ring-1 ring-emerald-500/15 dark:border-emerald-500/25 dark:bg-[#14101f]/95 dark:text-emerald-50 dark:ring-emerald-400/20'
          : 'border-rose-200/90 bg-white/95 text-slate-800 ring-1 ring-rose-500/15 dark:border-rose-500/25 dark:bg-[#14101f]/95 dark:text-rose-50 dark:ring-rose-400/20',
      ].join(' ')}
    >
      {isOk ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
      ) : (
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden />
      )}
      <p className="min-w-0 flex-1 text-sm font-medium leading-snug">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/10 dark:hover:text-slate-200"
        aria-label="Kapat"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
