import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import * as examsApi from '../src/api/exams'
import * as submissionsApi from '../src/api/submissions'
import * as useAuthModule from '../src/hooks/useAuth'
import { useSubmissionPoller } from '../src/hooks/useSubmissionPoller'
import ProblemEditor from '../src/pages/ProblemEditor'
import type { ExamProblem } from '../src/types/exam'

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange, language }: {
    value: string
    onChange: (value: string) => void
    language: string
  }) => (
    <textarea
      aria-label="Code editor"
      data-language={language}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}))

vi.mock('../src/hooks/useSubmissionPoller', () => ({
  useSubmissionPoller: vi.fn(() => ({ data: null, error: null })),
}))

const problem: ExamProblem = {
  assignment_id: 'assignment-1',
  problem_id: 'problem-1',
  title: 'Two Sum',
  description: 'Find two numbers with the requested sum.',
  input_format: 'n target',
  output_format: 'two indices',
  sample_input: '4 9\n2 7 11 15',
  sample_output: '0 1',
  difficulty: 'hard',
  time_limit: 1000,
  memory_limit: 128,
  allowed_langs: ['cpp17'],
}

function mockAuth() {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    user: {
      user_id: 'candidate-1',
      name: 'Candidate',
      email: 'candidate@example.com',
      role: 'candidate',
    },
    accessToken: 'token',
    login: vi.fn(),
    logout: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue('token'),
  })
}

function renderPage(path = '/exams/exam-1/problems/problem-1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/exams/:examId/problems/:problemId" element={<ProblemEditor />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  mockAuth()
  vi.spyOn(examsApi, 'apiListExamProblems').mockResolvedValue([problem])
  vi.spyOn(submissionsApi, 'apiCreateSubmission').mockResolvedValue({
    submission_id: 'submission-1',
    exam_id: 'exam-1',
    problem_id: 'problem-1',
    candidate_id: 'candidate-1',
    language: 'cpp17',
    status: 'pending',
    submitted_at: new Date().toISOString(),
  })
  vi.mocked(useSubmissionPoller).mockReturnValue({ data: null, error: null })
})

describe('ProblemEditor', () => {
  test('renders the solving workspace without candidate difficulty labels', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'Two Sum' })
    expect(screen.getByText('Time: 1000 ms')).toBeInTheDocument()
    expect(screen.getByText('Memory: 128 MB')).toBeInTheDocument()
    expect(screen.getByText('Find two numbers with the requested sum.')).toBeInTheDocument()
    expect(screen.queryByText('hard')).not.toBeInTheDocument()
    expect(screen.queryByText('Difficulty')).not.toBeInTheDocument()
  })

  test('uses the allowed language and submits editor code', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'Two Sum' })
    const languageSelect = screen.getByRole('combobox', { name: 'Language' })
    await waitFor(() => expect(languageSelect).toHaveValue('cpp17'))

    fireEvent.change(screen.getByLabelText('Code editor'), {
      target: { value: 'int main() { return 0; }' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => {
      expect(submissionsApi.apiCreateSubmission).toHaveBeenCalledWith('token', {
        exam_id: 'exam-1',
        problem_id: 'problem-1',
        language: 'cpp17',
        code: 'int main() { return 0; }',
      })
    })
  })

  test('loads reusable submission code into the editor', async () => {
    sessionStorage.setItem(
      'submission-reuse:submission-1',
      JSON.stringify({
        exam_id: 'exam-1',
        problem_id: 'problem-1',
        language: 'cpp17',
        code: 'int reused() { return 42; }',
      }),
    )

    renderPage('/exams/exam-1/problems/problem-1?fromSubmission=submission-1')

    await screen.findByRole('heading', { name: 'Two Sum' })
    const editor = screen.getByLabelText('Code editor')
    await waitFor(() => expect(editor).toHaveValue('int reused() { return 42; }'))
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue('cpp17')
  })
})
