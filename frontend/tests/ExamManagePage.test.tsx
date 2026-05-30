import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import * as examsApi from '../src/api/exams'
import * as adminApi from '../src/api/admin'
import * as problemsApi from '../src/api/problems'
import * as useAuthModule from '../src/hooks/useAuth'
import ExamManagePage from '../src/pages/ExamManagePage'

const mockAuth = () => {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    user: { user_id: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'admin' },
    accessToken: 'token',
    login: vi.fn(),
    logout: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue('token'),
  })
}

const renderPage = (path = '/exams/new') => {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/exams/new" element={<ExamManagePage />} />
        <Route path="/exams/:examId/manage" element={<ExamManagePage />} />
        <Route path="/exams" element={<div>Exams list</div>} />
        <Route path="/interviewer" element={<div>Interviewer home</div>} />
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
      title: 'Problem 1',
      difficulty: 'easy',
      description: '',
      input_format: null,
      output_format: null,
      sample_input: null,
      sample_output: null,
      time_limit: 1000,
      memory_limit: 256,
      allowed_langs: ['python3'],
      created_by: null,
      created_at: '2026-05-31T00:00:00Z',
    },
  ])
  vi.spyOn(adminApi, 'apiListAdminUsers').mockResolvedValue({
    items: [
      { user_id: 'c1', name: 'Candidate 1', email: 'c1@example.com', role: 'candidate', is_active: true, created_at: '', updated_at: '' },
    ],
    total: 1,
    page: 1,
    page_size: 100,
    total_pages: 1,
  })
})

describe('ExamManagePage', () => {
  test('renders new exam form', async () => {
    renderPage('/exams/new')

    await waitFor(() => {
      expect(screen.getByText('New Exam')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Create exam' })).toBeInTheDocument()
  })

  test('displays exam details section', async () => {
    renderPage('/exams/new')

    await waitFor(() => {
      expect(screen.getByText(/Exam details/i)).toBeInTheDocument()
    })
  })

  test('loads existing exam for editing', async () => {
    vi.spyOn(examsApi, 'apiGetExam').mockResolvedValue({
      exam_id: 'exam123',
      title: 'Backend Interview',
      description: '',
      start_time: '2026-06-01T10:00:00Z',
      end_time: '2026-06-01T12:00:00Z',
      show_score: false,
      created_by: null,
      created_at: '2026-05-31T00:00:00Z',
    })
    vi.spyOn(examsApi, 'apiListAssignments').mockResolvedValue([])

    renderPage('/exams/exam123/manage')

    await waitFor(() => {
      expect(screen.getByText(/Edit:/)).toBeInTheDocument()
    })
  })

  test('shows delete button for existing exam', async () => {
    vi.spyOn(examsApi, 'apiGetExam').mockResolvedValue({
      exam_id: 'exam123',
      title: 'Exam',
      description: '',
      start_time: '2026-06-01T10:00:00Z',
      end_time: '2026-06-01T12:00:00Z',
      show_score: false,
      created_by: null,
      created_at: '2026-05-31T00:00:00Z',
    })
    vi.spyOn(examsApi, 'apiListAssignments').mockResolvedValue([])

    renderPage('/exams/exam123/manage')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete exam' })).toBeInTheDocument()
    })
  })

  test('displays problems section', async () => {
    renderPage('/exams/new')

    await waitFor(() => {
      expect(screen.getByText(/Problems/)).toBeInTheDocument()
    })
  })

  test('displays candidates section', async () => {
    renderPage('/exams/new')

    await waitFor(() => {
      expect(screen.getByText(/Candidates/)).toBeInTheDocument()
    })
  })

  test('shows candidate name and email in selector', async () => {
    renderPage('/exams/new')

    await waitFor(() => {
      expect(screen.getByText('Candidate 1')).toBeInTheDocument()
      expect(screen.getByText('c1@example.com')).toBeInTheDocument()
    })
  })

  test('displays problem title in selector', async () => {
    renderPage('/exams/new')

    await waitFor(() => {
      expect(screen.getByText('Problem 1')).toBeInTheDocument()
    })
  })

  test('shows difficulty badge for problems', async () => {
    renderPage('/exams/new')

    await waitFor(() => {
      expect(screen.getByText('easy')).toBeInTheDocument()
    })
  })

  test('renders Save button for new exam', async () => {
    renderPage('/exams/new')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create exam' })).toBeInTheDocument()
    })
  })

  test('renders Save button for existing exam', async () => {
    vi.spyOn(examsApi, 'apiGetExam').mockResolvedValue({
      exam_id: 'exam123',
      title: 'Test',
      description: '',
      start_time: '2026-06-01T10:00:00Z',
      end_time: '2026-06-01T12:00:00Z',
      show_score: false,
      created_by: null,
      created_at: '2026-05-31T00:00:00Z',
    })
    vi.spyOn(examsApi, 'apiListAssignments').mockResolvedValue([])

    renderPage('/exams/exam123/manage')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
    })
  })
})
