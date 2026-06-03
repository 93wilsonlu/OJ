import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useExamProctoring } from '../hooks/useExamProctoring'
import type { UserOut } from '../types/auth'
import {
  ACTIVE_EXAM_LOCK_EVENT,
  clearActiveExamLock,
  getActiveExamLock,
  type ActiveExamLock,
} from '../utils/activeExamLock'

interface AppShellProps {
  readonly children: ReactNode
}

type NavItem = {
  label: string
  to: string
}

const NAV_LINKS: Record<UserOut['role'], NavItem[]> = {
  candidate: [
    { label: 'My Exams', to: '/exams' },
    { label: 'Submissions', to: '/submissions' },
  ],
  interviewer: [
    { label: 'Exams', to: '/interviewer' },
    { label: 'Submissions', to: '/submissions' },
  ],
  problem_admin: [
    { label: 'Problems', to: '/problems' },
    { label: 'Submissions', to: '/submissions' },
  ],
  admin: [
    { label: 'Users', to: '/admin/users' },
    { label: 'Exams', to: '/interviewer' },
    { label: 'Problems', to: '/problems' },
    { label: 'Submissions', to: '/submissions' },
  ],
}

const ROLE_LABEL: Record<UserOut['role'], string> = {
  admin: 'Admin',
  interviewer: 'Interviewer',
  problem_admin: 'Prob. Admin',
  candidate: 'Candidate',
}

const ROLE_BADGE_CLASS: Record<UserOut['role'], string> = {
  admin: 'bg-red-50 text-red-700 ring-red-200',
  interviewer: 'bg-blue-50 text-blue-700 ring-blue-200',
  problem_admin: 'bg-amber-50 text-amber-700 ring-amber-200',
  candidate: 'bg-slate-100 text-slate-700 ring-slate-200',
}

export default function AppShell({ children }: AppShellProps) {
  const { user, logout, getAccessToken } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)
  const [activeExamLock, setActiveExamLock] = useState<ActiveExamLock | null>(() => getActiveExamLock())
  const links = user ? NAV_LINKS[user.role] : []
  const proctoring = useExamProctoring(
    activeExamLock?.examId,
    getAccessToken,
    Boolean(activeExamLock),
  )

  useEffect(() => {
    function syncLock() {
      setActiveExamLock(getActiveExamLock())
    }

    window.addEventListener(ACTIVE_EXAM_LOCK_EVENT, syncLock)
    window.addEventListener('storage', syncLock)
    return () => {
      window.removeEventListener(ACTIVE_EXAM_LOCK_EVENT, syncLock)
      window.removeEventListener('storage', syncLock)
    }
  }, [])

  useEffect(() => {
    const lock = getActiveExamLock()
    setActiveExamLock(lock)
  }, [location.pathname])

  useEffect(() => {
    if (!activeExamLock || !proctoring.forceEnded) return
    clearActiveExamLock(activeExamLock.examId)
    navigate(`/exams/${activeExamLock.examId}`, { replace: true })
  }, [activeExamLock, navigate, proctoring.forceEnded])

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logout()
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="min-h-dvh bg-oj-bg text-oj-fg">
      <header className="sticky top-0 z-40 border-b border-oj-border bg-white/95 shadow-sm backdrop-blur">
        <div className="flex h-16 items-center gap-5 px-4 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-3" aria-label="TSMC Online Judge home">
            <img src="/tsmc-logo.webp" alt="TSMC" className="h-7 w-auto" />
            <span className="hidden text-sm font-semibold text-oj-fg lg:inline">
              Online Judge
            </span>
          </Link>

          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="Main navigation">
            {links.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    'whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-red-50 text-oj-accent'
                      : 'text-oj-fg-muted hover:bg-oj-surface2 hover:text-oj-fg',
                  ].join(' ')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {user && (
            <div className="flex shrink-0 items-center gap-3">
              <div className="hidden text-right sm:block">
                <div className="max-w-40 truncate text-sm font-semibold text-oj-fg">{user.name}</div>
                <div className="max-w-40 truncate text-xs text-oj-fg-muted">{user.email}</div>
              </div>
              <span
                aria-label={`Role: ${ROLE_LABEL[user.role]}`}
                className={[
                  'hidden rounded-full px-2.5 py-1 text-xs font-semibold ring-1 sm:inline-flex',
                  ROLE_BADGE_CLASS[user.role],
                ].join(' ')}
              >
                {ROLE_LABEL[user.role]}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                aria-label={loggingOut ? 'Logging out' : 'Log out'}
                className="rounded-md border border-oj-border bg-white px-3 py-2 text-sm font-medium text-oj-fg-muted transition-colors hover:border-oj-accent hover:text-oj-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loggingOut ? 'Logging out' : 'Log out'}
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      {activeExamLock && (!proctoring.started || proctoring.violating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-oj-bg/95 px-4">
          <div className="max-w-md rounded-lg border border-oj-border bg-white p-6 text-center shadow-lg">
            <h2 className="text-lg font-semibold text-oj-fg">
              {proctoring.started ? 'Return to fullscreen' : 'Fullscreen required'}
            </h2>
            <p className="mt-3 text-sm leading-6 text-oj-fg-muted">
              {proctoring.started
                ? `You must return to fullscreen and keep this tab focused. This test will end in ${proctoring.remainingSeconds} seconds.`
                : 'Enter fullscreen mode to continue this exam.'}
            </p>
            {proctoring.error && (
              <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {proctoring.error}
              </p>
            )}
            <button
              type="button"
              onClick={proctoring.enterFullscreen}
              className="mt-5 rounded-md bg-oj-accent px-4 py-2 text-sm font-semibold text-white hover:bg-oj-accent-dim"
            >
              Enter fullscreen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
