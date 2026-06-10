import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import * as examsApi from '../src/api/exams'
import { ApiError } from '../src/api/errors'
import * as useAuthModule from '../src/hooks/useAuth'
import CandidateDashboard from '../src/pages/CandidateDashboard'
import type { Exam } from '../src/types/exam'

function isoFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

function makeExams(): Exam[] {
  return [
    {
      exam_id: 'active-exam',
      title: 'Active Algorithms',
      description: 'Currently open',
      start_time: isoFromNow(-60),
      end_time: isoFromNow(60),
      show_score: true,
      anti_cheat_enabled: false,
      test_time_minutes: null,
      created_by: null,
      created_at: isoFromNow(-120),
    },
    {
      exam_id: 'upcoming-exam',
      title: 'Future DP',
      description: 'Starts later',
      start_time: isoFromNow(120),
      end_time: isoFromNow(180),
      show_score: true,
      anti_cheat_enabled: false,
      test_time_minutes: null,
      created_by: null,
      created_at: isoFromNow(-120),
    },
    {
      exam_id: 'ended-exam',
      title: 'Past Graphs',
      description: 'Already closed',
      start_time: isoFromNow(-180),
      end_time: isoFromNow(-120),
      show_score: true,
      anti_cheat_enabled: false,
      test_time_minutes: null,
      created_by: null,
      created_at: isoFromNow(-240),
    },
  ]
}

function mockCandidateAuth() {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    user: {
      user_id: 'candidate-1',
      name: 'Candidate',
      email: 'candidate@example.com',
      role: 'candidate',
    },
    accessToken: 'token',
    login: vi.fn(),
    logout: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue('token'),
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CandidateDashboard />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  mockCandidateAuth()
  vi.spyOn(examsApi, 'apiListExams').mockResolvedValue(makeExams())
  vi.spyOn(examsApi, 'apiGetExamAccess').mockImplementation(async (_token, examId) => ({
    exam_id: examId,
    status_label: examId === 'active-exam' ? 'in_progress' : examId === 'ended-exam' ? 'finished' : 'not_started',
    can_view_exam: true,
    can_view_problems: examId !== 'upcoming-exam',
    can_start: false,
    can_solve: examId === 'active-exam',
    can_submit: examId === 'active-exam',
    can_edit_submission: examId === 'active-exam',
    can_view_submissions: true,
    requires_fullscreen: false,
    attempt_started_at: null,
    attempt_deadline_at: null,
    attempt_ended_at: null,
  }))
  vi.spyOn(examsApi, 'apiListExamProblems').mockImplementation(async (_token, examId) => {
    const counts: Record<string, number> = {
      'active-exam': 3,
      'upcoming-exam': 2,
      'ended-exam': 1,
    }
    return Array.from({ length: counts[examId] ?? 0 }, (_, index) => ({
      assignment_id: `${examId}-assignment-${index}`,
      problem_id: `${examId}-problem-${index}`,
      title: `Problem ${index}`,
      description: '',
      input_format: null,
      output_format: null,
      sample_input: null,
      sample_output: null,
      difficulty: 'easy',
      time_limit: 1000,
      memory_limit: 128,
      allowed_langs: ['python3'],
    }))
  })
})

describe('CandidateDashboard', () => {
  test('renders dense exam table without staff management links for candidates', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'My Exams' })
    expect(screen.getByText('1 active, 1 upcoming, 1 ended')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Start Time' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'End Time' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Problems' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Last Submission' })).not.toBeInTheDocument()
    expect(screen.getByText('Active Algorithms')).toBeInTheDocument()
    expect(screen.getByText('Future DP')).toBeInTheDocument()
    expect(screen.getByText('Past Graphs')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Manage' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Results' })).not.toBeInTheDocument()
  })

  test('filters exams by status and search text', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Active Algorithms')
    await user.selectOptions(screen.getByDisplayValue('All statuses'), 'Upcoming')

    expect(screen.queryByText('Active Algorithms')).not.toBeInTheDocument()
    expect(screen.getByText('Future DP')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('Search exams'), 'graphs')

    await waitFor(() =>
      expect(screen.getByText('No exams match your filters.')).toBeInTheDocument(),
    )
  })

  test('renders interviewer view with staff links', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        user_id: 'interviewer-1',
        name: 'Interviewer',
        email: 'interviewer@example.com',
        role: 'interviewer',
      },
      accessToken: 'token',
      login: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue('token'),
    })

    renderPage()

    await screen.findByRole('heading', { name: 'Exams' })
    expect(screen.getByRole('link', { name: 'New Exam' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Results' })).toHaveLength(3)
    expect(screen.getAllByRole('link', { name: 'Manage' })).toHaveLength(3)
  })

  test('candidate starts an exam', async () => {
    vi.spyOn(examsApi, 'apiGetExamAccess').mockImplementation(async (_token, examId) => ({
      exam_id: examId,
      status_label: 'not_started',
      can_view_exam: true,
      can_view_problems: false,
      can_start: examId === 'active-exam',
      can_solve: false,
      can_submit: false,
      can_edit_submission: false,
      can_view_submissions: true,
      requires_fullscreen: true,
      attempt_started_at: null,
      attempt_deadline_at: null,
      attempt_ended_at: null,
    }))

    const startSpy = vi.spyOn(examsApi, 'apiStartExam').mockResolvedValue({} as any)
    const reqFullscreenMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      writable: true,
      configurable: true,
      value: reqFullscreenMock
    })

    const exams = makeExams()
    exams[0].anti_cheat_enabled = true
    vi.spyOn(examsApi, 'apiListExams').mockResolvedValue(exams)

    renderPage()

    const startBtn = await screen.findByRole('button', { name: 'Start' })
    await act(async () => {
      startBtn.click()
    })

    expect(startSpy).toHaveBeenCalledWith('token', 'active-exam')
    expect(reqFullscreenMock).toHaveBeenCalled()

    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      writable: true,
      configurable: true,
      value: undefined
    })
  })

  test('candidate continues an exam', async () => {
    const exams = makeExams()
    exams[0].anti_cheat_enabled = true
    vi.spyOn(examsApi, 'apiListExams').mockResolvedValue(exams)

    const reqFullscreenMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      writable: true,
      configurable: true,
      value: reqFullscreenMock
    })

    renderPage()

    const continueBtn = await screen.findByRole('button', { name: 'Continue' })
    await act(async () => {
      continueBtn.click()
    })

    expect(reqFullscreenMock).toHaveBeenCalled()

    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      writable: true,
      configurable: true,
      value: undefined
    })
  })

  test('displays error message if start exam fails in dashboard', async () => {
    vi.spyOn(examsApi, 'apiGetExamAccess').mockImplementation(async (_token, examId) => ({
      exam_id: examId,
      status_label: 'not_started',
      can_view_exam: true,
      can_view_problems: false,
      can_start: examId === 'active-exam',
      can_solve: false,
      can_submit: false,
      can_edit_submission: false,
      can_view_submissions: true,
      requires_fullscreen: false,
      attempt_started_at: null,
      attempt_deadline_at: null,
      attempt_ended_at: null,
    }))

    vi.spyOn(examsApi, 'apiStartExam').mockRejectedValue(new Error('Start failed'))

    renderPage()

    const startBtn = await screen.findByRole('button', { name: 'Start' })
    await act(async () => {
      startBtn.click()
    })

    expect(await screen.findByText('Error: Start failed')).toBeInTheDocument()
  })

  test('displays locked state if apiListExamProblems returns proctoring violation', async () => {
    vi.spyOn(examsApi, 'apiListExamProblems').mockRejectedValue(
      new ApiError(403, 'Proctoring violation', 'Proctoring violation')
    )

    renderPage()

    expect((await screen.findAllByText('Locked')).length).toBeGreaterThan(0)
  })

  test('displays locked state for force-ended fullscreen exams', async () => {
    vi.spyOn(examsApi, 'apiGetExamAccess').mockImplementation(async (_token, examId) => ({
      exam_id: examId,
      status_label: examId === 'active-exam' ? 'force_ended' : examId === 'ended-exam' ? 'finished' : 'not_started',
      can_view_exam: true,
      can_view_problems: examId !== 'upcoming-exam',
      can_start: false,
      can_solve: false,
      can_submit: false,
      can_edit_submission: false,
      can_view_submissions: true,
      requires_fullscreen: false,
      attempt_started_at: examId === 'active-exam' ? new Date().toISOString() : null,
      attempt_deadline_at: null,
      attempt_ended_at: examId === 'active-exam' ? new Date().toISOString() : null,
    }))

    renderPage()

    expect(await screen.findByText('Locked')).toBeInTheDocument()
  })

  test('displays error banner if loading exams fails', async () => {
    vi.spyOn(examsApi, 'apiListExams').mockRejectedValue(new Error('Failed to fetch exams'))

    renderPage()

    expect(await screen.findByText('Error: Failed to fetch exams')).toBeInTheDocument()
  })

  test('handles dashboard periodic timer', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'My Exams' })

    vi.useFakeTimers()
    act(() => {
      vi.advanceTimersByTime(30000)
    })
    vi.useRealTimers()
  })
})
