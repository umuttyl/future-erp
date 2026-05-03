import type { PropsWithChildren } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { api, getApiErrorMessage, type AuthMe, type SignupOut, type TokenPairOut } from '../lib/api'
import { clearSession, getAccessToken, getRefreshToken, saveTokens } from '../lib/authSession'

type AuthContextValue = {
  user: AuthMe | null
  loading: boolean
  error: string | null
  login: (input: {
    tenant_slug: string
    email: string
    password: string
  }) => Promise<void>
  signup: (input: {
    organization_name: string
    email: string
    password: string
    full_name: string
    department?: string
  }) => Promise<string>
  logout: () => Promise<void>
  refreshMe: () => Promise<void>
  hasPermission: (perm: string) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthMe | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshMe = useCallback(async () => {
    if (!getAccessToken()) {
      setUser(null)
      return
    }
    const { data } = await api.get<AuthMe>('/auth/me')
    setUser(data)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!getAccessToken()) {
        if (!cancelled) setLoading(false)
        return
      }
      try {
        await refreshMe()
      } catch {
        clearSession()
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshMe])

  const performLogin = useCallback(
    async (input: { tenant_slug: string; email: string; password: string }) => {
      const { data } = await api.post<TokenPairOut>('/auth/login', input, { skipAuth: true })
      saveTokens(data.access_token, data.refresh_token)
      const me = await api.get<AuthMe>('/auth/me')
      setUser(me.data)
    },
    [],
  )

  const login = useCallback(
    async (input: { tenant_slug: string; email: string; password: string }) => {
      try {
        setError(null)
        await performLogin(input)
      } catch (e) {
        setError(getApiErrorMessage(e, 'Giriş başarısız.'))
        throw e
      }
    },
    [performLogin],
  )

  const performSignup = useCallback(
    async (input: {
      organization_name: string
      email: string
      password: string
      full_name: string
      department?: string
    }) => {
      const { data } = await api.post<SignupOut>('/auth/signup', input, { skipAuth: true })
      saveTokens(data.access_token, data.refresh_token)
      const me = await api.get<AuthMe>('/auth/me')
      setUser(me.data)
      return data.tenant_slug
    },
    [],
  )

  const signup = useCallback(
    async (input: {
      organization_name: string
      email: string
      password: string
      full_name: string
      department?: string
    }) => {
      try {
        setError(null)
        return await performSignup(input)
      } catch (e) {
        setError(getApiErrorMessage(e, 'Kayıt başarısız.'))
        throw e
      }
    },
    [performSignup],
  )

  const logout = useCallback(async () => {
    const rt = getRefreshToken()
    try {
      if (rt) {
        await api.post('/auth/logout', { refresh_token: rt }, { skipAuth: true })
      }
    } catch {
      // Sunucu hatası olsa bile oturumu yerelde kapat.
    } finally {
      clearSession()
      setUser(null)
    }
  }, [])

  const hasPermission = useCallback(
    (perm: string) => {
      return user?.permissions?.includes(perm) ?? false
    },
    [user],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      error,
      login,
      signup,
      logout,
      refreshMe,
      hasPermission,
    }),
    [user, loading, error, login, signup, logout, refreshMe, hasPermission],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth AuthProvider dışında kullanılamaz.')
  return ctx
}
