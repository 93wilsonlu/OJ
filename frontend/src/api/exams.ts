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

export interface CreateExamSchema {
  title: string;
  description: string;
  start_time: string; // ISO String 格式
  end_time: string;   // ISO String 格式
  show_score: boolean;
}

export async function apiCreateExam(token: string, data: CreateExamSchema): Promise<Exam> {
  const res = await fetch(`${BASE}/exams`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create exam')
  return res.json()
}

export async function apiUpdateExam(
  token: string,
  examId: string,
  data: Partial<CreateExamSchema>
): Promise<Exam> {
  const res = await fetch(`${BASE}/exams/${examId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update exam')
  return res.json()
}

export async function apiDeleteExam(token: string, examId: string): Promise<void> {
  const res = await fetch(`${BASE}/exams/${examId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to delete exam')
}

export async function apiListExamAssignments(token: string, examId: string): Promise<any[]> {
  const res = await fetch(`${BASE}/exams/${examId}/assignments`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch exam assignments')
  return res.json()
}

export async function apiCreateExamAssignment(
  token: string, 
  examId: string, 
  data: { candidate_id: string, problem_id: string }
): Promise<any> {
  const res = await fetch(`${BASE}/exams/${examId}/assignments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create assignment');
  return res.json();
}

export async function apiDeleteExamAssignment(
  token: string, 
  examId: string, 
  assignmentId: string
): Promise<void> {
  const res = await fetch(`${BASE}/exams/${examId}/assignments/${assignmentId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to delete assignment');
}