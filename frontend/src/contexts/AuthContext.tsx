import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { apiLogout, apiRefresh } from '../api/auth'
import type { UserOut } from '../types/auth'

interface AuthState {
  user: UserOut | null
  accessToken: string | null
}

interface AuthContextValue extends AuthState {
  setAuth: (user: UserOut, accessToken: string, refreshToken: string) => void
  clearAuth: () => void
  getAccessToken: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, accessToken: null })

  // On mount: try to recover session from stored refresh token
  useEffect(() => {
    const stored = localStorage.getItem('refresh_token')
    if (!stored) return
    apiRefresh(stored)
      .then((r) => {
        // We have a new access token but need the user info from it
        // The access token payload contains role; fetch /auth/me on first protected request
        setState((s) => ({ ...s, accessToken: r.access_token }))
      })
      .catch(() => localStorage.removeItem('refresh_token'))
  }, [])

  const setAuth = useCallback((user: UserOut, accessToken: string, refreshToken: string) => {
    localStorage.setItem('refresh_token', refreshToken)
    setState({ user, accessToken })
  }, [])

  const clearAuth = useCallback(async () => {
    const stored = localStorage.getItem('refresh_token')
    if (stored) {
      localStorage.removeItem('refresh_token')
      await apiLogout(stored)
    }
    setState({ user: null, accessToken: null })
  }, [])

  // Returns a valid access token, silently refreshing if needed
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (state.accessToken) return state.accessToken
    const stored = localStorage.getItem('refresh_token')
    if (!stored) return null
    try {
      const r = await apiRefresh(stored)
      setState((s) => ({ ...s, accessToken: r.access_token }))
      return r.access_token
    } catch {
      localStorage.removeItem('refresh_token')
      setState({ user: null, accessToken: null })
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
