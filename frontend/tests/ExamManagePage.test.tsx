import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, vi, describe, test, expect } from 'vitest'
import userEvent from '@testing-library/user-event'

import * as examsApi from '../src/api/exams'
import * as adminApi from '../src/api/admin'
import * as problemsApi from '../src/api/problems'
import * as useAuthModule from '../src/hooks/useAuth'
import ExamManagePage from '../src/pages/ExamManagePage'

// Setup global mock for useNavigate to avoid hoisting issues
const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...(actual as any),
    useNavigate: () => mockNavigate,
  }
})

const mockAuth = () => {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    user: { user_id: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'admin' },
    accessToken: 'token',
    login: vi.fn(),
    logout: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue('token'),
  } as any)
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
  
  // Default mock data for problems
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
    {
      problem_id: 'p2',
      title: 'Hard Problem',
      difficulty: 'hard',
      description: '',
      input_format: null,
      output_format: null,
      sample_input: null,
      sample_output: null,
      time_limit: 2000,
      memory_limit: 512,
      allowed_langs: ['cpp17'],
      created_by: null,
      created_at: '2026-05-31T00:00:00Z',
    }
  ] as any)

  // Default mock data for candidates
  vi.spyOn(adminApi, 'apiListAdminUsers').mockResolvedValue({
    items: [
      { user_id: 'c1', name: 'Candidate 1', email: 'c1@example.com', role: 'candidate', is_active: true, created_at: '', updated_at: '' },
      { user_id: 'c2', name: 'Alice', email: 'alice@example.com', role: 'candidate', is_active: true, created_at: '', updated_at: '' },
    ],
    total: 2,
    page: 1,
    page_size: 100,
    total_pages: 1,
  } as any)
})

describe('ExamManagePage - Initial Rendering', () => {
  test('renders new exam form', async () => {
    renderPage('/exams/new')
    await waitFor(() => {
      expect(screen.getByText('New Exam')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Create exam' })).toBeInTheDocument()
  })

  test('loads existing exam for editing and shows actions', async () => {
    vi.spyOn(examsApi, 'apiGetExam').mockResolvedValue({
      exam_id: 'exam123',
      title: 'Backend Interview',
      description: '',
      start_time: '2026-06-01T10:00:00Z',
      end_time: '2026-06-01T12:00:00Z',
      show_score: false,
      anti_cheat_enabled: false,
      test_time_minutes: null,
      created_by: null,
      created_at: '2026-05-31T00:00:00Z',
    } as any)
    vi.spyOn(examsApi, 'apiListAssignments').mockResolvedValue([])

    renderPage('/exams/exam123/manage')

    await waitFor(() => {
      expect(screen.getByText(/Edit: Backend Interview/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Delete exam' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
    })
  })
})

describe('ExamManagePage - Form Interactions and Saving', () => {
  const setupUser = () => userEvent.setup()

  test('validates required fields before saving', async () => {
    const user = setupUser()
    renderPage('/exams/new')

    await waitFor(() => {
      expect(screen.getByText('Problem 1')).toBeInTheDocument()
    })

    const saveBtn = screen.getByRole('button', { name: 'Create exam' })
    await user.click(saveBtn)

    expect(screen.getByText('Title, start time, and end time are required.')).toBeInTheDocument()
  })

  test('creates new exam and assigns candidates', async () => {
    const user = setupUser()
    const mockCreateExam = vi.spyOn(examsApi, 'apiCreateExam').mockResolvedValue({ exam_id: 'new123' } as any)
    const mockCreateAssignment = vi.spyOn(examsApi, 'apiCreateAssignment').mockResolvedValue({} as any)

    renderPage('/exams/new')

    await waitFor(() => {
      expect(screen.getByText('Problem 1')).toBeInTheDocument()
    })

    // Fill basic info
    await user.type(screen.getByLabelText(/Title \*/), 'My Custom Exam')
    await user.type(screen.getByLabelText(/Description/), 'Test description')
    
    // Set dates using fireEvent for datetime-local inputs
    fireEvent.change(screen.getByLabelText(/Start time \*/), { target: { value: '2026-06-01T10:00' } })
    fireEvent.change(screen.getByLabelText(/End time \*/), { target: { value: '2026-06-01T12:00' } })

    // Check show score
    await user.click(screen.getByLabelText(/Show score/))

    // Select specific problem and candidate
    await user.click(screen.getByText('Problem 1'))
    await user.click(screen.getByText('Candidate 1'))

    // Save
    const saveBtn = screen.getByRole('button', { name: 'Create exam' })
    await user.click(saveBtn)

    await waitFor(() => {
      expect(mockCreateExam).toHaveBeenCalledWith('token', expect.objectContaining({
        title: 'My Custom Exam',
        description: 'Test description',
        show_score: true
      }))
      expect(mockCreateAssignment).toHaveBeenCalledWith('token', 'new123', { candidate_id: 'c1', problem_id: 'p1' })
      expect(mockNavigate).toHaveBeenCalledWith('/exams/new123/manage')
    })
  })

  test('updates existing exam and handles assignment diffs', async () => {
    const user = setupUser()
    vi.spyOn(examsApi, 'apiGetExam').mockResolvedValue({
      exam_id: 'exam123',
      title: 'Old Title',
      description: '',
      start_time: '2026-06-01T10:00:00Z',
      end_time: '2026-06-01T12:00:00Z',
      show_score: false,
      anti_cheat_enabled: false,
      test_time_minutes: null,
      created_by: null,
      created_at: '2026-05-31T00:00:00Z',
    } as any)
    
    // Originally c1 is assigned to p1
    vi.spyOn(examsApi, 'apiListAssignments').mockResolvedValue([
      { assignment_id: 'a1', candidate_id: 'c1', problem_id: 'p1', exam_id: 'exam123' }
    ] as any)

    const mockUpdateExam = vi.spyOn(examsApi, 'apiUpdateExam').mockResolvedValue({ exam_id: 'exam123' } as any)
    const mockCreateAssignment = vi.spyOn(examsApi, 'apiCreateAssignment').mockResolvedValue({} as any)
    const mockDeleteAssignment = vi.spyOn(examsApi, 'apiDeleteAssignment').mockResolvedValue(undefined)

    renderPage('/exams/exam123/manage')

    await waitFor(() => {
      expect(screen.getByDisplayValue('Old Title')).toBeInTheDocument()
    })

    // Deselect p1, Select p2
    await user.click(screen.getByText('Problem 1'))
    await user.click(screen.getByText('Hard Problem'))

    // Click Save changes
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockUpdateExam).toHaveBeenCalled()
      // We removed p1 for c1, so delete assignment a1
      expect(mockDeleteAssignment).toHaveBeenCalledWith('token', 'exam123', 'a1')
      // We added p2 for c1, so create new assignment
      expect(mockCreateAssignment).toHaveBeenCalledWith('token', 'exam123', { candidate_id: 'c1', problem_id: 'p2' })
      expect(mockNavigate).toHaveBeenCalledWith('/interviewer')
    })
  })

  test('prompts confirmation and deletes exam', async () => {
    const user = setupUser()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const mockDelete = vi.spyOn(examsApi, 'apiDeleteExam').mockResolvedValue(undefined as any)

    vi.spyOn(examsApi, 'apiGetExam').mockResolvedValue({
      exam_id: 'exam123',
      title: 'To Be Deleted',
      start_time: '2026-06-01T10:00:00Z',
      end_time: '2026-06-01T12:00:00Z',
    } as any)
    vi.spyOn(examsApi, 'apiListAssignments').mockResolvedValue([])

    renderPage('/exams/exam123/manage')

    await waitFor(() => {
      expect(screen.getByText(/Edit: To Be Deleted/)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Delete exam' }))

    expect(confirmSpy).toHaveBeenCalledWith('Delete this exam? This cannot be undone.')
    expect(mockDelete).toHaveBeenCalledWith('token', 'exam123')
    expect(mockNavigate).toHaveBeenCalledWith('/exams')
  })
})

describe('ExamManagePage - Filtering and Bulk Actions', () => {
  const setupUser = () => userEvent.setup()

  test('filters problems by text and difficulty', async () => {
    const user = setupUser()
    renderPage('/exams/new')

    await waitFor(() => {
      expect(screen.getByText('Problem 1')).toBeInTheDocument()
      expect(screen.getByText('Hard Problem')).toBeInTheDocument()
    })

    // Search by text
    const searchInput = screen.getByPlaceholderText('Search problems...')
    await user.type(searchInput, 'Hard')
    
    expect(screen.getByText('Hard Problem')).toBeInTheDocument()
    expect(screen.queryByText('Problem 1')).not.toBeInTheDocument()

    // Clear search and filter by difficulty
    await user.clear(searchInput)
    const diffSelect = screen.getAllByRole('combobox')[0] // First select is difficulty
    await user.selectOptions(diffSelect, 'easy')

    expect(screen.getByText('Problem 1')).toBeInTheDocument()
    expect(screen.queryByText('Hard Problem')).not.toBeInTheDocument()

    // Search for non-existent
    await user.type(searchInput, 'XYZ')
    expect(screen.getByText('No matching problems.')).toBeInTheDocument()
  })

  test('filters candidates by text', async () => {
    const user = setupUser()
    renderPage('/exams/new')

    await waitFor(() => {
      expect(screen.getByText('Candidate 1')).toBeInTheDocument()
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search name or email...')
    await user.type(searchInput, 'alice@example')

    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.queryByText('Candidate 1')).not.toBeInTheDocument()

    await user.type(searchInput, 'XYZ')
    expect(screen.getByText('No matching candidates.')).toBeInTheDocument()
  })
  
  test('selects and clears all items', async () => {
    const user = setupUser()
    renderPage('/exams/new')

    await waitFor(() => {
      expect(screen.getByText('Problem 1')).toBeInTheDocument()
    })

    const selectAllBtns = screen.getAllByRole('button', { name: 'Select all' })
    const clearBtns = screen.getAllByRole('button', { name: 'Clear' })

    // Problems: Select All
    await user.click(selectAllBtns[0])
    expect(screen.getByText('Problems').parentElement?.textContent).toContain('(2)')

    // Problems: Clear All
    await user.click(clearBtns[0])
    expect(screen.getByText('Problems').parentElement?.textContent).toContain('(0)')

    // Candidates: Select All
    await user.click(selectAllBtns[1])
    expect(screen.getByText('Candidates').parentElement?.textContent).toContain('(2)')

    // Candidates: Clear All
    await user.click(clearBtns[1])
    expect(screen.getByText('Candidates').parentElement?.textContent).toContain('(0)')
  })
})
