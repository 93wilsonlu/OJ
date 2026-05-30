import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import * as problemsApi from '../src/api/problems'
import * as useAuthModule from '../src/hooks/useAuth'
import ProblemDetailPage from '../src/pages/ProblemDetailPage'

const mockAuth = () => {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    user: { user_id: 'user-1', name: 'User', email: 'user@example.com', role: 'candidate' },
    accessToken: 'token',
    login: vi.fn(),
    logout: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue('token'),
  })
}

const renderPage = (problemId = 'p1') => {
  return render(
    <MemoryRouter initialEntries={[`/problems/${problemId}`]}>
      <Routes>
        <Route path="/problems/:problemId" element={<ProblemDetailPage />} />
        <Route path="/problems" element={<div>Problems List</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  mockAuth()
  vi.spyOn(problemsApi, 'apiGetProblem').mockResolvedValue({
    problem_id: 'p1',
    title: 'Array Sum',
    description: 'Find the sum of all elements',
    input_format: 'Array of integers',
    output_format: 'Single integer',
    sample_input: '1 2 3',
    sample_output: '6',
    difficulty: 'easy',
    time_limit: 1000,
    memory_limit: 256,
    allowed_langs: ['python3', 'cpp17'],
    created_by: null,
    created_at: '2026-05-31T00:00:00Z',
  })
  vi.spyOn(problemsApi, 'apiListTestCases').mockResolvedValue([])
})

describe('ProblemDetailPage', () => {
  test('loads and renders problem title', async () => {
    renderPage('p1')

    await waitFor(() => {
      expect(screen.getByText('Array Sum')).toBeInTheDocument()
    })
  })

  test('displays loading state initially', () => {
    vi.spyOn(problemsApi, 'apiGetProblem').mockImplementation(() => new Promise(() => {}))
    renderPage('p1')

    expect(screen.getByText(/Loading/i)).toBeInTheDocument()
  })

  test('displays error on api failure', async () => {
    vi.spyOn(problemsApi, 'apiGetProblem').mockRejectedValue(new Error('Network error'))
    renderPage('p1')

    await waitFor(() => {
      expect(screen.getByText(/Error:/)).toBeInTheDocument()
    })
  })

  test('fetches problem data on mount', async () => {
    const apiGetProblem = vi.spyOn(problemsApi, 'apiGetProblem')
    renderPage('p1')

    await waitFor(() => {
      expect(apiGetProblem).toHaveBeenCalledWith('token', 'p1')
    })
  })
})
