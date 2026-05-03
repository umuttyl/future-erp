import { getAccessToken } from './authSession'

export type WsAiNotificationPayload = {
  type: string
  message: string
  /** Geriye dönük; tercihen action_label kullanın. */
  action?: string
  action_label?: string
  /** Örn. `/api/inventory/42/auto-draft` */
  action_endpoint?: string
  action_type?: string
  product_id?: number
  product_sku?: string
}

export function resolveWsNotificationProductId(p: WsAiNotificationPayload): number | null {
  if (typeof p.product_id === 'number' && Number.isFinite(p.product_id) && p.product_id > 0) {
    return Math.floor(p.product_id)
  }
  const ep = (p.action_endpoint ?? '').trim()
  const m = ep.match(/\/(?:api\/)?inventory\/(\d+)\/auto-draft\/?$/i)
  if (m) {
    const n = Number(m[1])
    return Number.isFinite(n) && n > 0 ? n : null
  }
  return null
}

export function wsNotificationActionLabel(p: WsAiNotificationPayload): string | null {
  const raw = (p.action_label ?? p.action ?? '').trim()
  return raw || null
}

/** Tarayıcı host + Vite /api proxy ile backend WebSocket URL (access_token sorgu). */
export function getNotificationWebSocketUrl(): string | null {
  const token = getAccessToken()
  if (!token) return null
  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  return `${wsProto}//${host}/api/ws/notifications?access_token=${encodeURIComponent(token)}`
}
