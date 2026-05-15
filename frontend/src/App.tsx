import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import RequireAuth from './components/RequireAuth'
import Login from './pages/Login'
import RoleHome from './pages/RoleHome'
import NotFound from './pages/NotFound'
import ErrorPage from './pages/ErrorPage'

// Stub placeholders — replaced in later phases
function CandidateDashboard() { return <div className="p-8 text-oj-fg font-mono">Candidate Dashboard (Phase 4)</div> }
function InterviewerDashboard() { return <div className="p-8 text-oj-fg font-mono">Interviewer Dashboard (Phase 6)</div> }
function AdminDashboard() { return <div className="p-8 text-oj-fg font-mono">Admin Dashboard (Phase 6)</div> }
function UserManagement() { return <div className="p-8 text-oj-fg font-mono">User Management (Phase 6)</div> }

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Role-based home redirect */}
          <Route
            path="/"
            element={
              <RequireAuth>
                <RoleHome />
              </RequireAuth>
            }
          />

          {/* Candidate routes */}
          <Route
            path="/dashboard"
            element={
              <RequireAuth roles={['candidate']}>
                <CandidateDashboard />
              </RequireAuth>
            }
          />

          {/* Interviewer + problem_admin + admin routes */}
          <Route
            path="/interviewer"
            element={
              <RequireAuth roles={['interviewer', 'problem_admin', 'admin']}>
                <InterviewerDashboard />
              </RequireAuth>
            }
          />

          {/* Admin-only routes */}
          <Route
            path="/admin"
            element={
              <RequireAuth roles={['admin', 'interviewer']}>
                <AdminDashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RequireAuth roles={['admin']}>
                <UserManagement />
              </RequireAuth>
            }
          />

          {/* Error pages */}
          <Route path="/403" element={<ErrorPage status={403} />} />
          <Route path="/500" element={<ErrorPage status={500} />} />

          {/* 404 catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
