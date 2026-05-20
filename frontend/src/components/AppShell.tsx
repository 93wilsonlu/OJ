import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import type { UserOut } from '../types/auth'

// ── nav links per role ────────────────────────────────────────────────────────

const NAV_LINKS: Record<UserOut['role'], { label: string; to: string }[]> = {
  candidate:     [{ label: 'My Exams', to: '/exams' }],
  interviewer:   [{ label: 'Exams', to: '/interviewer' }],
  problem_admin: [{ label: 'Problems', to: '/problems' }],
  admin:         [
                   { label: 'Users', to: '/admin/users' }, 
                   { label: 'Problems', to: '/problems' },
                   { label: 'Exams', to: '/interviewer' }
                 ],
}

const ROLE_LABEL: Record<UserOut['role'], string> = {
  admin:         'Admin',
  interviewer:   'Interviewer',
  problem_admin: 'Prob. Admin',
  candidate:     'Candidate',
}

const ROLE_STYLE: Record<UserOut['role'], string> = {
  admin:         'bg-purple-900/60 text-purple-300 ring-1 ring-purple-700',
  interviewer:   'bg-blue-900/60 text-blue-300 ring-1 ring-blue-700',
  problem_admin: 'bg-amber-900/60 text-amber-300 ring-1 ring-amber-700',
  candidate:     'bg-slate-700/60 text-slate-300 ring-1 ring-slate-600',
}

// ── component ─────────────────────────────────────────────────────────────────

interface Props {
  children: ReactNode
}

export default function AppShell({ children }: Props) {
  const { user, logout } = useAuth()
  const [loggingOut, setLoggingOut] = useState(false)

  const links = user ? (NAV_LINKS[user.role] ?? []) : []

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logout()
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-oj-bg">
      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <header className="h-14 shrink-0 sticky top-0 z-40 flex items-center gap-4 px-4
                         bg-oj-surface/90 backdrop-blur-sm border-b border-oj-border">

        {/* Logo */}
        <Link
          to="/"
          className="flex items-center gap-2 font-mono font-bold text-oj-fg
                     hover:text-oj-accent transition-colors shrink-0"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          <span className="hidden sm:inline text-sm">Online Judge</span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1 flex-1" aria-label="Main navigation">
          {links.map(({ label, to }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-oj-accent bg-oj-accent/10'
                    : 'text-oj-fg-muted hover:text-oj-fg hover:bg-oj-surface2'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User info + logout */}
        {user && (
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden md:block text-sm text-oj-fg-muted truncate max-w-[140px]">
              {user.name}
            </span>
            <span
              className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full
                          text-xs font-medium font-mono ${ROLE_STYLE[user.role]}`}
              aria-label={`Role: ${ROLE_LABEL[user.role]}`}
            >
              {ROLE_LABEL[user.role]}
            </span>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm
                         font-medium text-oj-fg-muted hover:text-oj-fg hover:bg-oj-surface2
                         transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={loggingOut ? 'Logging out…' : 'Log out'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span className="hidden sm:inline">{loggingOut ? 'Logging out…' : 'Log out'}</span>
            </button>
          </div>
        )}
      </header>

      {/* ── Page content ─────────────────────────────────────────────────── */}
      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
