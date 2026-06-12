import type { Product } from './api'

/** Backend ile aynı: reorder_level yoksa veya 0 ise varsayılan kritik eşik. */
export const DEFAULT_STOCK_CRITICAL_FALLBACK = 50

export function effectiveStockCriticalThreshold(p: Product): number {
  return p.reorder_level > 0 ? p.reorder_level : DEFAULT_STOCK_CRITICAL_FALLBACK
}

/** Stok, kritik eşiğin altında veya eşit mi (backend auto-draft tetik koşulu). */
export function isProductStockCriticallyLow(p: Product): boolean {
  return p.stock_quantity <= effectiveStockCriticalThreshold(p)
}
