import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, beforeEach } from 'vitest'
import Login from '../src/pages/Login'
import { AuthProvider } from '../src/contexts/AuthContext'
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
