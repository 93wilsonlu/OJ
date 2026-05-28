import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { apiGetSubmission } from '../src/api/submissions'
import { useSubmissionPoller } from '../src/hooks/useSubmissionPoller'
import type { SubmissionDetail } from '../src/types/submission'

vi.mock('../src/api/submissions', () => ({
  apiGetSubmission: vi.fn(),
}))

const baseSubmission: SubmissionDetail = {
  submission_id: 'sub-1',
  exam_id: 'exam-1',
  problem_id: 'problem-1',
  candidate_id: 'candidate-1',
  language: 'python3',
  status: 'pending',
  submitted_at: '2026-05-28T00:00:00Z',
  judge_result: null,
}

function PollerProbe({
  submissionId,
  getAccessToken,
}: {
  submissionId: string | null
  getAccessToken: () => Promise<string | null>
}) {
  const { data, error } = useSubmissionPoller(submissionId, getAccessToken)
  return (
    <div>
      <div>status:{data?.status ?? 'none'}</div>
      <div>error:{error ?? 'none'}</div>
    </div>
  )
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useSubmissionPoller', () => {
  test('gets a fresh access token before fetching a submission', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('access-1')
    vi.mocked(apiGetSubmission).mockResolvedValue({
      ...baseSubmission,
      status: 'completed',
    })

    render(<PollerProbe submissionId="sub-1" getAccessToken={getAccessToken} />)

    await waitFor(() => expect(screen.getByText('status:completed')).toBeInTheDocument())
    expect(getAccessToken).toHaveBeenCalledTimes(1)
    expect(apiGetSubmission).toHaveBeenCalledWith('access-1', 'sub-1')
  })

  test('gets a fresh access token for each polling interval', async () => {
    const getAccessToken = vi
      .fn()
      .mockResolvedValueOnce('access-1')
      .mockResolvedValueOnce('access-2')
    vi.mocked(apiGetSubmission)
      .mockResolvedValueOnce(baseSubmission)
      .mockResolvedValueOnce({ ...baseSubmission, status: 'completed' })

    render(<PollerProbe submissionId="sub-1" getAccessToken={getAccessToken} />)

    await waitFor(() => expect(screen.getByText('status:pending')).toBeInTheDocument())
    await waitFor(
      () => expect(screen.getByText('status:completed')).toBeInTheDocument(),
      { timeout: 3500 },
    )
    expect(getAccessToken).toHaveBeenCalledTimes(2)
    expect(apiGetSubmission).toHaveBeenNthCalledWith(1, 'access-1', 'sub-1')
    expect(apiGetSubmission).toHaveBeenNthCalledWith(2, 'access-2', 'sub-1')
  })
})
