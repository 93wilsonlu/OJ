import type { Problem, ProblemCreate, ProblemUpdate, TestCase } from '../types/problem'

const BASE = '/api/v1'

async function throwOnError(res: Response) {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`)
  }
}

export async function apiListProblems(token: string): Promise<Problem[]> {
  const res = await fetch(`${BASE}/problems`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwOnError(res)
  return res.json()
}

export async function apiGetProblem(token: string, problemId: string): Promise<Problem> {
  const res = await fetch(`${BASE}/problems/${problemId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwOnError(res)
  return res.json()
}

export async function apiCreateProblem(token: string, body: ProblemCreate): Promise<Problem> {
  const res = await fetch(`${BASE}/problems`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  await throwOnError(res)
  return res.json()
}

export async function apiUpdateProblem(
  token: string,
  problemId: string,
  body: ProblemUpdate,
): Promise<Problem> {
  const res = await fetch(`${BASE}/problems/${problemId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  await throwOnError(res)
  return res.json()
}

export async function apiDeleteProblem(token: string, problemId: string): Promise<void> {
  const res = await fetch(`${BASE}/problems/${problemId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwOnError(res)
}

export async function apiListTestCases(token: string, problemId: string): Promise<TestCase[]> {
  const res = await fetch(`${BASE}/problems/${problemId}/test-cases`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwOnError(res)
  return res.json()
}

export async function apiCreateTestCase(
  token: string,
  problemId: string,
  data: {
    inputFile: File
    expectedFile: File
    isHidden: boolean
    scoreWeight: number
    timeLimitOverride: number | null
    memoryLimitOverride: number | null
  },
): Promise<TestCase> {
  const form = new FormData()
  form.append('input_file', data.inputFile)
  form.append('expected_file', data.expectedFile)
  form.append('is_hidden', String(data.isHidden))
  form.append('score_weight', String(data.scoreWeight))
  if (data.timeLimitOverride !== null) form.append('time_limit_override', String(data.timeLimitOverride))
  if (data.memoryLimitOverride !== null) form.append('memory_limit_override', String(data.memoryLimitOverride))

  const res = await fetch(`${BASE}/problems/${problemId}/test-cases`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  await throwOnError(res)
  return res.json()
}

export async function apiDeleteTestCase(
  token: string,
  problemId: string,
  testcaseId: string,
): Promise<void> {
  const res = await fetch(`${BASE}/problems/${problemId}/test-cases/${testcaseId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwOnError(res)
}
