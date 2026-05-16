export type AdminUserRole = 'admin' | 'interviewer' | 'problem_admin' | 'candidate'

export interface AdminUser {
  user_id: string
  name: string
  email: string
  role: AdminUserRole
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AdminUserList {
  items: AdminUser[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface AdminUserCreate {
  name: string
  email: string
  password: string
  role: AdminUserRole
}

export interface AdminUserUpdate {
  name?: string
  email?: string
  role?: AdminUserRole
}
