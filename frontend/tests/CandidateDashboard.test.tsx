import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import * as examsApi from '../src/api/exams'
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
})

describe('CandidateDashboard', () => {
  test('renders dense exam table without staff management links for candidates', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'My Exams' })
    expect(screen.getByText('1 active, 1 upcoming, 1 ended')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Start Time' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'End Time' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Remaining' })).toBeInTheDocument()
    expect(screen.getByText('Active Algorithms')).toBeInTheDocument()
    expect(screen.getByText('Future DP')).toBeInTheDocument()
    expect(screen.getByText('Past Graphs')).toBeInTheDocument()
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
