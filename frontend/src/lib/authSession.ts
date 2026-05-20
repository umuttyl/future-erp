const ACCESS = 'future_erp_access_token'

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS)
}

// Refresh token is now stored in an HttpOnly cookie set by the server.
// This function is kept for backward compatibility but always returns null.
export function getRefreshToken(): string | null {
  return null
}

export function saveTokens(access: string, _refresh: string): void {
  localStorage.setItem(ACCESS, access)
  // refresh token is managed as an HttpOnly cookie by the server
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS)
}
