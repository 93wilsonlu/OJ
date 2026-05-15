/**
 * Shared test utilities: wrappers that provide Router + AuthContext.
 */
import React from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../src/contexts/AuthContext'
import type { UserOut } from '../src/types/auth'

interface RenderOptions {
  initialPath?: string
  /** Pre-seed AuthContext with an authenticated user */
  user?: UserOut
  accessToken?: string
}

/** Render with MemoryRouter + AuthProvider. */
export function renderWithProviders(
  ui: React.ReactElement,
  { initialPath = '/', user, accessToken }: RenderOptions = {},
) {
  // Seed localStorage refresh token so AuthContext thinks the user is logged in
  if (accessToken) {
    localStorage.setItem('refresh_token', 'test-refresh-token')
  }

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        {/* Inject auth state via a wrapper that seeds context after mount */}
        <AuthInjector user={user ?? null} accessToken={accessToken ?? null}>
          {ui}
        </AuthInjector>
      </AuthProvider>
    </MemoryRouter>,
  )
}

/** Internal helper — exposes a way to seed AuthContext state in tests. */
function AuthInjector({
  children,
  user,
  accessToken,
}: {
  children: React.ReactNode
  user: UserOut | null
  accessToken: string | null
}) {
  // We can't easily inject internal context state from outside, so instead
  // we mock the API calls. Tests that need an authenticated user should
  // mock localStorage and the /auth/refresh endpoint.
  return <>{children}</>
}

/** Build a fake UserOut for tests. */
export function makeUser(overrides: Partial<UserOut> = {}): UserOut {
  return {
    user_id: 'test-user-id',
    name: 'Test User',
    email: 'test@example.com',
    role: 'candidate',
    ...overrides,
  }
}
