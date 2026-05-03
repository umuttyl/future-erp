const ACCESS = 'future_erp_access_token'
const REFRESH = 'future_erp_refresh_token'

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH)
}

export function saveTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS, access)
  localStorage.setItem(REFRESH, refresh)
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS)
  localStorage.removeItem(REFRESH)
}
