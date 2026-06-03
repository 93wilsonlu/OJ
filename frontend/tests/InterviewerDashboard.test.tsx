import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'

import * as useAuthHook from '../src/hooks/useAuth'
import * as examsApi from '../src/api/exams'
import InterviewerDashboard from '../src/pages/InterviewerDashboard'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: vi.fn(),
  }
})

describe('InterviewerDashboard', () => {
  const mockNavigate = vi.fn()
  const mockGetAccessToken = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useNavigate).mockReturnValue(mockNavigate)
    vi.spyOn(useAuthHook, 'useAuth').mockReturnValue({
      getAccessToken: mockGetAccessToken,
    } as any)
  })

  it('1. The loading status should be displayed during initial rendering.', () => {
    mockGetAccessToken.mockReturnValue(new Promise(() => {}))

    // Act
    render(
      <MemoryRouter>
        <InterviewerDashboard />
      </MemoryRouter>
    )

    // Assert
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('2. API error should display error message', async () => {
    // Arrange
    mockGetAccessToken.mockResolvedValue('fake-token')
    vi.spyOn(examsApi, 'apiListExams').mockRejectedValue(new Error('Network failure'))

    // Act
    render(
      <MemoryRouter>
        <InterviewerDashboard />
      </MemoryRouter>
    )

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Error: Network failure')).toBeInTheDocument()
    })
  })

  it('3. Successfully loads data and renders exam list', async () => {
    const now = Date.now()
    const mockExams = [
      { exam_id: '1', title: 'Past Exam', start_time: new Date(now - 10000).toISOString(), end_time: new Date(now - 5000).toISOString() },
      { exam_id: '2', title: 'Running Exam', start_time: new Date(now - 5000).toISOString(), end_time: new Date(now + 5000).toISOString() },
      { exam_id: '3', title: 'Future Exam', start_time: new Date(now + 5000).toISOString(), end_time: new Date(now + 10000).toISOString() },
    ]
    mockGetAccessToken.mockResolvedValue('fake-token')
    vi.spyOn(examsApi, 'apiListExams').mockResolvedValue(mockExams as any)

    render(
      <MemoryRouter>
        <InterviewerDashboard />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Exam Management')).toBeInTheDocument()
    })

    expect(screen.getByText('Past Exam')).toBeInTheDocument()
    expect(screen.getByText('Running Exam')).toBeInTheDocument()
    expect(screen.getByText('Future Exam')).toBeInTheDocument()
  })

  it('4. Can filter exams using search box and status tags', async () => {
    const user = userEvent.setup()
    
    const now = Date.now()
    const mockExams = [
      { exam_id: '1', title: 'Backend Math Test', start_time: new Date(now - 10000).toISOString(), end_time: new Date(now - 5000).toISOString() }, // expired
      { exam_id: '2', title: 'Frontend React Test', start_time: new Date(now - 5000).toISOString(), end_time: new Date(now + 5000).toISOString() }, // running
    ]
    mockGetAccessToken.mockResolvedValue('fake-token')
    vi.spyOn(examsApi, 'apiListExams').mockResolvedValue(mockExams as any)

    render(
      <MemoryRouter>
        <InterviewerDashboard />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Backend Math Test')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search exams…')
    await user.type(searchInput, 'react')

    expect(screen.queryByText('Backend Math Test')).not.toBeInTheDocument()
    expect(screen.getByText('Frontend React Test')).toBeInTheDocument()

    await user.clear(searchInput)
    const expiredButton = screen.getByRole('button', { name: 'Expired' })
    await user.click(expiredButton)

    expect(screen.getByText('Backend Math Test')).toBeInTheDocument()
    expect(screen.queryByText('Frontend React Test')).not.toBeInTheDocument()
  })

  it('5. When the exam list is empty, it should show a prompt message', async () => {
    mockGetAccessToken.mockResolvedValue('fake-token')
    vi.spyOn(examsApi, 'apiListExams').mockResolvedValue([])    

    render(
      <MemoryRouter>
        <InterviewerDashboard />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('No exams yet.')).toBeInTheDocument()
    })
  })

  it('6. Clicking the "+ New Exam" button should trigger navigation', async () => {
    const user = userEvent.setup()
    mockGetAccessToken.mockResolvedValue('fake-token')
    vi.spyOn(examsApi, 'apiListExams').mockResolvedValue([])

    render(
      <MemoryRouter>
        <InterviewerDashboard />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Exam Management')).toBeInTheDocument()
    })

    const newExamBtn = screen.getByRole('button', { name: '+ New Exam' })
    await user.click(newExamBtn)

    expect(mockNavigate).toHaveBeenCalledWith('/exams/new')
  })
})