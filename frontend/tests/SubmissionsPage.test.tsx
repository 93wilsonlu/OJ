import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import * as submissionsApi from '../src/api/submissions'
import * as useAuthModule from '../src/hooks/useAuth'
import SubmissionsPage from '../src/pages/SubmissionsPage'
import type { SubmissionListItem } from '../src/types/submission'

function makeSubmission(overrides: Partial<SubmissionListItem> = {}): SubmissionListItem {
  return {
    submission_id: 'submission-1',
    exam_id: 'exam-1',
    problem_id: 'problem-1',
    candidate_id: 'candidate-1',
    language: 'python3',
    status: 'completed',
    submitted_at: new Date('2026-05-28T08:00:00Z').toISOString(),
    judge_result: {
      result_id: 'result-1',
      submission_id: 'submission-1',
      verdict: 'Accepted',
      score: 100,
      passed_count: 4,
      total_count: 4,
      execution_time: 12,
      memory_usage: 2048,
      error_message: null,
      judged_at: new Date('2026-05-28T08:01:00Z').toISOString(),
    },
    exam_title: 'Backend Interview',
    problem_title: 'Two Sum',
    candidate_name: 'Candidate',
    candidate_email: 'candidate@example.com',
    ...overrides,
  }
}

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

beforeEach(() => {
  vi.restoreAllMocks()
  mockAuth()
  vi.spyOn(submissionsApi, 'apiListSubmissions').mockResolvedValue([
    makeSubmission(),
    makeSubmission({
      submission_id: 'submission-2',
      problem_id: 'problem-2',
      problem_title: 'Graph Walk',
      status: 'judging',
      judge_result: null,
    }),
  ])
})

describe('SubmissionsPage', () => {
  test('renders summary cards and filters by search text', async () => {
    render(
      <MemoryRouter>
        <SubmissionsPage />
      </MemoryRouter>,
    )

    await screen.findByText('Two Sum')
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getAllByText('Accepted').length).toBeGreaterThan(0)
    expect(screen.getByText('Graph Walk')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Search problem, exam, submission...'), {
      target: { value: 'graph' },
    })

    expect(screen.queryByText('Two Sum')).not.toBeInTheDocument()
    expect(screen.getByText('Graph Walk')).toBeInTheDocument()
  })

  test('filters by verdict/status', async () => {
    render(
      <MemoryRouter>
        <SubmissionsPage />
      </MemoryRouter>,
    )

    await screen.findByText('Two Sum')
    fireEvent.change(screen.getByRole('combobox', { name: 'Verdict filter' }), {
      target: { value: 'judging' },
    })

    await waitFor(() => {
      expect(screen.queryByText('Two Sum')).not.toBeInTheDocument()
      expect(screen.getByText('Graph Walk')).toBeInTheDocument()
    })
  })
})
