import { ChevronLeft, ChevronRight } from 'lucide-react'

type Props = {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}

export function Pagination({ page, pageSize, total, onChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null

  const pages: (number | '…')[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (page > 3) pages.push('…')
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i)
    if (page < totalPages - 2) pages.push('…')
    pages.push(totalPages)
  }

  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-1 pt-3 dark:border-white/5">
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {total} kayıt · Sayfa {page} / {totalPages}
      </span>
      <div className="flex items-center gap-1">
        <NavBtn disabled={page === 1} onClick={() => onChange(page - 1)} aria-label="Önceki sayfa">
          <ChevronLeft className="h-4 w-4" />
        </NavBtn>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="px-1 text-xs text-slate-400">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p as number)}
              className={[
                'flex h-7 w-7 items-center justify-center rounded-lg text-xs font-medium transition',
                p === page
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10',
              ].join(' ')}
            >
              {p}
            </button>
          )
        )}
        <NavBtn disabled={page === totalPages} onClick={() => onChange(page + 1)} aria-label="Sonraki sayfa">
          <ChevronRight className="h-4 w-4" />
        </NavBtn>
      </div>
    </div>
  )
}

function NavBtn({
  disabled,
  onClick,
  children,
  'aria-label': ariaLabel,
}: {
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
  'aria-label': string
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-white/10"
    >
      {children}
    </button>
  )
}
