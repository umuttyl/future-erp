import type { ReactNode } from 'react'

type GlobalCardProps = {
  children: ReactNode
  className?: string
  /** false: tablo gibi kenardan kenara içerik */
  padding?: boolean
}

export function GlobalCard({ children, className = '', padding = true }: GlobalCardProps) {
  return (
    <div
      className={[
        'rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-white/10 dark:bg-[#16122b] dark:shadow-card-dark',
        padding ? 'p-5' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}

type GlobalCardHeaderProps = {
  title: string
  description?: string
  right?: ReactNode
}

export function GlobalCardHeader({ title, description, right }: GlobalCardHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{description}</p>
        ) : null}
      </div>
      {right}
    </div>
  )
}
