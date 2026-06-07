import { render, screen, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import { ApiError } from '../src/api/errors'
import * as examsApi from '../src/api/exams'
import * as useAuthModule from '../src/hooks/useAuth'
import ExamView from '../src/pages/ExamView'
import type { Exam, ExamProblem } from '../src/types/exam'

function isoFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

function makeExam(overrides: Partial<Exam> = {}): Exam {
  return {
    exam_id: 'exam-1',
    title: 'Sample Coding Interview',
    description: 'Solve the assigned problems.',
    start_time: isoFromNow(-30),
    end_time: isoFromNow(90),
    show_score: true,
    anti_cheat_enabled: false,
    test_time_minutes: null,
    created_by: null,
    created_at: isoFromNow(-60),
    ...overrides,
  }
}

const problems: ExamProblem[] = [
  {
    assignment_id: 'assignment-1',
    problem_id: 'problem-1',
    title: 'Two Sum',
    description: 'Add two numbers.',
    input_format: null,
    output_format: null,
    sample_input: null,
    sample_output: null,
    difficulty: 'easy',
    time_limit: 1000,
    memory_limit: 128,
    allowed_langs: ['python3', 'cpp17'],
  },
  {
    assignment_id: 'assignment-2',
    problem_id: 'problem-2',
    title: 'Graph Walk',
    description: 'Walk the graph.',
    input_format: null,
    output_format: null,
    sample_input: null,
    sample_output: null,
    difficulty: 'medium',
    time_limit: 2000,
    memory_limit: 256,
    allowed_langs: ['cpp17'],
  },
]

function mockAuth(role: 'candidate' | 'interviewer' = 'candidate') {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    user: {
      user_id: `${role}-1`,
      name: role,
      email: `${role}@example.com`,
      role,
    },
    accessToken: 'token',
    login: vi.fn(),
    logout: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue('token'),
  })
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/exams/exam-1']}>
      <Routes>
        <Route path="/exams/:examId" element={<ExamView />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  mockAuth()
  vi.spyOn(examsApi, 'apiGetExam').mockResolvedValue(makeExam())
  vi.spyOn(examsApi, 'apiGetExamAccess').mockResolvedValue({
    exam_id: 'exam-1',
    status_label: 'in_progress',
    can_view_exam: true,
    can_view_problems: true,
    can_start: false,
    can_solve: true,
    can_submit: true,
    can_edit_submission: true,
    can_view_submissions: true,
    requires_fullscreen: false,
    attempt_started_at: null,
    attempt_deadline_at: null,
    attempt_ended_at: null,
  })
  vi.spyOn(examsApi, 'apiListExamProblems').mockResolvedValue(problems)
  vi.spyOn(examsApi, 'apiGetCandidateExamState').mockResolvedValue({
    exam_id: 'exam-1',
    candidate_id: 'candidate-1',
    status: 'active',
    warning_started_at: null,
    locked_at: null,
    lock_reason: null,
    last_event_type: null,
    last_seen_at: new Date().toISOString(),
  })
})

describe('ExamView', () => {
  test('renders exam summary and dense problem table for active candidate exams', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'Sample Coding Interview' })
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Start Time')).toBeInTheDocument()
    expect(screen.getByText('End Time')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Problems' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Difficulty' })).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Limits' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Languages' })).toBeInTheDocument()
    expect(screen.getByText('Two Sum')).toBeInTheDocument()
    expect(screen.getByText('python3, cpp17')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Solve' })).toHaveLength(2)
  })

  test('blocks candidate problem actions before exam start', async () => {
    vi.spyOn(examsApi, 'apiGetExam').mockResolvedValue(makeExam({
      start_time: isoFromNow(60),
      end_time: isoFromNow(120),
    }))
    vi.spyOn(examsApi, 'apiGetExamAccess').mockResolvedValue({
      exam_id: 'exam-1',
      status_label: 'not_started',
      can_view_exam: true,
      can_view_problems: false,
      can_start: false,
      can_solve: false,
      can_submit: false,
      can_edit_submission: false,
      can_view_submissions: true,
      requires_fullscreen: false,
      attempt_started_at: null,
      attempt_deadline_at: null,
      attempt_ended_at: null,
    })

    renderPage()

    await screen.findByRole('heading', { name: 'Sample Coding Interview' })
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
    expect(screen.getByText('No problems assigned yet.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Solve' })).not.toBeInTheDocument()
  })

  test('blocks candidate problem actions when exam is locked', async () => {
    vi.spyOn(examsApi, 'apiListExamProblems').mockResolvedValue([])
    vi.spyOn(examsApi, 'apiGetCandidateExamState').mockResolvedValue({
      exam_id: 'exam-1',
      candidate_id: 'candidate-1',
      status: 'locked',
      warning_started_at: null,
      locked_at: new Date().toISOString(),
      lock_reason: 'warning_timeout',
      last_event_type: 'warning_timeout',
      last_seen_at: new Date().toISOString(),
    })

    renderPage()

    await screen.findByRole('heading', { name: 'Sample Coding Interview' })
    expect(screen.getByText(/fullscreen policy was violated/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Solve' })).not.toBeInTheDocument()
  })

  test('shows locked state instead of error when problem list is blocked by proctoring', async () => {
    vi.spyOn(examsApi, 'apiListExamProblems').mockRejectedValue(
      new ApiError(
        403,
        'Exam access locked due to proctoring violation',
        'Exam access locked due to proctoring violation',
      ),
    )
    vi.spyOn(examsApi, 'apiGetCandidateExamState').mockResolvedValue({
      exam_id: 'exam-1',
      candidate_id: 'candidate-1',
      status: 'locked',
      warning_started_at: null,
      locked_at: new Date().toISOString(),
      lock_reason: 'warning_timeout',
      last_event_type: 'warning_timeout',
      last_seen_at: new Date().toISOString(),
    })

    renderPage()

    await screen.findByRole('heading', { name: 'Sample Coding Interview' })
    expect(screen.getByText(/fullscreen policy was violated/i)).toBeInTheDocument()
    expect(screen.queryByText(/^Error:/i)).not.toBeInTheDocument()
  })

  test('renders staff view correctly', async () => {
    mockAuth('interviewer')
    renderPage()

    await screen.findByRole('heading', { name: 'Sample Coding Interview' })
    expect(screen.getByRole('heading', { name: 'Problems' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'View' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'End Test' })).not.toBeInTheDocument()
  })

  test('candidate starts an exam with anti-cheat enabled', async () => {
    vi.spyOn(examsApi, 'apiGetExamAccess').mockResolvedValue({
      exam_id: 'exam-1',
      status_label: 'not_started',
      can_view_exam: true,
      can_view_problems: false,
      can_start: true,
      can_solve: false,
      can_submit: false,
      can_edit_submission: false,
      can_view_submissions: true,
      requires_fullscreen: true,
      attempt_started_at: null,
      attempt_deadline_at: null,
      attempt_ended_at: null,
    })
    
    const startSpy = vi.spyOn(examsApi, 'apiStartExam').mockResolvedValue({} as any)
    const listProblemsSpy = vi.spyOn(examsApi, 'apiListExamProblems').mockResolvedValue(problems)
    
    let callCount = 0
    vi.spyOn(examsApi, 'apiGetExamAccess').mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return {
          exam_id: 'exam-1',
          status_label: 'not_started',
          can_view_exam: true,
          can_view_problems: false,
          can_start: true,
          can_solve: false,
          can_submit: false,
          can_edit_submission: false,
          can_view_submissions: true,
          requires_fullscreen: true,
          attempt_started_at: null,
          attempt_deadline_at: null,
          attempt_ended_at: null,
        }
      }
      return {
        exam_id: 'exam-1',
        status_label: 'in_progress',
        can_view_exam: true,
        can_view_problems: true,
        can_start: false,
        can_solve: true,
        can_submit: true,
        can_edit_submission: true,
        can_view_submissions: true,
        requires_fullscreen: true,
        attempt_started_at: new Date().toISOString(),
        attempt_deadline_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        attempt_ended_at: null,
      }
    })

    const reqFullscreenMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      writable: true,
      configurable: true,
      value: reqFullscreenMock
    })
    vi.spyOn(examsApi, 'apiGetExam').mockResolvedValue(makeExam({ anti_cheat_enabled: true }))

    renderPage()

    const startBtn = await screen.findByRole('button', { name: 'Start' })
    await act(async () => {
      startBtn.click()
    })

    expect(startSpy).toHaveBeenCalledWith('token', 'exam-1')
    expect(reqFullscreenMock).toHaveBeenCalled()
    expect(listProblemsSpy).toHaveBeenCalled()

    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      writable: true,
      configurable: true,
      value: undefined
    })
  })

  test('candidate ends an exam', async () => {
    vi.spyOn(examsApi, 'apiGetExamAccess').mockResolvedValue({
      exam_id: 'exam-1',
      status_label: 'in_progress',
      can_view_exam: true,
      can_view_problems: true,
      can_start: false,
      can_solve: true,
      can_submit: true,
      can_edit_submission: true,
      can_view_submissions: true,
      requires_fullscreen: true,
      attempt_started_at: new Date().toISOString(),
      attempt_deadline_at: null,
      attempt_ended_at: null,
    })
    vi.spyOn(examsApi, 'apiGetExam').mockResolvedValue(makeExam({ anti_cheat_enabled: true }))

    const endSpy = vi.spyOn(examsApi, 'apiEndExam').mockResolvedValue({} as any)
    const exitFullscreenMock = vi.fn().mockResolvedValue(undefined)
    
    Object.defineProperty(document, 'fullscreenElement', {
      writable: true,
      configurable: true,
      value: {}
    })
    Object.defineProperty(document, 'exitFullscreen', {
      writable: true,
      configurable: true,
      value: exitFullscreenMock
    })

    renderPage()

    const endBtn = await screen.findByRole('button', { name: 'End Test' })
    await act(async () => {
      endBtn.click()
    })

    expect(endSpy).toHaveBeenCalledWith('token', 'exam-1')
    expect(exitFullscreenMock).toHaveBeenCalled()

    Object.defineProperty(document, 'fullscreenElement', {
      writable: true,
      configurable: true,
      value: null
    })
    Object.defineProperty(document, 'exitFullscreen', {
      writable: true,
      configurable: true,
      value: undefined
    })
  })

  test('displays error message if start exam fails', async () => {
    vi.spyOn(examsApi, 'apiGetExamAccess').mockResolvedValue({
      exam_id: 'exam-1',
      status_label: 'not_started',
      can_view_exam: true,
      can_view_problems: false,
      can_start: true,
      can_solve: false,
      can_submit: false,
      can_edit_submission: false,
      can_view_submissions: true,
      requires_fullscreen: false,
      attempt_started_at: null,
      attempt_deadline_at: null,
      attempt_ended_at: null,
    })
    vi.spyOn(examsApi, 'apiStartExam').mockRejectedValue(new Error('Network error'))

    renderPage()

    const startBtn = await screen.findByRole('button', { name: 'Start' })
    await act(async () => {
      startBtn.click()
    })

    expect(screen.getByText('Error: Network error')).toBeInTheDocument()
  })

  test('displays error message if end exam fails', async () => {
    vi.spyOn(examsApi, 'apiGetExamAccess').mockResolvedValue({
      exam_id: 'exam-1',
      status_label: 'in_progress',
      can_view_exam: true,
      can_view_problems: true,
      can_start: false,
      can_solve: true,
      can_submit: true,
      can_edit_submission: true,
      can_view_submissions: true,
      requires_fullscreen: true,
      attempt_started_at: new Date().toISOString(),
      attempt_deadline_at: null,
      attempt_ended_at: null,
    })
    vi.spyOn(examsApi, 'apiGetExam').mockResolvedValue(makeExam({ anti_cheat_enabled: true }))
    vi.spyOn(examsApi, 'apiEndExam').mockRejectedValue(new Error('Failed to end'))

    renderPage()

    const endBtn = await screen.findByRole('button', { name: 'End Test' })
    await act(async () => {
      endBtn.click()
    })

    expect(screen.getByText('Error: Failed to end')).toBeInTheDocument()
  })

  test('displays error message if load fails', async () => {
    vi.spyOn(examsApi, 'apiGetExam').mockRejectedValue(new Error('Unauthorized load'))
    
    renderPage()
    
    await screen.findByText('Error: Unauthorized load')
  })

  test('advances periodic timer', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Sample Coding Interview' })
    
    vi.useFakeTimers()
    act(() => {
      vi.advanceTimersByTime(30000)
    })
    vi.useRealTimers()
  })
})
