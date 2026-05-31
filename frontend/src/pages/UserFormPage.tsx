import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiCreateAdminUser, apiGetAdminUser, apiUpdateAdminUser } from '../api/admin'
import { useAuth } from '../hooks/useAuth'
import type { AdminUserRole, AdminUserUpdate } from '../types/admin'

const ROLES: AdminUserRole[] = ['admin', 'interviewer', 'problem_admin', 'candidate']

const inputCls = `w-full bg-oj-surface2 border border-oj-border rounded px-3 py-1.5
                  text-sm text-oj-fg focus:outline-none focus:ring-1 focus:ring-oj-accent`

export default function UserFormPage() {
  const { userId } = useParams<{ userId: string }>()
  const isNew = !userId
  const navigate = useNavigate()
  const { getAccessToken } = useAuth()

  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [role, setRole] = useState<AdminUserRole>('candidate')
  const [isActive, setIsActive] = useState(true)

  useEffect(() => {
    getAccessToken().then(setToken)
  }, [getAccessToken])

  useEffect(() => {
    if (!token || isNew) return
    apiGetAdminUser(token, userId!)
      .then((user) => {
        setName(user.name)
        setEmail(user.email)
        setRole(user.role)
        setIsActive(user.is_active)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, isNew, userId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (isNew && !password) {
      setError('Password is required')
      return
    }
    setSaving(true)
    try {
      if (isNew) {
        await apiCreateAdminUser(token!, { name, email, password, role })
      } else {
        const payload: AdminUserUpdate = { name, email, role, is_active: isActive }
        if (password) payload.password = password
        await apiUpdateAdminUser(token!, userId!, payload)
      }
      navigate('/admin/users')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-oj-fg-muted text-sm font-mono">Loading…</div>
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="mb-6">
        <Link to="/admin/users" className="text-sm text-oj-fg-muted hover:text-oj-fg">
          ← Back to users
        </Link>
        <h1 className="text-xl font-semibold text-oj-fg mt-2">
          {isNew ? 'Create user' : 'Edit user'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-xs text-oj-fg-muted font-mono mb-1 block">
            {isNew ? 'Password' : 'New password (leave blank to keep current)'}
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={isNew}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Confirm password</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required={isNew}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AdminUserRole)}
            className={inputCls}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
        {!isNew && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 accent-oj-accent"
            />
            <span className="text-sm text-oj-fg">Active</span>
          </label>
        )}

        {error && <p className="text-red-700 text-sm font-mono">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Link
            to="/admin/users"
            className="px-3 py-1.5 rounded-md text-sm text-oj-fg-muted hover:bg-oj-surface2"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-1.5 rounded-md text-sm font-medium bg-oj-accent text-white
                       hover:bg-oj-accent-dim disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving
              ? (isNew ? 'Creating…' : 'Saving…')
              : (isNew ? 'Create user' : 'Save changes')}
          </button>
        </div>
      </form>
    </div>
  )
}
