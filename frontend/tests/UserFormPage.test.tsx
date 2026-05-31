import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import * as adminApi from '../src/api/admin'
import * as useAuthModule from '../src/hooks/useAuth'
import UserFormPage from '../src/pages/UserFormPage'

const mockAuth = () => {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    user: { user_id: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'admin' },
    accessToken: 'token',
    login: vi.fn(),
    logout: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue('token'),
  })
}

const renderPage = (path = '/users/new') => {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/users/new" element={<UserFormPage />} />
        <Route path="/users/:userId/edit" element={<UserFormPage />} />
        <Route path="/admin/users" element={<div>Users List</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  mockAuth()
})

describe('UserFormPage', () => {
  test('renders create user form with name field', async () => {
    renderPage('/users/new')

    await waitFor(() => {
      expect(screen.getByLabelText(/Name/)).toBeInTheDocument()
    })
  })

  test('renders email input field', async () => {
    renderPage('/users/new')

    await waitFor(() => {
      expect(screen.getByLabelText(/Email/)).toBeInTheDocument()
    })
  })

  test('loads existing user for editing', async () => {
    vi.spyOn(adminApi, 'apiGetAdminUser').mockResolvedValue({
      user_id: 'user123',
      name: 'Jane Smith',
      email: 'jane@example.com',
      role: 'interviewer',
      is_active: true,
      created_at: '',
      updated_at: '',
    })

    renderPage('/users/user123/edit')

    await waitFor(() => {
      expect(screen.getByDisplayValue('Jane Smith')).toBeInTheDocument()
    })
  })

  test('shows back link to users list', async () => {
    renderPage('/users/new')

    await waitFor(() => {
      expect(screen.getByText('← Back to users')).toBeInTheDocument()
    })
  })

  test('has role selection dropdown with candidate default', async () => {
    renderPage('/users/new')

    await waitFor(() => {
      const roleSelect = screen.getByDisplayValue('candidate')
      expect(roleSelect).toBeInTheDocument()
    })
  })

  test('submits form with valid password', async () => {
    const user = userEvent.setup()
    const createUser = vi.spyOn(adminApi, 'apiCreateAdminUser').mockResolvedValue({
      user_id: 'user123',
      name: 'John',
      email: 'john@example.com',
      role: 'candidate',
      is_active: true,
      created_at: '',
      updated_at: '',
    })

    renderPage('/users/new')

    const nameInput = screen.getByLabelText(/Name/)
    const emailInput = screen.getByLabelText(/Email/)

    await user.type(nameInput, 'John')
    await user.type(emailInput, 'john@example.com')

    const pwFields = Array.from(document.querySelectorAll('input[type="password"]'))
    await user.type(pwFields[0] as HTMLInputElement, 'pass123')
    await user.type(pwFields[1] as HTMLInputElement, 'pass123')

    const buttons = screen.getAllByRole('button')
    const submitBtn = buttons[buttons.length - 1]
    await user.click(submitBtn)

    await waitFor(() => {
      expect(createUser).toHaveBeenCalled()
    })
  })

  test('displays email input field', async () => {
    renderPage('/users/new')

    await waitFor(() => {
      const emailInput = screen.getByLabelText(/Email/) as HTMLInputElement
      expect(emailInput.type).toBe('email')
    })
  })

  test('displays role selector with all role options', async () => {
    renderPage('/users/new')

    await waitFor(() => {
      const select = screen.getByDisplayValue('candidate')
      expect(select).toBeInTheDocument()
    })
  })

  test('edit mode shows different password label', async () => {
    vi.spyOn(adminApi, 'apiGetAdminUser').mockResolvedValue({
      user_id: 'user123',
      name: 'Existing User',
      email: 'existing@example.com',
      role: 'interviewer',
      is_active: true,
      created_at: '',
      updated_at: '',
    })

    renderPage('/users/user123/edit')

    await waitFor(() => {
      expect(screen.getByText(/New password/)).toBeInTheDocument()
    })
  })
})
