import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiDeleteAdminUser, apiListAdminUsers } from '../api/admin'
import { useAuth } from '../hooks/useAuth'
import type { AdminUser, AdminUserRole } from '../types/admin'

const ROLES: AdminUserRole[] = ['admin', 'interviewer', 'problem_admin', 'candidate']
const PAGE_SIZE = 10

const inputCls = `w-full bg-oj-surface2 border border-oj-border rounded px-3 py-1.5
                  text-sm text-oj-fg focus:outline-none focus:ring-1 focus:ring-oj-accent`

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function UserManagement() {
  const { user: currentUser, getAccessToken } = useAuth()
  const navigate = useNavigate()
  const [token, setToken] = useState<string | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [draftQuery, setDraftQuery] = useState('')
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<AdminUserRole | ''>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    getAccessToken().then(setToken)
  }, [getAccessToken])

  useEffect(() => {
    if (!token) return
    setLoading(true)
    apiListAdminUsers(token, { page, pageSize: PAGE_SIZE, role: roleFilter, name: query })
      .then((data) => {
        setUsers(data.items)
        setTotal(data.total)
        setTotalPages(data.total_pages)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, page, roleFilter, query])

  function handleSearch() {
    setQuery(draftQuery)
    setPage(1)
  }

  async function handleDelete(target: AdminUser) {
    if (!token) return
    if (!confirm(`Delete ${target.name}? This action cannot be undone.`)) return
    setDeletingId(target.user_id)
    setError(null)
    try {
      await apiDeleteAdminUser(token, target.user_id)
      setUsers((items) => items.filter((item) => item.user_id !== target.user_id))
      setTotal((t) => t - 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeletingId(null)
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
          onClick={() => navigate('/admin/users/new')}
          className="px-4 py-2 rounded-md text-sm font-medium bg-oj-accent text-oj-bg hover:bg-oj-accent/90"
        >
          + New user
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto] mb-4">
        <input
          value={draftQuery}
          onChange={(e) => setDraftQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search name or email"
          className={inputCls}
        />
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value as AdminUserRole | ''); setPage(1) }}
          className={inputCls}
        >
          <option value="">All roles</option>
          {ROLES.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <button
          onClick={handleSearch}
          className="flex items-center gap-1.5 px-1.5 py-1.5 rounded-md border border-oj-border
                     text-sm text-oj-fg-muted hover:bg-oj-surface2"
          aria-label="Search"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
        </button>
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
                <tr key={item.user_id} className="border-b border-oj-border last:border-0">
                  <td className="px-4 py-3 text-oj-fg">{item.name}</td>
                  <td className="px-4 py-3 text-oj-fg-muted">{item.email}</td>
                  <td className="px-4 py-3 text-oj-fg-muted">{item.role}</td>
                  <td className="px-4 py-3">
                    <span className={item.is_active ? 'text-green-400' : 'text-slate-500'}>
                      {item.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-oj-fg-muted font-mono text-xs">{formatDate(item.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => navigate(`/admin/users/${item.user_id}/edit`)}
                        className="px-3 py-1.5 rounded-md text-xs text-oj-accent hover:bg-oj-accent/10"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        disabled={item.user_id === currentUser?.user_id || deletingId === item.user_id}
                        className="px-3 py-1.5 rounded-md text-xs text-red-400 hover:bg-red-400/10
                                   disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {deletingId === item.user_id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
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
    </div>
  )
}
