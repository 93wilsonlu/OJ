import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import * as adminApi from '../src/api/admin'
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
})
