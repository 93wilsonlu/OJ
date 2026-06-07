import { vi, describe, test, expect, beforeEach } from 'vitest'
import {
  apiListExams,
  apiGetExam,
  apiCreateExam,
  apiUpdateExam,
  apiDeleteExam,
  apiListExamProblems,
  apiListAssignments,
  apiCreateAssignment,
  apiDeleteAssignment,
  apiGetCandidateExamState,
  apiGetExamAccess,
  apiStartExam,
  apiEndExam,
  apiFullscreenExit,
  apiFullscreenReturn,
  apiCreateProctoringEvent
} from '../src/api/exams'
import {
  apiCreateSubmission,
  apiGetSubmission,
  apiListSubmissions,
  apiCreateSubmissionRun,
  apiGetSubmissionRun
} from '../src/api/submissions'

describe('API helper functions', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  test('apiListExams calls fetch and returns JSON', async () => {
    const mockJson = [{ exam_id: '1', title: 'Exam 1' }]
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockJson,
    } as Response)
    vi.stubGlobal('fetch', mockFetch)

    const res = await apiListExams('token123')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/exams', {
      headers: { Authorization: 'Bearer token123' },
    })
    expect(res).toEqual(mockJson)
  })

  test('apiGetExam calls fetch and returns JSON', async () => {
    const mockJson = { exam_id: '1', title: 'Exam 1' }
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockJson,
    } as Response)
    vi.stubGlobal('fetch', mockFetch)

    const res = await apiGetExam('token123', 'exam-id')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/exams/exam-id', {
      headers: { Authorization: 'Bearer token123' },
    })
    expect(res).toEqual(mockJson)
  })

  test('apiCreateExam calls fetch with POST and body', async () => {
    const mockJson = { exam_id: '1', title: 'New Exam' }
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => mockJson,
    } as Response)
    vi.stubGlobal('fetch', mockFetch)

    const body = {
      title: 'New Exam',
      start_time: '2026-01-01',
      end_time: '2026-01-02',
      show_score: true,
      anti_cheat_enabled: false,
    }
    const res = await apiCreateExam('token123', body)
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/exams', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token123',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    expect(res).toEqual(mockJson)
  })

  test('apiUpdateExam calls fetch with PATCH and body', async () => {
    const mockJson = { exam_id: '1', title: 'Updated' }
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockJson,
    } as Response)
    vi.stubGlobal('fetch', mockFetch)

    const body = { title: 'Updated' }
    const res = await apiUpdateExam('token123', 'exam-id', body)
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/exams/exam-id', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer token123',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    expect(res).toEqual(mockJson)
  })

  test('apiDeleteExam calls fetch with DELETE', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
    } as Response)
    vi.stubGlobal('fetch', mockFetch)

    await apiDeleteExam('token123', 'exam-id')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/exams/exam-id', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token123' },
    })
  })

  test('apiListExamProblems calls fetch', async () => {
    const mockJson = [{ problem_id: 'p1', title: 'Problem 1' }]
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockJson,
    } as Response)
    vi.stubGlobal('fetch', mockFetch)

    const res = await apiListExamProblems('token123', 'exam-id')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/exams/exam-id/problems', {
      headers: { Authorization: 'Bearer token123' },
    })
    expect(res).toEqual(mockJson)
  })

  test('apiListAssignments calls fetch', async () => {
    const mockJson = [{ assignment_id: 'a1' }]
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockJson,
    } as Response)
    vi.stubGlobal('fetch', mockFetch)

    const res = await apiListAssignments('token123', 'exam-id')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/exams/exam-id/assignments', {
      headers: { Authorization: 'Bearer token123' },
    })
    expect(res).toEqual(mockJson)
  })

  test('apiCreateAssignment calls fetch with POST', async () => {
    const mockJson = { assignment_id: 'a1' }
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => mockJson,
    } as Response)
    vi.stubGlobal('fetch', mockFetch)

    const body = { candidate_id: 'c1', problem_id: 'p1' }
    const res = await apiCreateAssignment('token123', 'exam-id', body)
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/exams/exam-id/assignments', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token123',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    expect(res).toEqual(mockJson)
  })

  test('apiDeleteAssignment calls fetch with DELETE', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
    } as Response)
    vi.stubGlobal('fetch', mockFetch)

    await apiDeleteAssignment('token123', 'exam-id', 'a1')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/exams/exam-id/assignments/a1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token123' },
    })
  })

  test('apiGetCandidateExamState calls fetch', async () => {
    const mockJson = { status: 'active' }
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockJson,
    } as Response)
    vi.stubGlobal('fetch', mockFetch)

    const res = await apiGetCandidateExamState('token123', 'exam-id')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/exams/exam-id/candidate-state', {
      headers: { Authorization: 'Bearer token123' },
    })
    expect(res).toEqual(mockJson)
  })

  test('apiGetExamAccess calls fetch', async () => {
    const mockJson = { status_label: 'can_start' }
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockJson,
    } as Response)
    vi.stubGlobal('fetch', mockFetch)

    const res = await apiGetExamAccess('token123', 'exam-id')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/exams/exam-id/access', {
      headers: { Authorization: 'Bearer token123' },
    })
    expect(res).toEqual(mockJson)
  })

  test('apiStartExam, apiEndExam, apiFullscreenExit, apiFullscreenReturn call fetch with POST', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok' }),
    } as Response)
    vi.stubGlobal('fetch', mockFetch)

    await apiStartExam('token123', 'exam-id')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/exams/exam-id/start', {
      method: 'POST',
      headers: { Authorization: 'Bearer token123' },
    })

    await apiEndExam('token123', 'exam-id')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/exams/exam-id/end', {
      method: 'POST',
      headers: { Authorization: 'Bearer token123' },
    })

    await apiFullscreenExit('token123', 'exam-id')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/exams/exam-id/fullscreen-exit', {
      method: 'POST',
      headers: { Authorization: 'Bearer token123' },
    })

    await apiFullscreenReturn('token123', 'exam-id')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/exams/exam-id/fullscreen-return', {
      method: 'POST',
      headers: { Authorization: 'Bearer token123' },
    })
  })

  test('apiCreateProctoringEvent calls fetch with POST', async () => {
    const mockJson = { status: 'active' }
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockJson,
    } as Response)
    vi.stubGlobal('fetch', mockFetch)

    const body = { event_type: 'tab-switch', violating: true }
    const res = await apiCreateProctoringEvent('token123', 'exam-id', body)
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/exams/exam-id/proctoring-events', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token123',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    expect(res).toEqual(mockJson)
  })

  test('apiCreateSubmission calls fetch with POST', async () => {
    const mockJson = { submission_id: 's1' }
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockJson,
    } as Response)
    vi.stubGlobal('fetch', mockFetch)

    const body = { exam_id: 'e1', problem_id: 'p1', language: 'python3', code: 'print()' }
    const res = await apiCreateSubmission('token123', body)
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/submissions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token123',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    expect(res).toEqual(mockJson)
  })

  test('apiGetSubmission calls fetch', async () => {
    const mockJson = { submission_id: 's1' }
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockJson,
    } as Response)
    vi.stubGlobal('fetch', mockFetch)

    const res = await apiGetSubmission('token123', 's1')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/submissions/s1', {
      headers: { Authorization: 'Bearer token123' },
    })
    expect(res).toEqual(mockJson)
  })

  test('apiListSubmissions calls fetch with query params', async () => {
    const mockJson = [{ submission_id: 's1' }]
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockJson,
    } as Response)
    vi.stubGlobal('fetch', mockFetch)

    const res = await apiListSubmissions('token123', { exam_id: 'e1', candidate: 'alice' })
    const expectedUrl = 'http://localhost:3000/api/v1/submissions?exam_id=e1&candidate=alice'
    expect(mockFetch).toHaveBeenCalledWith(expectedUrl, {
      headers: { Authorization: 'Bearer token123' },
    })
    expect(res).toEqual(mockJson)
  })

  test('apiCreateSubmissionRun calls fetch', async () => {
    const mockJson = { run_id: 'r1' }
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockJson,
    } as Response)
    vi.stubGlobal('fetch', mockFetch)

    const body = { exam_id: 'e1', problem_id: 'p1', language: 'python3', code: 'print()', stdin: '' }
    const res = await apiCreateSubmissionRun('token123', body)
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/submissions/run', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token123',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    expect(res).toEqual(mockJson)
  })

  test('apiGetSubmissionRun calls fetch', async () => {
    const mockJson = { run_id: 'r1', status: 'ok' }
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockJson,
    } as Response)
    vi.stubGlobal('fetch', mockFetch)

    const res = await apiGetSubmissionRun('token123', 'r1')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/submissions/run/r1', {
      headers: { Authorization: 'Bearer token123' },
    })
    expect(res).toEqual(mockJson)
  })
})
