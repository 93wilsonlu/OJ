import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import * as examsApi from '../src/api/exams'
import * as useAuthModule from '../src/hooks/useAuth'
import ExamView from '../src/pages/ExamView'
import type { Exam, ExamProblem } from '../src/types/exam'

function isoFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

function makeExam(overrides: Partial<Exam> = {}): Exam {
  return {
    exam_id: 'exam-1',
    title: 'Sample Coding Interview',
    description: 'Solve the assigned problems.',
    start_time: isoFromNow(-30),
    end_time: isoFromNow(90),
    show_score: true,
    created_by: null,
    created_at: isoFromNow(-60),
    ...overrides,
  }
}

const problems: ExamProblem[] = [
  {
    assignment_id: 'assignment-1',
    problem_id: 'problem-1',
    title: 'Two Sum',
    description: 'Add two numbers.',
    input_format: null,
    output_format: null,
    sample_input: null,
    sample_output: null,
    difficulty: 'easy',
    time_limit: 1000,
    memory_limit: 128,
    allowed_langs: ['python3', 'cpp17'],
  },
  {
    assignment_id: 'assignment-2',
    problem_id: 'problem-2',
    title: 'Graph Walk',
    description: 'Walk the graph.',
    input_format: null,
    output_format: null,
    sample_input: null,
    sample_output: null,
    difficulty: 'medium',
    time_limit: 2000,
    memory_limit: 256,
    allowed_langs: ['cpp17'],
  },
]

function mockAuth(role: 'candidate' | 'interviewer' = 'candidate') {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    user: {
      user_id: `${role}-1`,
      name: role,
      email: `${role}@example.com`,
      role,
    },
    accessToken: 'token',
    login: vi.fn(),
    logout: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue('token'),
  })
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/exams/exam-1']}>
      <Routes>
        <Route path="/exams/:examId" element={<ExamView />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  mockAuth()
  vi.spyOn(examsApi, 'apiGetExam').mockResolvedValue(makeExam())
  vi.spyOn(examsApi, 'apiListExamProblems').mockResolvedValue(problems)
})

describe('ExamView', () => {
  test('renders exam summary and dense problem table for active candidate exams', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'Sample Coding Interview' })
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Start Time')).toBeInTheDocument()
    expect(screen.getByText('End Time')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Problems' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Difficulty' })).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Limits' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Languages' })).toBeInTheDocument()
    expect(screen.getByText('Two Sum')).toBeInTheDocument()
    expect(screen.getByText('python3, cpp17')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Solve' })).toHaveLength(2)
  })

  test('blocks candidate problem actions before exam start', async () => {
    vi.spyOn(examsApi, 'apiGetExam').mockResolvedValue(makeExam({
      start_time: isoFromNow(60),
      end_time: isoFromNow(120),
    }))

    renderPage()

    await screen.findByRole('heading', { name: 'Sample Coding Interview' })
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
    expect(screen.getAllByText('Not started')).toHaveLength(2)
    expect(screen.queryByRole('link', { name: 'Solve' })).not.toBeInTheDocument()
  })
})
