import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthContext } from '../contexts/AuthContext'
import type { UserOut } from '../types/auth'

interface Props {
  children: ReactNode
  roles?: UserOut['role'][]
}

export default function RequireAuth({ children, roles }: Props) {
  const { user, accessToken, loading } = useAuthContext()

  // Hold rendering until the initial token-recovery attempt is done
  if (loading) return null

  if (!accessToken) return <Navigate to="/login" replace />
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/403" replace />

  return <>{children}</>
}
