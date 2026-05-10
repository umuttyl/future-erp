import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const TR_WEEKDAYS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz']

function startOfCalendarMonth(base: Date, monthOffset: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1)
  return d
}

function monthMatrix(view: Date): (number | null)[][] {
  const year = view.getFullYear()
  const month = view.getMonth()
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const startDow = (first.getDay() + 6) % 7 // Monday = 0
  const daysInMonth = last.getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  while (cells.length < 42) cells.push(null)
  const rows: (number | null)[][] = []
  for (let r = 0; r < cells.length; r += 7) rows.push(cells.slice(r, r + 7))
  return rows
}

const MOCK_UPCOMING = [
  { id: '1', title: 'Q2 bütçe onayı — Finans', when: '5 Mayıs, 10:00' },
  { id: '2', title: 'Tedarikçi ödemesi vadesi', when: '7 Mayıs' },
] as const

export function NavbarCalendarDropdown() {
  const today = useMemo(() => new Date(), [])
  const [monthOffset, setMonthOffset] = useState(0)
  const view = useMemo(() => startOfCalendarMonth(today, monthOffset), [today, monthOffset])
  const label = view.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
  const matrix = useMemo(() => monthMatrix(view), [view])
  const isToday = (day: number | null) =>
    day != null &&
    view.getFullYear() === today.getFullYear() &&
    view.getMonth() === today.getMonth() &&
    day === today.getDate()

  return (
    <div className="w-[min(100vw-2rem,320px)] overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xl dark:border-white/10 dark:bg-[#1a1628]">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-white/10">
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
          aria-label="Önceki ay"
          onClick={() => setMonthOffset((v) => v - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold capitalize text-slate-800 dark:text-slate-100">{label}</span>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
          aria-label="Sonraki ay"
          onClick={() => setMonthOffset((v) => v + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="px-3 pb-2 pt-1">
        <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {TR_WEEKDAYS.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="mt-0.5 grid gap-0.5">
          {matrix.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-0.5">
              {week.map((day, di) => (
                <div
                  key={di}
                  className={[
                    'flex h-8 items-center justify-center rounded-lg text-xs tabular-nums',
                    day == null ? 'pointer-events-none' : 'text-slate-700 dark:text-slate-200',
                    isToday(day)
                      ? 'bg-violet-600 font-semibold text-white shadow-sm'
                      : day != null
                        ? 'hover:bg-violet-50 dark:hover:bg-white/10'
                        : '',
                  ].join(' ')}
                >
                  {day == null ? '' : day}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-slate-100 bg-slate-50/80 px-3 py-3 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Yaklaşan görevler / ödemeler
        </div>
        <ul className="mt-2 space-y-2">
          {MOCK_UPCOMING.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-slate-200/80 bg-white px-2.5 py-2 text-xs dark:border-white/10 dark:bg-[#12101f]"
            >
              <span className="font-medium text-slate-800 dark:text-slate-100">{item.title}</span>
              <span className="shrink-0 text-[10px] text-slate-500 dark:text-slate-400">{item.when}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
