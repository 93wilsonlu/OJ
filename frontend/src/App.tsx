import type { ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import AppShell from './components/AppShell'
import RequireAuth from './components/RequireAuth'
import Login from './pages/Login'
import RoleHome from './pages/RoleHome'
import CandidateDashboard from './pages/CandidateDashboard'
import ExamView from './pages/ExamView'
import ProblemEditor from './pages/ProblemEditor'
import SubmissionStatus from './pages/SubmissionStatus'
import ProblemsPage from './pages/ProblemsPage'
import ProblemDetailPage from './pages/ProblemDetailPage'
import ProblemViewPage from './pages/ProblemViewPage'
import ExamManagePage from './pages/ExamManagePage'
import ExamResultsPage from './pages/ExamResultsPage'
import SubmissionsPage from './pages/SubmissionsPage'
import UserManagement from './pages/UserManagement'
import UserFormPage from './pages/UserFormPage'
import NotFound from './pages/NotFound'
import ErrorPage from './pages/ErrorPage'
import InterviewerDashboard from './pages/InterviewerDashboard'
import type { UserOut } from './types/auth'

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

          {/* Candidate + Interviewer */}
          <Route
            path="/exams"
            element={
              <Protected roles={['candidate', 'interviewer', 'admin']}>
                <CandidateDashboard />
              </Protected>
            }
          />
          <Route
            path="/exams/new"
            element={
              <Protected roles={['interviewer', 'admin']}>
                <ExamManagePage />
              </Protected>
            }
          />
          <Route
            path="/exams/:examId/manage"
            element={
              <Protected roles={['interviewer', 'admin']}>
                <ExamManagePage />
              </Protected>
            }
          />
          <Route
            path="/exams/:examId/results"
            element={
              <Protected roles={['interviewer', 'admin']}>
                <ExamResultsPage />
              </Protected>
            }
          />
          <Route
            path="/exams/:examId"
            element={
              <Protected roles={['candidate', 'interviewer', 'admin']}>
                <ExamView />
              </Protected>
            }
          />
          <Route
            path="/exams/:examId/problems/:problemId"
            element={
              <Protected roles={['candidate']}>
                <ProblemEditor />
              </Protected>
            }
          />
          <Route
            path="/exams/:examId/submissions"
            element={
              <Protected roles={['candidate']}>
                <SubmissionsPage />
              </Protected>
            }
          />
          <Route
            path="/exams/:examId/submissions/:submissionId"
            element={
              <Protected roles={['candidate']}>
                <SubmissionStatus />
              </Protected>
            }
          />
          <Route
            path="/submissions"
            element={
              <Protected roles={['candidate', 'interviewer', 'admin']}>
                <SubmissionsPage />
              </Protected>
            }
          />
          <Route
            path="/submissions/:submissionId"
            element={
              <Protected roles={['candidate', 'interviewer', 'admin']}>
                <SubmissionStatus />
              </Protected>
            }
          />

          {/* Problem admin + admin */}
          <Route
            path="/problems"
            element={
              <Protected roles={['problem_admin', 'admin']}>
                <ProblemsPage />
              </Protected>
            }
          />
          <Route
            path="/problems/:problemId"
            element={
              <Protected roles={['problem_admin', 'admin']}>
                <ProblemDetailPage />
              </Protected>
            }
          />
          <Route
            path="/problems/:problemId/view"
            element={
              <Protected roles={['interviewer', 'problem_admin', 'admin']}>
                <ProblemViewPage />
              </Protected>
            }
          />

          {/* Interviewer */}
          <Route
            path="/interviewer"
            element={
              <Protected roles={['interviewer', 'problem_admin', 'admin']}>
                <InterviewerDashboard />
              </Protected>
            }
          />

          {/* Admin */}
          <Route
            path="/admin/users"
            element={
              <Protected roles={['admin']}>
                <UserManagement />
              </Protected>
            }
          />
          <Route
            path="/admin/users/new"
            element={
              <Protected roles={['admin']}>
                <UserFormPage />
              </Protected>
            }
          />
          <Route
            path="/admin/users/:userId/edit"
            element={
              <Protected roles={['admin']}>
                <UserFormPage />
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
