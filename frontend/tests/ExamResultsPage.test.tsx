import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import * as adminApi from '../src/api/admin'
import * as submissionsApi from '../src/api/submissions'
import * as useAuthModule from '../src/hooks/useAuth'
import ExamResultsPage from '../src/pages/ExamResultsPage'
import type { AdminUserRole, ExamResults } from '../src/types/admin'

const lockedResults: ExamResults = {
  exam_id: 'exam-1',
  title: 'Backend Interview',
  candidates: [
    {
      candidate_id: 'candidate-1',
      name: 'Candidate One',
      email: 'candidate@example.com',
      is_active: true,
      proctoring_status: 'locked',
      locked_at: '2026-06-02T10:00:00Z',
      lock_reason: 'warning_timeout',
      problems: [],
      total_score: 0,
    },
  ],
}

const unlockedResults: ExamResults = {
  ...lockedResults,
  candidates: [
    {
      ...lockedResults.candidates[0],
      proctoring_status: 'active',
      locked_at: null,
      lock_reason: null,
    },
  ],
}

const searchableResults: ExamResults = {
  exam_id: 'exam-1',
  title: 'Backend Interview',
  candidates: [
    {
      candidate_id: 'candidate-1',
      name: 'Alice Candidate',
      email: 'alice@example.com',
      is_active: true,
      proctoring_status: 'active',
      locked_at: null,
      lock_reason: null,
      total_score: 100,
      problems: [
        {
          problem_id: 'problem-1',
          title: 'Two Sum',
          best_score: 100,
          submission_count: 1,
          latest_verdict: 'Accepted',
          display_submission_id: 'submission-1',
          display_submission_language: 'python3',
          display_submission_submitted_at: '2026-06-02T10:00:00Z',
          display_submission_verdict: 'Accepted',
        },
        {
          problem_id: 'problem-2',
          title: 'Reverse List',
          best_score: 0,
          submission_count: 1,
          latest_verdict: 'Wrong Answer',
          display_submission_id: 'submission-2',
          display_submission_language: 'cpp17',
          display_submission_submitted_at: '2026-06-02T10:05:00Z',
          display_submission_verdict: 'Wrong Answer',
        },
      ],
    },
    {
      candidate_id: 'candidate-2',
      name: 'Bob Candidate',
      email: 'bob@example.com',
      is_active: true,
      proctoring_status: 'active',
      locked_at: null,
      lock_reason: null,
      total_score: 40,
      problems: [
        {
          problem_id: 'problem-1',
          title: 'Two Sum',
          best_score: 0,
          submission_count: 1,
          latest_verdict: 'Wrong Answer',
          display_submission_id: 'submission-3',
          display_submission_language: 'python3',
          display_submission_submitted_at: '2026-06-02T10:03:00Z',
          display_submission_verdict: 'Wrong Answer',
        },
        {
          problem_id: 'problem-2',
          title: 'Reverse List',
          best_score: 100,
          submission_count: 1,
          latest_verdict: 'Accepted',
          display_submission_id: 'submission-4',
          display_submission_language: 'python3',
          display_submission_submitted_at: '2026-06-02T10:08:00Z',
          display_submission_verdict: 'Accepted',
        },
      ],
    },
  ],
}

function mockAuth(role: AdminUserRole) {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    user: { user_id: `${role}-1`, name: role, email: `${role}@example.com`, role },
    accessToken: 'token',
    login: vi.fn(),
    logout: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue('token'),
  })
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/exams/exam-1/results']}>
      <Routes>
        <Route path="/exams/:examId/results" element={<ExamResultsPage />} />
        <Route path="/exams" element={<div>Exams list</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('ExamResultsPage', () => {
  test.each<AdminUserRole>(['admin', 'interviewer'])(
    'shows locked candidates to %s users',
    async (role) => {
      mockAuth(role)
      vi.spyOn(adminApi, 'apiGetExamResults').mockResolvedValue(lockedResults)
      vi.spyOn(adminApi, 'apiUnlockExamCandidate').mockResolvedValue()

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Locked')).toBeInTheDocument()
      })
      expect(screen.getByText('warning timeout')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Unlock' })).toBeInTheDocument()
    },
  )

  test('unlocks a locked candidate and reloads results', async () => {
    mockAuth('interviewer')
    vi.spyOn(adminApi, 'apiGetExamResults')
      .mockResolvedValueOnce(lockedResults)
      .mockResolvedValueOnce(unlockedResults)
    const unlock = vi.spyOn(adminApi, 'apiUnlockExamCandidate').mockResolvedValue()

    renderPage()
    await screen.findByRole('button', { name: 'Unlock' })

    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }))

    await waitFor(() => {
      expect(unlock).toHaveBeenCalledWith('token', 'exam-1', 'candidate-1')
    })
    await waitFor(() => {
      expect(screen.queryByText('Locked')).not.toBeInTheDocument()
    })
  })

  test('filters candidates by name, accepted problem, and minimum accepted count', async () => {
    mockAuth('interviewer')
    vi.spyOn(adminApi, 'apiGetExamResults').mockResolvedValue(searchableResults)
    vi.spyOn(adminApi, 'apiUnlockExamCandidate').mockResolvedValue()

    renderPage()
    await screen.findByText('Alice Candidate')

    await userEvent.type(screen.getByLabelText('Search name or email'), 'alice')
    expect(screen.getByText('Alice Candidate')).toBeInTheDocument()
    expect(screen.queryByText('Bob Candidate')).not.toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Search name or email'))
    await userEvent.selectOptions(screen.getByLabelText('AC problem'), 'problem-2')
    expect(screen.queryByText('Alice Candidate')).not.toBeInTheDocument()
    expect(screen.getByText('Bob Candidate')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('AC problem'), '')
    await userEvent.type(screen.getByLabelText('Min AC count'), '1')
    expect(screen.getByText('Alice Candidate')).toBeInTheDocument()
    expect(screen.getByText('Bob Candidate')).toBeInTheDocument()
  })

  test('filters and sorts candidates by total score', async () => {
    mockAuth('interviewer')
    vi.spyOn(adminApi, 'apiGetExamResults').mockResolvedValue(searchableResults)
    vi.spyOn(adminApi, 'apiUnlockExamCandidate').mockResolvedValue()

    renderPage()
    await screen.findByText('Alice Candidate')

    await userEvent.type(screen.getByLabelText('Min score'), '50')
    expect(screen.getByText('Alice Candidate')).toBeInTheDocument()
    expect(screen.queryByText('Bob Candidate')).not.toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Min score'))
    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'total_asc')

    const bob = screen.getByText('Bob Candidate')
    const alice = screen.getByText('Alice Candidate')
    expect(Boolean(bob.compareDocumentPosition(alice) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  })

  test('opens the selected submission source code in a read-only viewer', async () => {
    mockAuth('interviewer')
    vi.spyOn(adminApi, 'apiGetExamResults').mockResolvedValue(searchableResults)
    vi.spyOn(adminApi, 'apiUnlockExamCandidate').mockResolvedValue()
    vi.spyOn(submissionsApi, 'apiGetSubmission').mockResolvedValue({
      submission_id: 'submission-1',
      exam_id: 'exam-1',
      problem_id: 'problem-1',
      candidate_id: 'candidate-1',
      language: 'python3',
      status: 'completed',
      submitted_at: '2026-06-02T10:00:00Z',
      judge_result: {
        result_id: 'result-1',
        submission_id: 'submission-1',
        verdict: 'Accepted',
        score: 100,
        passed_count: 1,
        total_count: 1,
        execution_time: 10,
        memory_usage: 8,
        error_message: null,
        case_results: [
          { index: 1, verdict: 'Accepted', execution_time: 10, memory_usage: 8 },
        ],
        judged_at: '2026-06-02T10:00:05Z',
      },
      source_code: 'print("ok")',
    })

    renderPage()
    await screen.findByText('Alice Candidate')

    await userEvent.click(screen.getAllByRole('button', { name: 'View code' })[0])

    await waitFor(() => {
      expect(submissionsApi.apiGetSubmission).toHaveBeenCalledWith('token', 'submission-1')
    })
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('print("ok")')).toBeInTheDocument()
    expect(screen.getByText('Alice Candidate / Two Sum')).toBeInTheDocument()
  })
})
