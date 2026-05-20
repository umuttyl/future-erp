const pulse = 'animate-pulse rounded bg-slate-200 dark:bg-white/10'

export function SkeletonLine({ className = '' }: { className?: string }) {
  return <div className={`${pulse} h-4 ${className}`} />
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 dark:border-white/10 dark:bg-[#16122b]">
      <div className={`${pulse} mb-4 h-5 w-40`} />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className={`${pulse} h-4 w-full`} style={{ opacity: 1 - i * 0.15 }} />
        ))}
      </div>
    </div>
  )
}

export function SkeletonTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white dark:border-white/10 dark:bg-[#16122b]">
      <div className="border-b border-slate-100 p-5 dark:border-white/5">
        <div className={`${pulse} h-5 w-32`} />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-white/10">
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-4 py-3">
                <div className={`${pulse} h-3 w-20`} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-b border-slate-100 dark:border-white/5">
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c} className="px-4 py-3">
                  <div className={`${pulse} h-4`} style={{ width: `${55 + ((r * cols + c) * 17) % 35}%` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function SkeletonKpiGrid({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-${count}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200/90 bg-white p-5 dark:border-white/10 dark:bg-[#16122b]">
          <div className={`${pulse} mb-3 h-3 w-24`} />
          <div className={`${pulse} h-8 w-32`} />
        </div>
      ))}
    </div>
  )
}
