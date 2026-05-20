import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'

type EmptyStateProps = {
  title?: string
  description?: string
  icon?: LucideIcon
  action?: React.ReactNode
}

export function EmptyState({
  title = 'Veri bulunamadı',
  description,
  icon: Icon = Inbox,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/5">
        <Icon className="h-7 w-7 text-slate-400 dark:text-slate-500" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</p>
      {description && (
        <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
