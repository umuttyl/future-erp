type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'ai'

type StatusBadgeProps = {
  variant: BadgeVariant
  label: string
  dot?: boolean
  size?: 'sm' | 'md'
}

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  success: 'bg-[#DCFCE7] text-[#16A34A]',
  warning: 'bg-[#FEF3C7] text-[#D97706]',
  danger:  'bg-[#FEE2E2] text-[#DC2626]',
  info:    'bg-[#EEF2FF] text-[#4F46E5]',
  neutral: 'bg-[#F3F4F6] text-[#6B7280]',
  ai:      'bg-[#EEF2FF] text-[#4F46E5]',
}

const DOT_CLASS: Record<BadgeVariant, string> = {
  success: 'bg-[#22C55E]',
  warning: 'bg-[#F59E0B]',
  danger:  'bg-[#EF4444]',
  info:    'bg-[#6366F1]',
  neutral: 'bg-[#9CA3AF]',
  ai:      'bg-[#6366F1]',
}

export function StatusBadge({ variant, label, dot = false, size = 'sm' }: StatusBadgeProps) {
  const sizeClass = size === 'md'
    ? 'px-2.5 py-1 text-xs font-semibold'
    : 'px-2 py-0.5 text-[11px] font-semibold'

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ${sizeClass} ${VARIANT_CLASS[variant]}`}>
      {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASS[variant]}`} />}
      {label}
    </span>
  )
}
