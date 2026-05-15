import { Navigate } from 'react-router-dom'
import { useAuthContext } from '../contexts/AuthContext'
import type { UserOut } from '../types/auth'

interface Props {
  children: React.ReactNode
  roles?: UserOut['role'][]
}

export default function RequireAuth({ children, roles }: Props) {
  const { user, accessToken } = useAuthContext()

  if (!accessToken) return <Navigate to="/login" replace />
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/login" replace />

  return <>{children}</>
}
