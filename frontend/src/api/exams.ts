import type { Exam, ExamProblem } from '../types/exam'

const BASE = '/api/v1'

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

export async function apiListExamProblems(token: string, examId: string): Promise<ExamProblem[]> {
  const res = await fetch(`${BASE}/exams/${examId}/problems`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch exam problems')
  return res.json()
}
