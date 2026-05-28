import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import * as examsApi from '../src/api/exams'
import * as submissionsApi from '../src/api/submissions'
import * as useAuthModule from '../src/hooks/useAuth'
import CandidateDashboard from '../src/pages/CandidateDashboard'
import type { Exam } from '../src/types/exam'
import type { SubmissionListItem } from '../src/types/submission'

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
      created_by: null,
      created_at: isoFromNow(-240),
    },
  ]
}

function makeSubmission(): SubmissionListItem {
  return {
    submission_id: 'submission-1',
    exam_id: 'active-exam',
    problem_id: 'problem-1',
    candidate_id: 'candidate-1',
    language: 'python3',
    status: 'completed',
    submitted_at: isoFromNow(-10),
    judge_result: {
      result_id: 'result-1',
      submission_id: 'submission-1',
      verdict: 'Accepted',
      score: 100,
      passed_count: 1,
      total_count: 1,
      execution_time: 12,
      memory_usage: 8,
      error_message: null,
      judged_at: isoFromNow(-9),
    },
    problem_title: 'Two Sum',
    candidate_name: 'Candidate',
    candidate_email: 'candidate@example.com',
  }
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
  vi.spyOn(submissionsApi, 'apiListSubmissions').mockResolvedValue([makeSubmission()])
})

describe('CandidateDashboard', () => {
  test('renders dense exam table without staff management links for candidates', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'My Exams' })
    expect(screen.getByText('1 active, 1 upcoming, 1 ended')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Start Time' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'End Time' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Problems' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Last Submission' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Remaining' })).toBeInTheDocument()
    expect(screen.getByText('Active Algorithms')).toBeInTheDocument()
    expect(screen.getByText('Future DP')).toBeInTheDocument()
    expect(screen.getByText('Past Graphs')).toBeInTheDocument()
    expect(screen.getByText('AC')).toBeInTheDocument()
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
})
