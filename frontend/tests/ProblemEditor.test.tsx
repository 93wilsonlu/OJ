import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import * as examsApi from '../src/api/exams'
import * as submissionsApi from '../src/api/submissions'
import * as useAuthModule from '../src/hooks/useAuth'
import { useSubmissionPoller } from '../src/hooks/useSubmissionPoller'
import ProblemEditor from '../src/pages/ProblemEditor'
import AppShell from '../src/components/AppShell'
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

let fullscreenElement: Element | null = null

function mockFullscreenApis() {
  fullscreenElement = null
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenElement,
  })
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  })
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  Object.defineProperty(document.documentElement, 'requestFullscreen', {
    configurable: true,
    value: vi.fn().mockImplementation(async () => {
      fullscreenElement = document.documentElement
      document.dispatchEvent(new Event('fullscreenchange'))
    }),
  })
}

async function enterFullscreen() {
  fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }))
  await waitFor(() => {
    expect(examsApi.apiFullscreenReturn).toHaveBeenCalledWith('token', 'exam-1')
  })
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
        <Route path="/exams/:examId/problems/:problemId" element={
          <AppShell>
            <ProblemEditor />
          </AppShell>
        } />
        <Route path="/exams/:examId/submissions" element={
          <AppShell>
            <div>Submissions</div>
          </AppShell>
        } />
        <Route path="/exams/:examId/submissions/:submissionId" element={
          <AppShell>
            <div>Submission detail</div>
          </AppShell>
        } />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  mockFullscreenApis()
  mockAuth()
  vi.spyOn(examsApi, 'apiListExamProblems').mockResolvedValue([problem])
  vi.spyOn(examsApi, 'apiGetExamAccess').mockResolvedValue({
    exam_id: 'exam-1',
    status_label: 'in_progress',
    can_view_exam: true,
    can_view_problems: true,
    can_start: false,
    can_solve: true,
    can_submit: true,
    can_edit_submission: true,
    can_view_submissions: true,
    requires_fullscreen: true,
    attempt_started_at: new Date().toISOString(),
    attempt_deadline_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    attempt_ended_at: null,
  })
  const attempt = {
    attempt_id: 'attempt-1',
    exam_id: 'exam-1',
    candidate_id: 'candidate-1',
    started_at: new Date().toISOString(),
    deadline_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    ended_at: null,
    status: 'in_progress' as const,
    fullscreen_exit_started_at: null,
    force_end_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  vi.spyOn(examsApi, 'apiFullscreenExit').mockResolvedValue({
    ...attempt,
    fullscreen_exit_started_at: new Date().toISOString(),
    force_end_at: new Date(Date.now() + 5000).toISOString(),
  })
  vi.spyOn(examsApi, 'apiFullscreenReturn').mockResolvedValue(attempt)
  vi.spyOn(submissionsApi, 'apiCreateSubmission').mockResolvedValue({
    submission_id: 'submission-1',
    exam_id: 'exam-1',
    problem_id: 'problem-1',
    candidate_id: 'candidate-1',
    language: 'cpp17',
    status: 'pending',
    submitted_at: new Date().toISOString(),
  })
  vi.spyOn(submissionsApi, 'apiCreateSubmissionRun').mockResolvedValue({
    run_id: 'run-1',
    status: 'queued',
  })
  vi.spyOn(submissionsApi, 'apiGetSubmissionRun').mockResolvedValue({
    run_id: 'run-1',
    status: 'completed',
    verdict: 'OK',
    stdout: 'hello\n',
    stderr: '',
    stdout_truncated: false,
    stderr_truncated: false,
    execution_time: 12,
    memory_usage: 2048,
    error_message: null,
  })
  vi.mocked(useSubmissionPoller).mockReturnValue({ data: null, error: null })
})

describe('ProblemEditor', () => {
  test('requires fullscreen before candidate can work', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Fullscreen required' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
  })

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
    await enterFullscreen()
    const languageSelect = screen.getByRole('combobox', { name: 'Language' })
    await waitFor(() => expect(languageSelect).toHaveValue('cpp17'))

    const editor = screen.getByLabelText('Code editor')
    fireEvent.change(editor, {
      target: { value: 'int main() { return 0; }' },
    })
    await waitFor(() => expect(editor).toHaveValue('int main() { return 0; }'))

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

  test('links to exam-scoped submissions while solving', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'Two Sum' })

    expect(screen.getByRole('link', { name: 'Submissions' })).toHaveAttribute(
      'href',
      '/exams/exam-1/submissions',
    )
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

  test('runs editor code with custom stdin and shows output', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'Two Sum' })
    await enterFullscreen()
    const editor = screen.getByLabelText('Code editor')
    fireEvent.change(editor, {
      target: { value: 'int main() { return 0; }' },
    })
    await waitFor(() => expect(editor).toHaveValue('int main() { return 0; }'))

    fireEvent.change(screen.getByPlaceholderText('Type stdin for this run...'), {
      target: { value: '4 9\n2 7 11 15' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    await waitFor(() => {
      expect(submissionsApi.apiCreateSubmissionRun).toHaveBeenCalledWith('token', {
        exam_id: 'exam-1',
        problem_id: 'problem-1',
        language: 'cpp17',
        code: 'int main() { return 0; }',
        stdin: '4 9\n2 7 11 15',
      })
    })
    expect(await screen.findByText(/hello/)).toBeInTheDocument()
  })

  test('links to submitted result details inside the locked exam scope', async () => {
    vi.mocked(useSubmissionPoller).mockReturnValue({
      data: {
        submission_id: 'submission-1',
        exam_id: 'exam-1',
        problem_id: 'problem-1',
        candidate_id: 'candidate-1',
        language: 'cpp17',
        status: 'completed',
        submitted_at: new Date().toISOString(),
        judge_result: null,
        source_code: 'int main() { return 0; }',
      },
      error: null,
    })

    renderPage()

    await screen.findByRole('heading', { name: 'Two Sum' })

    expect(screen.getByRole('link', { name: 'View submission' })).toHaveAttribute(
      'href',
      '/exams/exam-1/submissions/submission-1',
    )
  })
})
