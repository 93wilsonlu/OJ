import type { Submission, SubmissionDetail, SubmissionListItem } from '../types/submission'
import { throwOnApiError } from './errors'

const BASE = '/api/v1'

export async function apiCreateSubmission(
  token: string,
  body: { exam_id: string; problem_id: string; language: string; code: string },
): Promise<Submission> {
  const res = await fetch(`${BASE}/submissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  await throwOnApiError(res, 'Submission failed')
  return res.json()
}

export async function apiGetSubmission(token: string, submissionId: string): Promise<SubmissionDetail> {
  const res = await fetch(`${BASE}/submissions/${submissionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwOnApiError(res, 'Failed to fetch submission')
  return res.json()
}

export async function apiListSubmissions(
  token: string,
  params?: { exam_id?: string; candidate_id?: string },
): Promise<SubmissionListItem[]> {
  const url = new URL(`${BASE}/submissions`, window.location.origin)
  if (params?.exam_id) url.searchParams.set('exam_id', params.exam_id)
  if (params?.candidate_id) url.searchParams.set('candidate_id', params.candidate_id)
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwOnApiError(res, 'Failed to fetch submissions')
  return res.json()
}
