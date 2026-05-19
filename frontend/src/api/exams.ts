import type { Exam, ExamAssignment, ExamCreate, ExamProblem, ExamUpdate } from '../types/exam'

const BASE = '/api/v1'

async function throwOnError(res: Response) {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`)
  }
}

export async function apiListExams(token: string): Promise<Exam[]> {
  const res = await fetch(`${BASE}/exams`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch exams')
  return res.json()
}

export async function apiGetExam(token: string, examId: string): Promise<Exam> {
  const res = await fetch(`${BASE}/exams/${examId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Exam not found')
  return res.json()
}

export async function apiCreateExam(token: string, body: ExamCreate): Promise<Exam> {
  const res = await fetch(`${BASE}/exams`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  await throwOnError(res)
  return res.json()
}

export async function apiUpdateExam(token: string, examId: string, body: ExamUpdate): Promise<Exam> {
  const res = await fetch(`${BASE}/exams/${examId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  await throwOnError(res)
  return res.json()
}

export async function apiDeleteExam(token: string, examId: string): Promise<void> {
  const res = await fetch(`${BASE}/exams/${examId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwOnError(res)
}

export async function apiListExamProblems(token: string, examId: string): Promise<ExamProblem[]> {
  const res = await fetch(`${BASE}/exams/${examId}/problems`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch exam problems')
  return res.json()
}

export async function apiListAssignments(token: string, examId: string): Promise<ExamAssignment[]> {
  const res = await fetch(`${BASE}/exams/${examId}/assignments`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwOnError(res)
  return res.json()
}

export async function apiCreateAssignment(
  token: string,
  examId: string,
  body: { candidate_id: string; problem_id: string },
): Promise<ExamAssignment> {
  const res = await fetch(`${BASE}/exams/${examId}/assignments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  await throwOnError(res)
  return res.json()
}

export async function apiDeleteAssignment(
  token: string,
  examId: string,
  assignmentId: string,
): Promise<void> {
  const res = await fetch(`${BASE}/exams/${examId}/assignments/${assignmentId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwOnError(res)
}
