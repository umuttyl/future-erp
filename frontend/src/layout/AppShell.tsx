import { Outlet } from 'react-router-dom'

import { AppSidebar } from '../components/layout/AppSidebar'
import { AppTopbar } from '../components/layout/AppTopbar'

export function AppShell() {
  return (
    <div className="flex h-full min-h-0 bg-surface-bg text-slate-900 dark:bg-[#0b0819] dark:text-slate-100">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar />
        <main className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-[1600px] px-4 py-6 pb-28 md:px-8 lg:px-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
