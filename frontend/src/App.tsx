import type { ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import AppShell from './components/AppShell'
import RequireAuth from './components/RequireAuth'
import Login from './pages/Login'
import RoleHome from './pages/RoleHome'
import NotFound from './pages/NotFound'
import ErrorPage from './pages/ErrorPage'
import type { UserOut } from './types/auth'

// ── stub placeholders — replaced in later phases ──────────────────────────────
function Stub({ label }: { label: string }) {
  return <div className="p-8 text-oj-fg font-mono text-sm text-oj-fg-muted">{label}</div>
}

// ── layout helper ─────────────────────────────────────────────────────────────

function Protected({
  children,
  roles,
}: {
  children: ReactNode
  roles?: UserOut['role'][]
}) {
  return (
    <RequireAuth roles={roles}>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  )
}

// ── routes ────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Role-based home redirect — no shell needed (pure redirect) */}
          <Route
            path="/"
            element={
              <RequireAuth>
                <RoleHome />
              </RequireAuth>
            }
          />

          {/* Candidate */}
          <Route
            path="/exams"
            element={
              <Protected roles={['candidate', 'interviewer']}>
                <Stub label="Exams (Phase 5)" />
              </Protected>
            }
          />
          <Route
            path="/dashboard"
            element={
              <Protected roles={['candidate']}>
                <Stub label="Candidate Dashboard (Phase 5)" />
              </Protected>
            }
          />

          {/* Problem admin + admin */}
          <Route
            path="/problems"
            element={
              <Protected roles={['problem_admin', 'admin']}>
                <Stub label="Problems (Phase 5)" />
              </Protected>
            }
          />

          {/* Interviewer */}
          <Route
            path="/interviewer"
            element={
              <Protected roles={['interviewer', 'problem_admin', 'admin']}>
                <Stub label="Interviewer Dashboard (Phase 7)" />
              </Protected>
            }
          />

          {/* Admin */}
          <Route
            path="/admin/users"
            element={
              <Protected roles={['admin']}>
                <Stub label="User Management (Phase 7)" />
              </Protected>
            }
          />

          {/* 403 — inside shell so user can navigate away */}
          <Route
            path="/403"
            element={
              <Protected>
                <ErrorPage status={403} />
              </Protected>
            }
          />

          {/* Bare error/404 — user may not be authenticated */}
          <Route path="/500" element={<ErrorPage status={500} />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
