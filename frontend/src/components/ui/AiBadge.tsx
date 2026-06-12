/**
 * Inline AI signal badges for customer and product lists.
 * Each badge is a small icon+label with a tooltip explaining the signal.
 * Only "noteworthy" items get badges — clean lists stay clean.
 */

type BadgeDef = {
  icon: string
  label: string
  tooltip: string
  className: string
}

const CUSTOMER_BADGE_MAP: Record<string, BadgeDef> = {
  vip: {
    icon: "💎",
    label: "VIP",
    tooltip: "Among the highest revenue-generating customers in the last 90 days",
    className:
      "bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-900/20 dark:border-violet-500/30 dark:text-violet-300",
  },
  silent_30: {
    icon: "🟡",
    label: "Silent 30d",
    tooltip: "No sales record in the last 30 days — follow-up recommended",
    className:
      "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-500/30 dark:text-amber-300",
  },
  payment_pending: {
    icon: "🔴",
    label: "Payment due",
    tooltip: "Outstanding balance on account",
    className:
      "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-900/20 dark:border-rose-500/30 dark:text-rose-300",
  },
}

const PRODUCT_BADGE_MAP: Record<string, BadgeDef> = {
  critical: {
    icon: "🔴",
    label: "Critical stock",
    tooltip: "Stock at or below reorder threshold",
    className:
      "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-900/20 dark:border-rose-500/30 dark:text-rose-300",
  },
  declining: {
    icon: "🟡",
    label: "Stock declining",
    tooltip: "Stock approaching the reorder threshold",
    className:
      "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-500/30 dark:text-amber-300",
  },
  fast_mover: {
    icon: "🔥",
    label: "Fast mover",
    tooltip: "Among the best-selling products in the last 30 days",
    className:
      "bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-900/20 dark:border-orange-500/30 dark:text-orange-300",
  },
}

function Badge({ def }: { def: BadgeDef }) {
  return (
    <span
      title={def.tooltip}
      className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${def.className}`}
    >
      <span aria-hidden>{def.icon}</span>
      {def.label}
    </span>
  )
}

export function CustomerAiBadges({ signals }: { signals: string[] }) {
  if (!signals.length) return null
  return (
    <span className="ml-1.5 inline-flex flex-wrap gap-1">
      {signals.map((s) => {
        const def = CUSTOMER_BADGE_MAP[s]
        return def ? <Badge key={s} def={def} /> : null
      })}
    </span>
  )
}

export function ProductAiBadges({ signals }: { signals: string[] }) {
  if (!signals.length) return null
  return (
    <span className="ml-1.5 inline-flex flex-wrap gap-1">
      {signals.map((s) => {
        const def = PRODUCT_BADGE_MAP[s]
        return def ? <Badge key={s} def={def} /> : null
      })}
    </span>
  )
}
