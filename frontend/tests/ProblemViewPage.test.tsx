import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import * as problemsApi from '../src/api/problems'
import * as useAuthModule from '../src/hooks/useAuth'
import ProblemViewPage from '../src/pages/ProblemViewPage'

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
        <Route path="/problems/:problemId" element={<ProblemViewPage />} />
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
    title: 'Two Sum',
    description: 'Find two numbers that add up to target',
    input_format: 'Integer array and target sum',
    output_format: 'Indices of the two numbers',
    sample_input: '[2, 7, 11, 15], target = 9',
    sample_output: '[0, 1]',
    difficulty: 'easy',
    time_limit: 1000,
    memory_limit: 256,
    allowed_langs: ['python3', 'cpp17'],
    created_by: null,
    created_at: '2026-05-31T00:00:00Z',
  })
})

describe('ProblemViewPage', () => {
  test('renders problem title and metadata', async () => {
    renderPage('p1')

    await waitFor(() => {
      expect(screen.getByText('Two Sum')).toBeInTheDocument()
      expect(screen.getByText('easy')).toBeInTheDocument()
    })
  })

  test('displays time and memory limits', async () => {
    renderPage('p1')

    await waitFor(() => {
      expect(screen.getByText(/Time limit: 1000 ms/)).toBeInTheDocument()
      expect(screen.getByText(/Memory: 256 MB/)).toBeInTheDocument()
    })
  })

  test('shows allowed languages', async () => {
    renderPage('p1')

    await waitFor(() => {
      expect(screen.getByText(/Languages: python3, cpp17/)).toBeInTheDocument()
    })
  })

  test('displays description', async () => {
    renderPage('p1')

    await waitFor(() => {
      expect(screen.getByText('Find two numbers that add up to target')).toBeInTheDocument()
    })
  })

  test('displays input and output formats', async () => {
    renderPage('p1')

    await waitFor(() => {
      expect(screen.getByText('Integer array and target sum')).toBeInTheDocument()
      expect(screen.getByText('Indices of the two numbers')).toBeInTheDocument()
    })
  })

  test('displays sample input and output in code blocks', async () => {
    renderPage('p1')

    await waitFor(() => {
      expect(screen.getByText('[2, 7, 11, 15], target = 9')).toBeInTheDocument()
      expect(screen.getByText('[0, 1]')).toBeInTheDocument()
    })
  })

  test('shows back link to problems', async () => {
    renderPage('p1')

    await waitFor(() => {
      expect(screen.getByText('← Back to problems')).toBeInTheDocument()
    })
  })

  test('displays loading state', () => {
    vi.spyOn(problemsApi, 'apiGetProblem').mockImplementation(() => new Promise(() => {}))
    renderPage('p1')

    expect(screen.getByText(/Loading/i)).toBeInTheDocument()
  })

  test('displays error message on fetch failure', async () => {
    vi.spyOn(problemsApi, 'apiGetProblem').mockRejectedValue(new Error('Network error'))
    renderPage('p1')

    await waitFor(() => {
      expect(screen.getByText(/Error:/i)).toBeInTheDocument()
    })
  })
})
