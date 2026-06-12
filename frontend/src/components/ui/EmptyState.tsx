import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'

type EmptyStateProps = {
  title?: string
  description?: string
  icon?: LucideIcon
  action?: ReactNode
}

export function EmptyState({
  title = 'No data found',
  description,
  icon: Icon = Inbox,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ui-surface-2">
        <Icon className="h-7 w-7 text-ui-muted" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-semibold text-ui-text">{title}</p>
      {description && (
        <p className="mt-1 max-w-xs text-xs text-ui-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
