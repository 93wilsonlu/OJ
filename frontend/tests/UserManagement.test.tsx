import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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
    <MemoryRouter initialEntries={['/admin/users']}>
      <Routes>
        <Route path="/admin/users" element={<UserManagement />} />
        <Route path="/admin/users/new" element={<div>New user page</div>} />
        <Route path="/admin/users/:userId/edit" element={<div>Edit user page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

function rowFor(name: string) {
  const row = screen.getByText(name).closest('tr')
  expect(row).not.toBeNull()
  return within(row!)
}

beforeEach(() => {
  vi.restoreAllMocks()
  mockAuth()
})

describe('UserManagement', () => {
  test('loads and renders users as read-only rows', async () => {
    const listUsers = mockList()

    renderPage()

    await waitFor(() => expect(listUsers).toHaveBeenCalledWith(
      'token',
      { page: 1, pageSize: 10, role: '', name: '' },
    ))
    expect(await screen.findByText('Admin User')).toBeInTheDocument()
    expect(screen.getByText('interviewer@example.com')).toBeInTheDocument()
    // Rows are read-only: no inline name input / role select.
    expect(screen.queryByDisplayValue('Admin User')).toBeNull()
    expect(document.querySelector('tbody select')).toBeNull()
  })

  test('disables deleting your own account', async () => {
    mockList()

    renderPage()
    await screen.findByText('Admin User')

    expect(rowFor('Admin User').getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(rowFor('Interviewer User').getByRole('button', { name: 'Delete' })).toBeEnabled()
  })

  test('navigates to the create page instead of opening a modal', async () => {
    const user = userEvent.setup()
    mockList()

    renderPage()
    await screen.findByText('Admin User')

    await user.click(screen.getByRole('button', { name: '+ New user' }))
    expect(await screen.findByText('New user page')).toBeInTheDocument()
  })

  test('navigates to the edit page for a user', async () => {
    const user = userEvent.setup()
    mockList()

    renderPage()
    await screen.findByText('Interviewer User')

    await user.click(rowFor('Interviewer User').getByRole('button', { name: 'Edit' }))
    expect(await screen.findByText('Edit user page')).toBeInTheDocument()
  })

  test('searches by name only when the search button is clicked', async () => {
    const user = userEvent.setup()
    const listUsers = mockList()

    renderPage()
    await screen.findByText('Admin User')
    expect(listUsers).toHaveBeenCalledTimes(1)

    await user.type(screen.getByPlaceholderText('Search name or email'), 'Interviewer')
    // Typing alone must not trigger a refetch.
    expect(listUsers).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /search/i }))
    await waitFor(() => expect(listUsers).toHaveBeenLastCalledWith(
      'token',
      { page: 1, pageSize: 10, role: '', name: 'Interviewer' },
    ))
  })

  test('deletes a user after confirmation and refreshes the list', async () => {
    const user = userEvent.setup()
    const listUsers = mockList()
    const deleteUser = vi.spyOn(adminApi, 'apiDeleteAdminUser').mockResolvedValue()
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderPage()
    await screen.findByText('Interviewer User')

    await user.click(rowFor('Interviewer User').getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(deleteUser).toHaveBeenCalledWith('token', 'interviewer-1'))
    expect(listUsers).toHaveBeenCalledTimes(2)
  })

  test('does not delete when confirmation is cancelled', async () => {
    const user = userEvent.setup()
    mockList()
    const deleteUser = vi.spyOn(adminApi, 'apiDeleteAdminUser').mockResolvedValue()
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    renderPage()
    await screen.findByText('Interviewer User')

    await user.click(rowFor('Interviewer User').getByRole('button', { name: 'Delete' }))
    expect(deleteUser).not.toHaveBeenCalled()
  })
})
