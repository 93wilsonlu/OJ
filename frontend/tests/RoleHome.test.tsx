import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, beforeEach } from 'vitest'
import RoleHome from '../src/pages/RoleHome'
import { AuthProvider } from '../src/contexts/AuthContext'
import * as authApi from '../src/api/auth'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

function setup(role: string) {
  localStorage.setItem('refresh_token', 'tok')
  vi.spyOn(authApi, 'apiRefresh').mockResolvedValue({ access_token: 'at' })
  vi.spyOn(authApi, 'apiMe').mockResolvedValue({
    user_id: '1', name: 'U', email: 'u@x.com', role: role as never,
  })

  render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RoleHome />} />
          <Route path="/login" element={<div>Login</div>} />
          <Route path="/dashboard" element={<div>Candidate Dashboard</div>} />
          <Route path="/interviewer" element={<div>Interviewer Dashboard</div>} />
          <Route path="/admin/users" element={<div>Admin Users</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('RoleHome redirect', () => {
  test('unauthenticated user is sent to /login', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<RoleHome />} />
            <Route path="/login" element={<div>Login</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(screen.getByText('Login')).toBeInTheDocument()
  })
})
