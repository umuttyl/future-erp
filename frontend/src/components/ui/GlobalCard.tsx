import type { ReactNode } from 'react'

type GlobalCardProps = {
  children: ReactNode
  className?: string
  /** false: table-style edge-to-edge content */
  padding?: boolean
  /** hover lift + glow */
  hoverable?: boolean
}

export function GlobalCard({ children, className = '', padding = true, hoverable = false }: GlobalCardProps) {
  return (
    <div
      className={[
        'rounded-2xl border bg-ui-surface shadow-card',
        'border-ui-border-sub dark:border-white/[0.06]',
        hoverable
          ? 'cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover hover:border-ui-accent/20 dark:hover:shadow-glow-accent dark:hover:border-ui-accent/25'
          : 'transition-shadow duration-300',
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
        <h2 className="text-[15px] font-semibold tracking-tight text-ui-text">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-ui-muted">{description}</p>
        ) : null}
      </div>
      {right}
    </div>
  )
}
