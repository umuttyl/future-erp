import type { PropsWithChildren } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { api, getApiErrorMessage, setActiveLocale, type AuthMe, type SignupOut, type TokenPairOut } from '../lib/api'
import { setAppLanguage } from '../i18n'
import { clearSession, getAccessToken, saveTokens } from '../lib/authSession'

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
    setActiveLocale(data.currency, data.language)
    setAppLanguage(data.language)
    setUser(data)
  }, [])

  useEffect(() => {
    let cancelled = false
    // Access token lives in memory — it's null on every page load.
    // Attempt a silent refresh using the HttpOnly cookie; if it succeeds we
    // get a fresh access token and can fetch the current user without any
    // login prompt.
    ;(async () => {
      try {
        const { data } = await api.post<TokenPairOut>('/auth/refresh', null, { skipAuth: true })
        saveTokens(data.access_token, data.refresh_token)
        const me = await api.get<AuthMe>('/auth/me')
        setActiveLocale(me.data.currency, me.data.language)
        setAppLanguage(me.data.language)
        if (!cancelled) setUser(me.data)
      } catch {
        // No valid refresh cookie → not logged in, which is fine.
        clearSession()
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const performLogin = useCallback(
    async (input: { tenant_slug: string; email: string; password: string }) => {
      const { data } = await api.post<TokenPairOut>('/auth/login', input, { skipAuth: true })
      saveTokens(data.access_token, data.refresh_token)
      const me = await api.get<AuthMe>('/auth/me')
      setActiveLocale(me.data.currency, me.data.language)
      setAppLanguage(me.data.language)
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
        setError(getApiErrorMessage(e, 'Login failed.'))
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
      setActiveLocale(me.data.currency, me.data.language)
      setAppLanguage(me.data.language)
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
        setError(getApiErrorMessage(e, 'Registration failed.'))
        throw e
      }
    },
    [performSignup],
  )

  const logout = useCallback(async () => {
    try {
      // The HttpOnly refresh cookie is sent automatically (withCredentials: true).
      await api.post('/auth/logout', null, { skipAuth: true })
    } catch {
      // Even if the server call fails, clear the local session.
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
  if (!ctx) throw new Error('useAuth must be used within AuthProvider.')
  return ctx
}
