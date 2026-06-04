import type {
  Exam,
  ExamAccess,
  ExamAssignment,
  ExamAttempt,
  ExamCandidateState,
  ExamCreate,
  ExamProblem,
  ExamUpdate,
  ProctoringEventCreate,
} from '../types/exam'
import { throwOnApiError } from './errors'

const BASE = '/api/v1'

async function throwOnError(res: Response) {
  await throwOnApiError(res, `HTTP ${res.status}`)
}

export async function apiListExams(token: string): Promise<Exam[]> {
  const res = await fetch(`${BASE}/exams`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwOnError(res)
  return res.json()
}

export async function apiGetExam(token: string, examId: string): Promise<Exam> {
  const res = await fetch(`${BASE}/exams/${examId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwOnError(res)
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
  await throwOnError(res)
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

export async function apiGetCandidateExamState(
  token: string,
  examId: string,
): Promise<ExamCandidateState> {
  const res = await fetch(`${BASE}/exams/${examId}/candidate-state`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwOnError(res)
  return res.json()
}

export async function apiGetExamAccess(token: string, examId: string): Promise<ExamAccess> {
  const res = await fetch(`${BASE}/exams/${examId}/access`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwOnError(res)
  return res.json()
}

export async function apiStartExam(token: string, examId: string): Promise<ExamAttempt> {
  const res = await fetch(`${BASE}/exams/${examId}/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwOnError(res)
  return res.json()
}

export async function apiEndExam(token: string, examId: string): Promise<ExamAttempt> {
  const res = await fetch(`${BASE}/exams/${examId}/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwOnError(res)
  return res.json()
}

export async function apiFullscreenExit(token: string, examId: string): Promise<ExamAttempt> {
  const res = await fetch(`${BASE}/exams/${examId}/fullscreen-exit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwOnError(res)
  return res.json()
}

export async function apiFullscreenReturn(token: string, examId: string): Promise<ExamAttempt> {
  const res = await fetch(`${BASE}/exams/${examId}/fullscreen-return`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwOnError(res)
  return res.json()
}

export async function apiCreateProctoringEvent(
  token: string,
  examId: string,
  body: ProctoringEventCreate,
): Promise<ExamCandidateState> {
  const res = await fetch(`${BASE}/exams/${examId}/proctoring-events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  await throwOnError(res)
  return res.json()
}
