import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, beforeEach } from 'vitest'
import Login from '../src/pages/Login'
import { AuthProvider, useAuthContext } from '../src/contexts/AuthContext'
import * as authApi from '../src/api/auth'

// ── helpers ────────────────────────────────────────────────────────────────────

function renderLogin(initialPath = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<div>Home</div>} />
          <Route path="/dashboard" element={<div>Dashboard</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function makeAccessToken(expSeconds: number) {
  const payload = btoa(JSON.stringify({ exp: expSeconds }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
  return `header.${payload}.signature`
}

function TokenProbe() {
  const { accessToken, user, setAuth, getAccessToken } = useAuthContext()
  const [result, setResult] = React.useState<string | null>(null)
  const baseUser = { user_id: '1', name: 'Alice', email: 'alice@example.com', role: 'candidate' as const }

  return (
    <div>
      <div>state-token:{accessToken ?? 'none'}</div>
      <div>state-user:{user?.email ?? 'none'}</div>
      <div>result-token:{result ?? 'unset'}</div>
      <button
        onClick={() => setAuth(
          baseUser,
          makeAccessToken(Math.floor(Date.now() / 1000) + 300),
          'refresh-token',
        )}
      >
        Seed fresh
      </button>
      <button
        onClick={() => setAuth(
          baseUser,
          makeAccessToken(Math.floor(Date.now() / 1000) - 30),
          'refresh-token',
        )}
      >
        Seed expired
      </button>
      <button onClick={async () => setResult(await getAccessToken())}>
        Get token
      </button>
    </div>
  )
}

function renderTokenProbe() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <TokenProbe />
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

// ── Login form rendering ────────────────────────────────────────────────────────

describe('Login page', () => {
  test('renders email and password fields with labels', () => {
    renderLogin()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  test('shows error message on bad credentials', async () => {
    vi.spyOn(authApi, 'apiLogin').mockRejectedValueOnce(new Error('Invalid credentials'))
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText('Email'), 'bad@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrongpassword')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/invalid email or password/i),
    )
  })

  test('calls apiLogin with entered credentials on submit', async () => {
    const mockLogin = vi.spyOn(authApi, 'apiLogin').mockResolvedValueOnce({
      access_token: 'tok',
      refresh_token: 'ref',
      user: { user_id: '1', name: 'Alice', email: 'alice@example.com', role: 'candidate' },
    })
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText('Email'), 'alice@example.com')
    await user.type(screen.getByLabelText('Password'), 'secret')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith('alice@example.com', 'secret'),
    )
  })

  test('password show/hide toggle changes input type', async () => {
    const user = userEvent.setup()
    renderLogin()
    const passwordInput = screen.getByLabelText('Password')
    expect(passwordInput).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: /show password/i }))
    expect(passwordInput).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: /hide password/i }))
    expect(passwordInput).toHaveAttribute('type', 'password')
  })

  test('redirects to / when user already has a token', async () => {
    localStorage.setItem('refresh_token', 'existing-refresh')
    vi.spyOn(authApi, 'apiRefresh').mockResolvedValueOnce({ access_token: 'valid-tok' })
    vi.spyOn(authApi, 'apiMe').mockResolvedValueOnce({
      user_id: '1', name: 'Alice', email: 'alice@example.com', role: 'candidate',
    })

    renderLogin()

    // After the AuthProvider recovers the session, Login should redirect away
    await waitFor(() =>
      expect(screen.queryByLabelText('Email')).not.toBeInTheDocument(),
    )
  })

  test('disables submit button while loading', async () => {
    // Never resolves — keeps the button in loading state
    vi.spyOn(authApi, 'apiLogin').mockImplementationOnce(() => new Promise(() => {}))
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText('Email'), 'a@b.com')
    await user.type(screen.getByLabelText('Password'), 'pass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled(),
    )
  })
})

describe('AuthProvider token refresh', () => {
  test('returns fresh access token without refreshing', async () => {
    const refreshSpy = vi.spyOn(authApi, 'apiRefresh')
    const user = userEvent.setup()
    renderTokenProbe()

    await user.click(screen.getByRole('button', { name: /seed fresh/i }))
    await user.click(screen.getByRole('button', { name: /get token/i }))

    await waitFor(() =>
      expect(screen.getByText(/^result-token:header\./)).toBeInTheDocument(),
    )
    expect(refreshSpy).not.toHaveBeenCalled()
  })

  test('refreshes expired access token before returning it', async () => {
    const refreshed = makeAccessToken(Math.floor(Date.now() / 1000) + 300)
    const refreshSpy = vi.spyOn(authApi, 'apiRefresh').mockResolvedValueOnce({
      access_token: refreshed,
    })
    const user = userEvent.setup()
    renderTokenProbe()

    await user.click(screen.getByRole('button', { name: /seed expired/i }))
    await user.click(screen.getByRole('button', { name: /get token/i }))

    await waitFor(() =>
      expect(screen.getByText(`result-token:${refreshed}`)).toBeInTheDocument(),
    )
    expect(refreshSpy).toHaveBeenCalledWith('refresh-token')
  })

  test('clears session when refresh fails', async () => {
    vi.spyOn(authApi, 'apiRefresh').mockRejectedValueOnce(new Error('Session expired'))
    const user = userEvent.setup()
    renderTokenProbe()

    await user.click(screen.getByRole('button', { name: /seed expired/i }))
    await user.click(screen.getByRole('button', { name: /get token/i }))

    await waitFor(() =>
      expect(screen.getByText('result-token:unset')).toBeInTheDocument(),
    )
    await waitFor(() =>
      expect(screen.getByText('state-token:none')).toBeInTheDocument(),
    )
    expect(localStorage.getItem('refresh_token')).toBeNull()
  })
})
