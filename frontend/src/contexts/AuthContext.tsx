import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { apiLogout, apiMe, apiRefresh } from '../api/auth'
import type { UserOut } from '../types/auth'

interface AuthState {
  user: UserOut | null
  accessToken: string | null
  /** true while the initial refresh-token recovery is in flight */
  loading: boolean
}

interface AuthContextValue extends AuthState {
  setAuth: (user: UserOut, accessToken: string, refreshToken: string) => void
  clearAuth: () => void
  getAccessToken: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)
const TOKEN_REFRESH_SKEW_SECONDS = 30

function getJwtExpSeconds(token: string): number | null {
  const payload = token.split('.')[1]
  if (!payload) return null

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '=',
    )
    const decoded = JSON.parse(atob(padded)) as { exp?: unknown }
    return typeof decoded.exp === 'number' ? decoded.exp : null
  } catch {
    return null
  }
}

function isAccessTokenFresh(token: string): boolean {
  const exp = getJwtExpSeconds(token)
  if (exp === null) return true
  return exp > Date.now() / 1000 + TOKEN_REFRESH_SKEW_SECONDS
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, accessToken: null, loading: true })

  // On mount: try to recover session from stored refresh token
  useEffect(() => {
    const stored = localStorage.getItem('refresh_token')
    if (!stored) {
      setState((s) => ({ ...s, loading: false }))
      return
    }
    apiRefresh(stored)
      .then((r) =>
        apiMe(r.access_token).then((user) =>
          setState({ user, accessToken: r.access_token, loading: false })
        )
      )
      .catch(() => {
        localStorage.removeItem('refresh_token')
        setState({ user: null, accessToken: null, loading: false })
      })
  }, [])

  const setAuth = useCallback((user: UserOut, accessToken: string, refreshToken: string) => {
    // Refresh token in localStorage is an intentional trade-off: httpOnly cookies
    // would be safer against XSS but require server-side cookie handling across the
    // nginx boundary. Acceptable for this single-machine deployment.
    localStorage.setItem('refresh_token', refreshToken)
    setState({ user, accessToken, loading: false })
  }, [])

  const clearAuth = useCallback(async () => {
    const stored = localStorage.getItem('refresh_token')
    if (stored) {
      localStorage.removeItem('refresh_token')
      await apiLogout(stored)
    }
    setState({ user: null, accessToken: null, loading: false })
  }, [])

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (state.accessToken && isAccessTokenFresh(state.accessToken)) {
      return state.accessToken
    }

    const stored = localStorage.getItem('refresh_token')
    if (!stored) return null
    try {
      const r = await apiRefresh(stored)
      setState((s) => ({ ...s, accessToken: r.access_token }))
      return r.access_token
    } catch {
      localStorage.removeItem('refresh_token')
      setState({ user: null, accessToken: null, loading: false })
      return null
    }
  }, [state.accessToken])

  return (
    <AuthContext.Provider value={{ ...state, setAuth, clearAuth, getAccessToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used inside AuthProvider')
  return ctx
}
