import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import * as useAuthModule from '../src/hooks/useAuth'
import { useSubmissionPoller } from '../src/hooks/useSubmissionPoller'
import SubmissionStatus from '../src/pages/SubmissionStatus'
import type { SubmissionDetail } from '../src/types/submission'

vi.mock('../src/hooks/useSubmissionPoller', () => ({
  useSubmissionPoller: vi.fn(),
}))

const baseSubmission: SubmissionDetail = {
  submission_id: 'submission-1',
  exam_id: 'exam-1',
  problem_id: 'problem-1',
  candidate_id: 'candidate-1',
  language: 'python3',
  status: 'judging',
  submitted_at: new Date('2026-05-28T08:00:00Z').toISOString(),
  judge_result: null,
  source_code: "print('hello')\n",
}

function mockAuth() {
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
    <MemoryRouter initialEntries={['/submissions/submission-1']}>
      <Routes>
        <Route path="/submissions/:submissionId" element={<SubmissionStatus />} />
        <Route path="/exams/:examId/submissions/:submissionId" element={<SubmissionStatus />} />
        <Route path="/exams/:examId/problems/:problemId" element={<div>Editor</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderScopedPage() {
  return render(
    <MemoryRouter initialEntries={['/exams/exam-1/submissions/submission-1']}>
      <Routes>
        <Route path="/exams/:examId/submissions/:submissionId" element={<SubmissionStatus />} />
        <Route path="/exams/:examId/problems/:problemId" element={<div>Editor</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
  mockAuth()
})

describe('SubmissionStatus', () => {
  test('shows a clear judging state while polling', () => {
    vi.mocked(useSubmissionPoller).mockReturnValue({ data: baseSubmission, error: null })

    renderPage()

    expect(screen.getByText('Judging')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Judging...')).toBeInTheDocument()
  })

  test('shows judge result metrics when completed', () => {
    vi.mocked(useSubmissionPoller).mockReturnValue({
      data: {
        ...baseSubmission,
        status: 'completed',
        judge_result: {
          result_id: 'result-1',
          submission_id: 'submission-1',
          verdict: 'Accepted',
          score: 100,
          passed_count: 4,
          total_count: 4,
          execution_time: 13,
          memory_usage: 2048,
          error_message: null,
          judged_at: new Date('2026-05-28T08:01:00Z').toISOString(),
        },
      },
      error: null,
    })

    renderPage()

    expect(screen.getByText('Accepted')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByText('4 / 4')).toBeInTheDocument()
    expect(screen.getByText('13 ms')).toBeInTheDocument()
    expect(screen.getByText('2048 KB')).toBeInTheDocument()
  })

  test('shows submitted source code and stores it for reuse in the editor', () => {
    vi.mocked(useSubmissionPoller).mockReturnValue({ data: baseSubmission, error: null })

    renderPage()

    expect(screen.getByText("print('hello')")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Use in editor' }))

    expect(sessionStorage.getItem('submission-reuse:submission-1')).toContain("print('hello')")
  })

  test('supports exam-scoped submission details for code reuse', () => {
    vi.mocked(useSubmissionPoller).mockReturnValue({ data: baseSubmission, error: null })

    renderScopedPage()

    expect(screen.getByRole('link', { name: 'Back to exam' })).toHaveAttribute(
      'href',
      '/exams/exam-1',
    )
    expect(screen.getByRole('link', { name: 'Use in editor' })).toHaveAttribute(
      'href',
      '/exams/exam-1/problems/problem-1?fromSubmission=submission-1',
    )
  })
})
