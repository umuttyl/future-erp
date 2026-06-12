/** Shared form / button tokens — Fusion theme (Aurora light + Obsidian dark via CSS vars). */

export const inputFieldClass =
  'w-full rounded-xl border border-ui-border bg-ui-surface px-3.5 py-2.5 text-sm text-ui-text outline-none ' +
  'placeholder:text-ui-muted ' +
  'focus:border-ui-accent/60 focus:ring-2 focus:ring-ui-accent/15 ' +
  'transition duration-150 '

export const selectFieldClass = inputFieldClass

export const textareaFieldClass =
  'w-full rounded-xl border border-ui-border bg-ui-surface px-3.5 py-2.5 text-sm text-ui-text outline-none ' +
  'placeholder:text-ui-muted resize-none ' +
  'focus:border-ui-accent/60 focus:ring-2 focus:ring-ui-accent/15 ' +
  'transition duration-150 '

export const primaryButtonClass =
  'rounded-full bg-ui-accent px-4 py-2 text-sm font-semibold text-white ' +
  'shadow-btn-primary ' +
  'transition-all duration-200 ' +
  'hover:shadow-btn-primary-hover hover:opacity-[0.90] ' +
  'active:scale-[0.98] ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none'

export const secondaryButtonClass =
  'rounded-full border border-ui-border bg-ui-surface px-4 py-2 text-sm font-medium text-ui-text ' +
  'transition-all duration-150 ' +
  'hover:bg-ui-surface-2 ' +
  'active:scale-[0.98] '

export const ghostButtonClass =
  'rounded-lg border border-ui-border px-3 py-1.5 text-sm font-medium text-ui-muted ' +
  'transition-all duration-150 ' +
  'hover:bg-ui-surface-2 hover:text-ui-text ' +
  'active:scale-[0.98] '

export const tableHeaderClass =
  'text-left text-[11px] font-semibold uppercase tracking-wider text-ui-muted'

export const tableCellClass = 'text-sm text-ui-text'

export const tableRowHoverClass =
  'border-t border-ui-border-sub transition-colors duration-100 hover:bg-ui-surface-2'
