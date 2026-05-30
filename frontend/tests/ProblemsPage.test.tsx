import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import * as problemsApi from '../src/api/problems'
import * as useAuthModule from '../src/hooks/useAuth'
import ProblemsPage from '../src/pages/ProblemsPage'

const mockAuth = (role = 'problem_admin') => {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    user: { user_id: 'user-1', name: 'User', email: 'user@example.com', role },
    accessToken: 'token',
    login: vi.fn(),
    logout: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue('token'),
  })
}

const renderPage = () => {
  return render(
    <MemoryRouter initialEntries={['/problems']}>
      <Routes>
        <Route path="/problems" element={<ProblemsPage />} />
        <Route path="/problems/new" element={<div>New Problem</div>} />
        <Route path="/problems/:problemId" element={<div>Problem Detail</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  mockAuth()
  vi.spyOn(problemsApi, 'apiListProblems').mockResolvedValue([
    {
      problem_id: 'p1',
      title: 'Array Sum',
      difficulty: 'easy',
      description: 'Sum an array',
      time_limit: 1000,
      memory_limit: 256,
      allowed_langs: ['python3'],
    },
    {
      problem_id: 'p2',
      title: 'Graph Traversal',
      difficulty: 'hard',
      description: 'Traverse a graph',
      time_limit: 2000,
      memory_limit: 512,
      allowed_langs: ['cpp17'],
    },
  ])
})

describe('ProblemsPage', () => {
  test('renders problems table with list', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Array Sum')).toBeInTheDocument()
      expect(screen.getByText('Graph Traversal')).toBeInTheDocument()
    })
  })

  test('shows New Problem button for problem_admin', async () => {
    mockAuth('problem_admin')
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /New Problem/i })).toBeInTheDocument()
    })
  })

  test('shows New Problem button for admin', async () => {
    mockAuth('admin')
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /New Problem/i })).toBeInTheDocument()
    })
  })

  test('does not show New Problem button for candidate', async () => {
    mockAuth('candidate')
    renderPage()

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /New Problem/i })).not.toBeInTheDocument()
    })
  })

  test('navigates to new problem page', async () => {
    const user = userEvent.setup()
    mockAuth('admin')
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /New Problem/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /New Problem/i }))
    expect(await screen.findByText('New Problem')).toBeInTheDocument()
  })

  test('shows difficulty badges', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('easy')).toBeInTheDocument()
      expect(screen.getByText('hard')).toBeInTheDocument()
    })
  })

  test('displays error when list fails', async () => {
    vi.spyOn(problemsApi, 'apiListProblems').mockRejectedValue(new Error('API failed'))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/Error:/i)).toBeInTheDocument()
    })
  })
})
