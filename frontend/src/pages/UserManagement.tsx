import { useEffect, useState } from 'react'
import {
  apiCreateAdminUser,
  apiDeactivateAdminUser,
  apiListAdminUsers,
  apiUpdateAdminUser,
} from '../api/admin'
import { useAuth } from '../hooks/useAuth'
import type {
  AdminUser,
  AdminUserCreate,
  AdminUserRole,
} from '../types/admin'

const ROLES: AdminUserRole[] = ['admin', 'interviewer', 'problem_admin', 'candidate']
const PAGE_SIZE = 10

const EMPTY_CREATE_FORM: AdminUserCreate = {
  name: '',
  email: '',
  password: '',
  role: 'candidate',
}

const inputCls = `w-full bg-oj-surface2 border border-oj-border rounded px-3 py-1.5
                  text-sm text-oj-fg focus:outline-none focus:ring-1 focus:ring-oj-accent`

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function CreateUserModal({
  open,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean
  saving: boolean
  error: string | null
  onClose: () => void
  onSubmit: (payload: AdminUserCreate) => Promise<void>
}) {
  const [form, setForm] = useState<AdminUserCreate>(EMPTY_CREATE_FORM)

  useEffect(() => {
    if (open) setForm(EMPTY_CREATE_FORM)
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-xl border border-oj-border bg-oj-surface p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-oj-fg">Create user</h2>
          <button onClick={onClose} className="text-oj-fg-muted hover:text-oj-fg">×</button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Password</span>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Role</span>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AdminUserRole }))}
              className={inputCls}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="text-red-400 text-sm font-mono mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm text-oj-fg-muted hover:bg-oj-surface2"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(form)}
            disabled={saving}
            className="px-4 py-1.5 rounded-md text-sm font-medium bg-oj-accent text-oj-bg
                       hover:bg-oj-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Creating…' : 'Create user'}
          </button>
        </div>
      </div>
    </div>
  )
}

function UserRow({
  user,
  currentUserId,
  saving,
  onSave,
  onDeactivate,
}: {
  user: AdminUser
  currentUserId: string | undefined
  saving: boolean
  onSave: (userId: string, payload: { name: string; role: AdminUserRole }) => Promise<void>
  onDeactivate: (user: AdminUser) => Promise<void>
}) {
  const [name, setName] = useState(user.name)
  const [role, setRole] = useState<AdminUserRole>(user.role)
  const dirty = name !== user.name || role !== user.role
  const isSelf = user.user_id === currentUserId

  useEffect(() => {
    setName(user.name)
    setRole(user.role)
  }, [user.name, user.role])

  return (
    <tr className="border-b border-oj-border last:border-0">
      <td className="px-4 py-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${inputCls} min-w-[180px]`}
          disabled={!user.is_active}
        />
      </td>
      <td className="px-4 py-3 text-oj-fg-muted">{user.email}</td>
      <td className="px-4 py-3">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as AdminUserRole)}
          className={inputCls}
          disabled={!user.is_active || isSelf}
        >
          {ROLES.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <span className={user.is_active ? 'text-green-400' : 'text-slate-500'}>
          {user.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="px-4 py-3 text-oj-fg-muted font-mono text-xs">{formatDate(user.created_at)}</td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-2">
          <button
            onClick={() => onSave(user.user_id, { name: name.trim(), role })}
            disabled={!dirty || saving || !user.is_active}
            className="px-3 py-1.5 rounded-md text-xs text-oj-accent hover:bg-oj-accent/10
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save
          </button>
          <button
            onClick={() => onDeactivate(user)}
            disabled={!user.is_active || isSelf || saving}
            className="px-3 py-1.5 rounded-md text-xs text-red-400 hover:bg-red-400/10
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Deactivate
          </button>
        </div>
      </td>
    </tr>
  )
}

export default function UserManagement() {
  const { user: currentUser, getAccessToken } = useAuth()
  const [token, setToken] = useState<string | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<AdminUserRole | ''>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    getAccessToken().then(setToken)
  }, [getAccessToken])

  useEffect(() => {
    if (!token) return
    setLoading(true)
    apiListAdminUsers(token, { page, pageSize: PAGE_SIZE, role, name: query })
      .then((data) => {
        setUsers(data.items)
        setTotal(data.total)
        setTotalPages(data.total_pages)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, page, role, query])

  async function reload(targetPage = page) {
    if (!token) return
    const data = await apiListAdminUsers(token, {
      page: targetPage,
      pageSize: PAGE_SIZE,
      role,
      name: query,
    })
    setUsers(data.items)
    setTotal(data.total)
    setTotalPages(data.total_pages)
  }

  async function handleCreate(payload: AdminUserCreate) {
    if (!token) return
    setCreating(true)
    setCreateError(null)
    try {
      await apiCreateAdminUser(token, payload)
      setCreateOpen(false)
      setPage(1)
      await reload(1)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  async function handleSave(userId: string, payload: { name: string; role: AdminUserRole }) {
    if (!token) return
    setSavingId(userId)
    setError(null)
    try {
      const updated = await apiUpdateAdminUser(token, userId, payload)
      setUsers((items) => items.map((item) => item.user_id === userId ? updated : item))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSavingId(null)
    }
  }

  async function handleDeactivate(target: AdminUser) {
    if (!token) return
    if (!confirm(`Deactivate ${target.name}? They will no longer be able to sign in.`)) return
    setSavingId(target.user_id)
    setError(null)
    try {
      await apiDeactivateAdminUser(token, target.user_id)
      setUsers((items) => items.map((item) => (
        item.user_id === target.user_id ? { ...item, is_active: false } : item
      )))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deactivate failed')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-oj-fg">User Management</h1>
          <p className="text-sm text-oj-fg-muted mt-1">{total} users</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2 rounded-md text-sm font-medium bg-oj-accent text-oj-bg
                     hover:bg-oj-accent/90"
        >
          + New user
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_220px] mb-4">
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1) }}
          placeholder="Search name or email"
          className={inputCls}
        />
        <select
          value={role}
          onChange={(e) => { setRole(e.target.value as AdminUserRole | ''); setPage(1) }}
          className={inputCls}
        >
          <option value="">All roles</option>
          {ROLES.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-red-400 text-sm font-mono mb-4">Error: {error}</p>}

      {loading ? (
        <div className="p-8 text-oj-fg-muted text-sm font-mono">Loading users…</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-oj-border">
          <table className="w-full text-sm">
            <thead className="bg-oj-surface/50 text-oj-fg-muted">
              <tr>
                <th className="text-left px-4 py-2.5">Name</th>
                <th className="text-left px-4 py-2.5">Email</th>
                <th className="text-left px-4 py-2.5">Role</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Created</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {users.map((item) => (
                <UserRow
                  key={item.user_id}
                  user={item}
                  currentUserId={currentUser?.user_id}
                  saving={savingId === item.user_id}
                  onSave={handleSave}
                  onDeactivate={handleDeactivate}
                />
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <p className="p-6 text-sm text-oj-fg-muted">No users found.</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mt-4 text-sm">
        <span className="text-oj-fg-muted font-mono">Page {page} / {totalPages}</span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-md text-oj-fg-muted hover:bg-oj-surface2
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <button
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-md text-oj-fg-muted hover:bg-oj-surface2
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>

      <CreateUserModal
        open={createOpen}
        saving={creating}
        error={createError}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />
    </div>
  )
}
