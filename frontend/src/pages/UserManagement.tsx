import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiDeleteAdminUser, apiListAdminUsers } from '../api/admin'
import { useAuth } from '../hooks/useAuth'
import type { AdminUser, AdminUserRole } from '../types/admin'
import { formatDateOnly } from '../utils/format'

const ROLES: AdminUserRole[] = ['admin', 'interviewer', 'problem_admin', 'candidate']
const PAGE_SIZE = 10

const inputCls = `w-full bg-oj-surface2 border border-oj-border rounded px-3 py-1.5
                  text-sm text-oj-fg focus:outline-none focus:ring-1 focus:ring-oj-accent`

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function UserRow({
  user,
  currentUserId,
  deleting,
  onEdit,
  onDelete,
}: {
  user: AdminUser
  currentUserId: string | undefined
  deleting: boolean
  onEdit: (user: AdminUser) => void
  onDelete: (user: AdminUser) => void
}) {
  const isSelf = user.user_id === currentUserId

  return (
    <tr className="border-b border-oj-border last:border-0">
      <td className="px-4 py-3 text-oj-fg">{user.name}</td>
      <td className="px-4 py-3 text-oj-fg-muted">{user.email}</td>
      <td className="px-4 py-3 text-oj-fg-muted font-mono text-xs">{user.role}</td>
      <td className="px-4 py-3">
        <span className={user.is_active ? 'text-green-700' : 'text-slate-500'}>
          {user.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="px-4 py-3 text-oj-fg-muted font-mono text-xs">{formatDateOnly(user.created_at)}</td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-2">
          <button
            onClick={() => onEdit(user)}
            className="px-3 py-1.5 rounded-md text-xs text-oj-accent hover:bg-oj-accent/10"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(user)}
            disabled={isSelf || deleting}
            className="px-3 py-1.5 rounded-md text-xs text-red-700 hover:bg-red-50
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </td>
    </tr>
  )
}

export default function UserManagement() {
  const { user: currentUser, getAccessToken } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [searchText, setSearchText] = useState('')
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<AdminUserRole | ''>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadUsers() {
      const freshToken = await getAccessToken()
      if (!freshToken || cancelled) return
      setLoading(true)
      try {
        const data = await apiListAdminUsers(freshToken, {
          page,
          pageSize: PAGE_SIZE,
          role,
          name: query,
        })
        if (cancelled) return
        setUsers(data.items)
        setTotal(data.total)
        setTotalPages(data.total_pages)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load users')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadUsers()
    return () => {
      cancelled = true
    }
  }, [getAccessToken, page, role, query])

  async function reload(targetPage = page) {
    const freshToken = await getAccessToken()
    if (!freshToken) return
    const data = await apiListAdminUsers(freshToken, {
      page: targetPage,
      pageSize: PAGE_SIZE,
      role,
      name: query,
    })
    setUsers(data.items)
    setTotal(data.total)
    setTotalPages(data.total_pages)
  }

  function handleSearch(event: React.FormEvent) {
    event.preventDefault()
    setQuery(searchText.trim())
    setPage(1)
  }

  async function handleDelete(target: AdminUser) {
    const freshToken = await getAccessToken()
    if (!freshToken) return
    if (!confirm(`Delete ${target.name}? This permanently removes the account.`)) return
    setDeletingId(target.user_id)
    setError(null)
    try {
      await apiDeleteAdminUser(freshToken, target.user_id)
      // If the deleted row was the last one on a non-first page, step back a page.
      const targetPage = users.length === 1 && page > 1 ? page - 1 : page
      if (targetPage !== page) {
        setPage(targetPage)
      } else {
        await reload(targetPage)
      }
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
          className="px-4 py-2 rounded-md text-sm font-medium bg-oj-accent text-white
                     hover:bg-oj-accent-dim"
        >
          + New user
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_220px] mb-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search name or email"
            className={inputCls}
          />
          <button
            type="submit"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium
                       bg-oj-surface2 border border-oj-border text-oj-fg hover:bg-oj-surface
                       whitespace-nowrap"
          >
            <SearchIcon />
            Search
          </button>
        </form>
        <select
          value={role}
          onChange={(event) => { setRole(event.target.value as AdminUserRole | ''); setPage(1) }}
          className={inputCls}
        >
          <option value="">All roles</option>
          {ROLES.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-red-700 text-sm font-mono mb-4">Error: {error}</p>}

      {loading ? (
        <div className="p-8 text-oj-fg-muted text-sm font-mono">Loading users...</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-oj-border">
          <table className="w-full text-sm">
            <thead className="bg-oj-surface2 text-oj-fg-muted">
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
                  deleting={deletingId === item.user_id}
                  onEdit={(user) => navigate(`/admin/users/${user.user_id}/edit`)}
                  onDelete={handleDelete}
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
    </div>
  )
}
