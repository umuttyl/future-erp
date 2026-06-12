import type { ReactNode } from 'react'
import { Breadcrumb } from './Breadcrumb'

type PageLayoutProps = {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}

export function PageLayout({ title, subtitle, actions, children }: PageLayoutProps) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Breadcrumb />
          <h1 className="text-2xl font-bold tracking-tight text-ui-text">{title}</h1>
          {subtitle ? (
            <p className="mt-1 max-w-3xl text-sm text-ui-muted">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  )
}
