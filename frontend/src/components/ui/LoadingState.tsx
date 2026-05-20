type LoadingStateProps = {
  /** Optional label shown below the spinner. Pass `false` to hide. */
  label?: string | false
  /** Minimum height class. Defaults to `min-h-[40vh]`. */
  minHeight?: string
}

/**
 * Centered spinner used for full-section and full-page loading states.
 * Replaces ad-hoc `animate-spin` divs scattered across page components.
 */
export function LoadingState({ label = 'Yükleniyor', minHeight = 'min-h-[40vh]' }: LoadingStateProps) {
  return (
    <div className={`flex ${minHeight} flex-col items-center justify-center gap-3`}>
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-violet-600 dark:border-slate-700 dark:border-t-violet-400"
        role="status"
        aria-label={label || 'Yükleniyor'}
      />
      {label ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      ) : null}
    </div>
  )
}

/** Compact inline spinner — use inside buttons or small containers. */
export function InlineSpinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-slate-200 border-t-violet-600 dark:border-slate-700 dark:border-t-violet-400 ${className}`}
      role="status"
      aria-label="Yükleniyor"
    />
  )
}
