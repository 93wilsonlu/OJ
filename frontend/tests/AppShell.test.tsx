import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { vi, beforeEach } from 'vitest'
import AppShell from '../src/components/AppShell'
import * as useAuthModule from '../src/hooks/useAuth'
import { setActiveExamLock } from '../src/utils/activeExamLock'

const mockLogout = vi.fn()

function mockUser(role: 'admin' | 'interviewer' | 'problem_admin' | 'candidate', name = 'Test User') {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    user: { user_id: '1', name, email: 'test@example.com', role },
    accessToken: 'tok',
    login: vi.fn(),
    logout: mockLogout,
    getAccessToken: vi.fn(),
  })
}

function renderShell() {
  return render(
    <MemoryRouter>
      <AppShell>
        <div>Page content</div>
      </AppShell>
    </MemoryRouter>,
  )
}

function CurrentPath() {
  const location = useLocation()
  return <div>{location.pathname}</div>
}

beforeEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
  mockLogout.mockResolvedValue(undefined)
})

// ── nav links per role ────────────────────────────────────────────────────────

describe('AppShell nav links', () => {
  test('admin sees Users and Problems links', () => {
    mockUser('admin')
    renderShell()
    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Problems' })).toBeInTheDocument()
  })

  test('problem_admin sees only Problems link', () => {
    mockUser('problem_admin')
    renderShell()
    expect(screen.getByRole('link', { name: 'Problems' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()
  })

  test('candidate sees My Exams link', () => {
    mockUser('candidate')
    renderShell()
    expect(screen.getByRole('link', { name: 'My Exams' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()
  })

  test('candidate exam lock disables global navigation and redirects back to the exam workspace', async () => {
    mockUser('candidate')
    setActiveExamLock({
      examId: 'exam-1',
      path: '/exams/exam-1/problems/problem-1',
    })

    render(
      <MemoryRouter initialEntries={['/exams']}>
        <AppShell>
          <CurrentPath />
        </AppShell>
      </MemoryRouter>,
    )

    expect(screen.queryByRole('link', { name: 'My Exams' })).not.toBeInTheDocument()
    expect(screen.getByText('My Exams')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: /log out/i })).toBeDisabled()
    await waitFor(() => {
      expect(screen.getByText('/exams/exam-1/problems/problem-1')).toBeInTheDocument()
    })
  })

  test('candidate exam lock allows exam-scoped submissions without enabling global navigation', async () => {
    mockUser('candidate')
    setActiveExamLock({
      examId: 'exam-1',
      path: '/exams/exam-1/problems/problem-1',
    })

    render(
      <MemoryRouter initialEntries={['/exams/exam-1/submissions']}>
        <AppShell>
          <CurrentPath />
        </AppShell>
      </MemoryRouter>,
    )

    expect(screen.queryByRole('link', { name: 'Submissions' })).not.toBeInTheDocument()
    expect(screen.getByText('Submissions')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('/exams/exam-1/submissions')).toBeInTheDocument()
  })

  test('interviewer sees Exams link', () => {
    mockUser('interviewer')
    renderShell()
    expect(screen.getByRole('link', { name: 'Exams' })).toBeInTheDocument()
  })
})

// ── user info + role badge ────────────────────────────────────────────────────

describe('AppShell user display', () => {
  test('shows user name', () => {
    mockUser('admin', 'Alice Admin')
    renderShell()
    expect(screen.getByText('Alice Admin')).toBeInTheDocument()
  })

  test('shows correct role label for problem_admin', () => {
    mockUser('problem_admin')
    renderShell()
    expect(screen.getByLabelText('Role: Prob. Admin')).toBeInTheDocument()
  })
})

// ── logout ────────────────────────────────────────────────────────────────────

describe('AppShell logout', () => {
  test('logout button calls logout()', async () => {
    mockUser('candidate')
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: /log out/i }))
    await waitFor(() => expect(mockLogout).toHaveBeenCalledOnce())
  })

  test('logout button is disabled while logging out', async () => {
    mockUser('candidate')
    // Never resolves — keeps the button in loading state
    mockLogout.mockImplementation(() => new Promise(() => {}))

    renderShell()
    await userEvent.click(screen.getByRole('button', { name: /log out/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /logging out/i })).toBeDisabled(),
    )
  })
})

// ── content ───────────────────────────────────────────────────────────────────

test('renders page content below navbar', () => {
  mockUser('candidate')
  renderShell()
  expect(screen.getByText('Page content')).toBeInTheDocument()
})
