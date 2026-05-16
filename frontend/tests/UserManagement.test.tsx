import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import * as adminApi from '../src/api/admin'
import * as useAuthModule from '../src/hooks/useAuth'
import UserManagement from '../src/pages/UserManagement'
import type { AdminUser } from '../src/types/admin'

const currentAdmin = {
  user_id: 'admin-1',
  name: 'Admin User',
  email: 'admin@example.com',
  role: 'admin' as const,
}

const adminUser: AdminUser = {
  user_id: 'admin-1',
  name: 'Admin User',
  email: 'admin@example.com',
  role: 'admin',
  is_active: true,
  created_at: '2026-05-16T00:00:00Z',
  updated_at: '2026-05-16T00:00:00Z',
}

const interviewerUser: AdminUser = {
  user_id: 'interviewer-1',
  name: 'Interviewer User',
  email: 'interviewer@example.com',
  role: 'interviewer',
  is_active: true,
  created_at: '2026-05-15T00:00:00Z',
  updated_at: '2026-05-15T00:00:00Z',
}

function mockAuth() {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    user: currentAdmin,
    accessToken: 'token',
    login: vi.fn(),
    logout: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue('token'),
  })
}

function mockList(items = [adminUser, interviewerUser]) {
  return vi.spyOn(adminApi, 'apiListAdminUsers').mockResolvedValue({
    items,
    total: items.length,
    page: 1,
    page_size: 10,
    total_pages: 1,
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <UserManagement />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  mockAuth()
})

describe('UserManagement', () => {
  test('loads and renders users from the admin API', async () => {
    const listUsers = mockList()

    renderPage()

    await waitFor(() => expect(listUsers).toHaveBeenCalledWith(
      'token',
      { page: 1, pageSize: 10, role: '', name: '' },
    ))
    expect(screen.getByDisplayValue('Admin User')).toBeInTheDocument()
    expect(screen.getByText('interviewer@example.com')).toBeInTheDocument()
  })

  test('prevents self demotion and self deactivation in the UI', async () => {
    mockList()

    renderPage()

    await screen.findByDisplayValue('Admin User')
    const selfRow = screen.getByDisplayValue('Admin User').closest('tr')
    expect(selfRow).not.toBeNull()
    expect(selfRow!.querySelector('select')).toBeDisabled()
    expect(
      screen.getAllByRole('button', { name: 'Deactivate' })[0],
    ).toBeDisabled()
  })

  test('creates a new user from the modal and refreshes the list', async () => {
    const user = userEvent.setup()
    const listUsers = mockList()
    const createUser = vi.spyOn(adminApi, 'apiCreateAdminUser').mockResolvedValue({
      user_id: 'candidate-1',
      name: 'Candidate User',
      email: 'candidate@example.com',
      role: 'candidate',
      is_active: true,
      created_at: '2026-05-16T00:00:00Z',
      updated_at: '2026-05-16T00:00:00Z',
    })

    renderPage()
    await screen.findByDisplayValue('Admin User')

    await user.click(screen.getByRole('button', { name: '+ New user' }))
    await user.type(screen.getByLabelText('Name'), 'Candidate User')
    await user.type(screen.getByLabelText('Email'), 'candidate@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create user' }))

    await waitFor(() => expect(createUser).toHaveBeenCalledWith('token', {
      name: 'Candidate User',
      email: 'candidate@example.com',
      password: 'password123',
      role: 'candidate',
    }))
    expect(listUsers).toHaveBeenCalledTimes(2)
  })

  test('deactivates another account after confirmation', async () => {
    const user = userEvent.setup()
    mockList()
    const deactivate = vi.spyOn(adminApi, 'apiDeactivateAdminUser').mockResolvedValue()
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderPage()
    await screen.findByDisplayValue('Interviewer User')

    await user.click(screen.getAllByRole('button', { name: 'Deactivate' })[1])

    await waitFor(() => expect(deactivate).toHaveBeenCalledWith('token', 'interviewer-1'))
    expect(screen.getByText('Inactive')).toBeInTheDocument()
  })
})
