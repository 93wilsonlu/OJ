import { useNavigate } from 'react-router-dom'
import { apiLogin } from '../api/auth'
import { useAuthContext } from '../contexts/AuthContext'

export function useAuth() {
  const { user, accessToken, setAuth, clearAuth, getAccessToken } = useAuthContext()
  const navigate = useNavigate()

  async function login(email: string, password: string) {
    const data = await apiLogin(email, password)
    setAuth(data.user, data.access_token, data.refresh_token)
    navigate('/')
  }

  async function logout() {
    await clearAuth()
    navigate('/login')
  }

  return { user, accessToken, login, logout, getAccessToken }
}
