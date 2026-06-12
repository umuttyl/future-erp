/**
 * Inline AI suggestion hint for form fields.
 * Shows a small chip below an input with a Tab-to-accept shortcut.
 */

type FormHintProps = {
  label: string      // e.g. "Kategori önerisi"
  value: string      // suggested value to display
  onAccept: () => void
}

export function FormHint({ label, value, onAccept }: FormHintProps) {
  if (!value) return null
  return (
    <div className="mt-1 flex items-center gap-1.5">
      <span className="text-[10px] text-violet-500 dark:text-violet-400">💡 {label}:</span>
      <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
        {value}
      </span>
      <button
        type="button"
        tabIndex={-1}
        onClick={onAccept}
        className="rounded border border-violet-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-violet-600 transition hover:bg-violet-50 dark:border-violet-500/30 dark:bg-transparent dark:text-violet-400 dark:hover:bg-violet-900/20"
      >
        Tab ↹
      </button>
    </div>
  )
}
