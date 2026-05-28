import type {
  ExamResults,
  AdminUser,
  AdminUserCreate,
  AdminUserList,
  AdminUserRole,
  AdminUserUpdate,
} from '../types/admin'

import { throwOnError } from './http'

const BASE = '/api/v1'

export async function apiListAdminUsers(
  token: string,
  params: {
    page?: number
    pageSize?: number
    role?: AdminUserRole | ''
    name?: string
  } = {},
): Promise<AdminUserList> {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.pageSize) query.set('page_size', String(params.pageSize))
  if (params.role) query.set('role', params.role)
  if (params.name) query.set('name', params.name)

  const suffix = query.size ? `?${query}` : ''
  const res = await fetch(`${BASE}/admin/users${suffix}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwOnError(res)
  return res.json()
}

export async function apiCreateAdminUser(
  token: string,
  body: AdminUserCreate,
): Promise<AdminUser> {
  const res = await fetch(`${BASE}/admin/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  await throwOnError(res)
  return res.json()
}

export async function apiUpdateAdminUser(
  token: string,
  userId: string,
  body: AdminUserUpdate,
): Promise<AdminUser> {
  const res = await fetch(`${BASE}/admin/users/${userId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  await throwOnError(res)
  return res.json()
}

export async function apiGetAdminUser(token: string, userId: string): Promise<AdminUser> {
  const res = await fetch(`${BASE}/admin/users/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwOnError(res)
  return res.json()
}

export async function apiDeleteAdminUser(token: string, userId: string): Promise<void> {
  const res = await fetch(`${BASE}/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwOnError(res)
}

export async function apiGetExamResults(token: string, examId: string): Promise<ExamResults> {
  const res = await fetch(`${BASE}/admin/exams/${examId}/results`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwOnError(res)
  return res.json()
}
