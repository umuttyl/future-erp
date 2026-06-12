/**
 * Access token lives only in memory (not localStorage/sessionStorage).
 * XSS scripts can't steal it through storage APIs.
 *
 * On every page load the token is null; AuthContext calls /auth/refresh
 * (HttpOnly cookie sent automatically) to rehydrate silently.
 */

let _accessToken: string | null = null

export function getAccessToken(): string | null {
  return _accessToken
}

/** Kept for API compatibility — refresh token is in an HttpOnly cookie managed by the server. */
export function getRefreshToken(): string | null {
  return null
}

export function saveTokens(access: string, _refresh: string): void {
  _accessToken = access
}

export function clearSession(): void {
  _accessToken = null
}

// One-time migration: purge the legacy localStorage key so old browsers don't
// accumulate a stale plaintext token indefinitely.
;(function purgeLegacy() {
  try {
    localStorage.removeItem('future_erp_access_token')
  } catch {
    /* storage unavailable — ignore */
  }
})()
