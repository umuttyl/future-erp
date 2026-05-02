import type { PropsWithChildren } from 'react'

import { Sidebar } from '../components/Sidebar'

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="h-full bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900">
      <div className="flex h-full">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-7xl px-6 py-6 pb-24">{children}</div>
        </main>
      </div>
    </div>
  )
}

