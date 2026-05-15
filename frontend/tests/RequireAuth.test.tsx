import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, beforeEach } from 'vitest'
import RequireAuth from '../src/components/RequireAuth'
import { AuthProvider } from '../src/contexts/AuthContext'
import * as authApi from '../src/api/auth'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

function renderWithGuard(
  roles?: ('admin' | 'interviewer' | 'problem_admin' | 'candidate')[],
  initialPath = '/protected',
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route path="/403" element={<div>Forbidden</div>} />
          <Route
            path="/protected"
            element={
              <RequireAuth roles={roles}>
                <div>Protected Content</div>
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('RequireAuth', () => {
  test('redirects unauthenticated user to /login', async () => {
    renderWithGuard()
    await waitFor(() =>
      expect(screen.getByText('Login Page')).toBeInTheDocument(),
    )
  })

  test('renders protected content for authenticated user with correct role', async () => {
    localStorage.setItem('refresh_token', 'tok')
    vi.spyOn(authApi, 'apiRefresh').mockResolvedValueOnce({ access_token: 'access-tok' })
    vi.spyOn(authApi, 'apiMe').mockResolvedValueOnce({
      user_id: '1', name: 'Alice', email: 'a@b.com', role: 'candidate',
    })

    renderWithGuard(['candidate'])

    await waitFor(() =>
      expect(screen.getByText('Protected Content')).toBeInTheDocument(),
    )
  })

  test('shows protected content (no role filter) after token recovery', async () => {
    localStorage.setItem('refresh_token', 'tok')
    vi.spyOn(authApi, 'apiRefresh').mockResolvedValueOnce({ access_token: 'access-tok' })
    vi.spyOn(authApi, 'apiMe').mockResolvedValueOnce({
      user_id: '1', name: 'Alice', email: 'a@b.com', role: 'candidate',
    })

    renderWithGuard(undefined)

    // Loading state holds redirect; once token is recovered, content appears
    await waitFor(() =>
      expect(screen.getByText('Protected Content')).toBeInTheDocument(),
    )
  })
})
