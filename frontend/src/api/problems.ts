import type { Problem, ProblemCreate, ProblemUpdate, TestCase } from '../types/problem'
import { throwOnApiError } from './errors'

const BASE = '/api/v1'

async function throwOnError(res: Response) {
  await throwOnApiError(res, `HTTP ${res.status}`)
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
    name?: string | null
    timeLimitOverride: number | null
    memoryLimitOverride: number | null
  },
): Promise<TestCase> {
  const form = new FormData()
  form.append('input_file', data.inputFile)
  form.append('expected_file', data.expectedFile)
  form.append('is_hidden', String(data.isHidden))
  form.append('score_weight', String(data.scoreWeight))
  if (data.name) form.append('name', data.name)
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

export async function apiUpdateTestCase(
  token: string,
  problemId: string,
  testcaseId: string,
  data: {
    isHidden: boolean
    scoreWeight: number
    name?: string | null
    timeLimitOverride: number | null
    memoryLimitOverride: number | null
    inputFile?: File | null
    expectedFile?: File | null
  },
): Promise<TestCase> {
  const form = new FormData()
  form.append('is_hidden', String(data.isHidden))
  form.append('score_weight', String(data.scoreWeight))
  if (data.name) form.append('name', data.name)
  if (data.timeLimitOverride !== null) form.append('time_limit_override', String(data.timeLimitOverride))
  if (data.memoryLimitOverride !== null) form.append('memory_limit_override', String(data.memoryLimitOverride))
  if (data.inputFile) form.append('input_file', data.inputFile)
  if (data.expectedFile) form.append('expected_file', data.expectedFile)

  const res = await fetch(`${BASE}/problems/${problemId}/testcases/${testcaseId}`, {
    method: 'PATCH',
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
  const res = await fetch(`${BASE}/problems/${problemId}/testcases/${testcaseId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwOnError(res)
}
