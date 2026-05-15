import type { LoginResponse, RefreshResponse, UserOut } from '../types/auth'

const BASE = '/api/v1'

export async function apiLogin(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error('Invalid credentials')
  return res.json()
}

export async function apiRefresh(refreshToken: string): Promise<RefreshResponse> {
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  if (!res.ok) throw new Error('Session expired')
  return res.json()
}

export async function apiLogout(refreshToken: string): Promise<void> {
  await fetch(`${BASE}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
}

export async function apiMe(accessToken: string): Promise<UserOut> {
  const res = await fetch(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Unauthorized')
  return res.json()
}
