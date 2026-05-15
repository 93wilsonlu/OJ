import { Navigate } from 'react-router-dom'
import { useAuthContext } from '../contexts/AuthContext'

const ROLE_ROUTES: Record<string, string> = {
  candidate:     '/exams',
  interviewer:   '/exams',
  problem_admin: '/problems',
  admin:         '/admin/users',
}

export default function RoleHome() {
  const { user } = useAuthContext()
  const dest = user ? (ROLE_ROUTES[user.role] ?? '/dashboard') : '/login'
  return <Navigate to={dest} replace />
}
