import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, beforeEach } from 'vitest'
import RoleHome from '../src/pages/RoleHome'
import { AuthProvider } from '../src/contexts/AuthContext'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

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
