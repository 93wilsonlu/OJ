import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, getErrorMessage } from '../api/errors'
import { apiGetExamAccess, apiListExamProblems, apiListExams, apiStartExam } from '../api/exams'
import { apiListSubmissions } from '../api/submissions'
import VerdictBadge from '../components/VerdictBadge'
import { useAuth } from '../hooks/useAuth'
import type { Exam, ExamAccess } from '../types/exam'
import type { SubmissionListItem } from '../types/submission'
import { setActiveExamLock } from '../utils/activeExamLock'
import { formatDate } from '../utils/format'

type ExamStatus = 'Active' | 'Upcoming' | 'Ended'
type StatusFilter = 'all' | ExamStatus

const STATUS_STYLE: Record<ExamStatus, string> = {
  Active: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  Upcoming: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  Ended: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
}

const STATUS_RANK: Record<ExamStatus, number> = {
  Active: 0,
  Upcoming: 1,
  Ended: 2,
}

function examStatus(exam: Exam, now: Date): ExamStatus {
  const start = new Date(exam.start_time)
  const end = new Date(exam.end_time)
  if (now < start) return 'Upcoming'
  if (now > end) return 'Ended'
  return 'Active'
}

function latestSubmissionByExam(submissions: SubmissionListItem[]) {
  return submissions.reduce<Record<string, SubmissionListItem>>((acc, submission) => {
    const current = acc[submission.exam_id]
    if (!current || new Date(submission.submitted_at) > new Date(current.submitted_at)) {
      acc[submission.exam_id] = submission
    }
    return acc
  }, {})
}

function isProctoringLockError(error: unknown) {
  return error instanceof ApiError
    && error.status === 403
    && getErrorMessage(error, '').toLowerCase().includes('proctoring violation')
}

export default function CandidateDashboard() {
  const { user, getAccessToken } = useAuth()
  const navigate = useNavigate()
  const isInterviewer = user?.role === 'interviewer' || user?.role === 'admin'
  const [exams, setExams] = useState<Exam[]>([])
  const [examAccesses, setExamAccesses] = useState<Record<string, ExamAccess>>({})
  const [problemCounts, setProblemCounts] = useState<Record<string, number>>({})
  const [lockedExams, setLockedExams] = useState<Record<string, boolean>>({})
  const [latestSubmissions, setLatestSubmissions] = useState<Record<string, SubmissionListItem>>({})
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [now, setNow] = useState(() => new Date())
  const [loading, setLoading] = useState(true)
  const [startingExamId, setStartingExamId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadExams() {
      setLoading(true)
      setError(null)
      try {
        const token = await getAccessToken()
        if (!token) throw new Error('Session expired. Please sign in again.')
        const data = await apiListExams(token)
        const accessEntries = await Promise.all(
          data.map(async (exam) => {
            if (user?.role !== 'candidate') return [exam.exam_id, null] as const
            return [exam.exam_id, await apiGetExamAccess(token, exam.exam_id)] as const
          }),
        )
        const accessMap = Object.fromEntries(
          accessEntries.filter(([, access]) => access !== null),
        ) as Record<string, ExamAccess>
        const [counts, submissions] = await Promise.all([
          Promise.all(
            data.map(async (exam) => {
              const access = accessMap[exam.exam_id]
              if (user?.role === 'candidate' && access && !access.can_view_problems) {
                return [exam.exam_id, 0, false] as const
              }
              try {
                const problems = await apiListExamProblems(token, exam.exam_id)
                return [exam.exam_id, problems.length, false] as const
              } catch (e) {
                if (isProctoringLockError(e)) return [exam.exam_id, 0, true] as const
                throw e
              }
            }),
          ),
          apiListSubmissions(token),
        ])
        if (!cancelled) {
          setExams(data)
          setExamAccesses(accessMap)
          setProblemCounts(Object.fromEntries(counts.map(([examId, count]) => [examId, count])))
          setLockedExams(Object.fromEntries(
            counts.filter(([, , locked]) => locked).map(([examId]) => [examId, true]),
          ))
          setLatestSubmissions(latestSubmissionByExam(submissions))
        }
      } catch (e) {
        if (!cancelled) setError(getErrorMessage(e, 'Failed to load exams'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadExams()
    return () => {
      cancelled = true
    }
  }, [getAccessToken, user?.role])

  async function openExam(exam: Exam) {
    navigate(`/exams/${exam.exam_id}`)
  }

  async function handleStartExam(exam: Exam) {
    setStartingExamId(exam.exam_id)
    setError(null)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Session expired. Please sign in again.')
      await apiStartExam(token, exam.exam_id)
      if (exam.anti_cheat_enabled && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      }
      const path = `/exams/${exam.exam_id}`
      if (exam.anti_cheat_enabled) {
        setActiveExamLock({ examId: exam.exam_id, path })
      }
      navigate(path)
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to start exam'))
    } finally {
      setStartingExamId(null)
    }
  }

  async function handleContinueExam(exam: Exam) {
    setStartingExamId(exam.exam_id)
    setError(null)
    try {
      if (exam.anti_cheat_enabled && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      }
      if (exam.anti_cheat_enabled) {
        setActiveExamLock({ examId: exam.exam_id, path: `/exams/${exam.exam_id}` })
      }
      await openExam(exam)
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to open exam'))
    } finally {
      setStartingExamId(null)
    }
  }

  const stats = useMemo(() => {
    return exams.reduce<Record<ExamStatus, number>>(
      (acc, exam) => {
        acc[examStatus(exam, now)] += 1
        return acc
      },
      { Active: 0, Upcoming: 0, Ended: 0 },
    )
  }, [exams, now])

  const visibleExams = useMemo(() => {
    const text = query.trim().toLowerCase()
    return exams
      .filter((exam) => {
        const status = examStatus(exam, now)
        if (statusFilter !== 'all' && status !== statusFilter) return false
        if (!text) return true
        return (
          exam.title.toLowerCase().includes(text)
          || (exam.description ?? '').toLowerCase().includes(text)
        )
      })
      .sort((a, b) => {
        const statusA = examStatus(a, now)
        const statusB = examStatus(b, now)
        if (statusA !== statusB) return STATUS_RANK[statusA] - STATUS_RANK[statusB]

        const dateA = statusA === 'Ended'
          ? new Date(a.end_time).getTime()
          : new Date(a.start_time).getTime()
        const dateB = statusB === 'Ended'
          ? new Date(b.end_time).getTime()
          : new Date(b.start_time).getTime()
        return statusA === 'Ended' ? dateB - dateA : dateA - dateB
      })
  }, [exams, now, query, statusFilter])

  if (loading) {
    return <div className="p-8 text-sm text-oj-fg-muted">Loading exams...</div>
  }

  if (error) {
    return <div className="p-8 text-sm font-medium text-red-700">Error: {error}</div>
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 border-b border-oj-border pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-oj-accent">Candidate Workspace</p>
            <h1 className="mt-1 text-2xl font-semibold text-oj-fg">
              {isInterviewer ? 'Exams' : 'My Exams'}
            </h1>
            <p className="mt-2 text-sm text-oj-fg-muted">
              {stats.Active} active, {stats.Upcoming} upcoming, {stats.Ended} ended
            </p>
          </div>
          {isInterviewer && (
            <Link
              to="/exams/new"
              className="btn-primary"
            >
              New Exam
            </Link>
          )}
        </div>
      </div>

      <div className="mb-4 grid gap-3 rounded-lg border border-oj-border bg-white p-3 shadow-sm sm:grid-cols-[1fr_220px]">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exams"
          className="input"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="input"
        >
          <option value="all">All statuses</option>
          <option value="Active">Active</option>
          <option value="Upcoming">Upcoming</option>
          <option value="Ended">Ended</option>
        </select>
      </div>

      {exams.length === 0 ? (
        <div className="rounded-lg border border-oj-border bg-white px-4 py-8 text-sm text-oj-fg-muted shadow-sm">
          No exams assigned yet.
        </div>
      ) : visibleExams.length === 0 ? (
        <div className="rounded-lg border border-oj-border bg-white px-4 py-8 text-sm text-oj-fg-muted shadow-sm">
          No exams match your filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-oj-border bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="border-b border-oj-border bg-oj-surface2 text-oj-fg-muted">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Exam</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Problems</th>
                <th className="px-4 py-3 text-left font-semibold">Start Time</th>
                <th className="px-4 py-3 text-left font-semibold">End Time</th>
                <th className="px-4 py-3 text-left font-semibold">Last Submission</th>
                <th className="px-4 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-oj-border">
              {visibleExams.map((exam) => {
                const status = examStatus(exam, now)
                const access = examAccesses[exam.exam_id]
                const latest = latestSubmissions[exam.exam_id]
                const latestVerdict = latest?.judge_result?.verdict ?? latest?.status
                const locked = lockedExams[exam.exam_id]
                const actionLabel = access?.can_start
                  ? 'Start'
                  : access?.status_label === 'in_progress'
                    ? 'Continue'
                    : status === 'Ended' || access?.status_label === 'finished'
                      ? 'Finished'
                      : 'Not Started'
                const actionEnabled = Boolean(access?.can_start || access?.can_solve)
                return (
                  <tr key={exam.exam_id} className="transition-colors hover:bg-red-50/40">
                    <td className="min-w-[240px] px-4 py-3">
                      <Link
                        to={`/exams/${exam.exam_id}`}
                        className="font-semibold text-oj-fg hover:text-oj-accent"
                      >
                        {exam.title}
                      </Link>
                      {exam.description && (
                        <div className="mt-0.5 max-w-[32rem] truncate text-xs text-oj-fg-muted">
                          {exam.description}
                        </div>
                      )}
                      {isInterviewer && (
                        <div className="mt-1 flex gap-3">
                          <Link
                            to={`/exams/${exam.exam_id}/results`}
                            className="text-xs font-medium text-oj-accent hover:underline"
                          >
                            Results
                          </Link>
                          <Link
                            to={`/exams/${exam.exam_id}/manage`}
                            className="text-xs font-medium text-oj-accent hover:underline"
                          >
                            Manage
                          </Link>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-oj-fg">
                      {locked ? (
                        <span className="text-xs font-semibold text-red-700">Locked</span>
                      ) : (
                        problemCounts[exam.exam_id] ?? '-'
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-oj-fg-muted">
                      {formatDate(exam.start_time)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-oj-fg-muted">
                      {formatDate(exam.end_time)}
                    </td>
                    <td className="min-w-[150px] px-4 py-3">
                      {latest ? (
                        <div className="flex flex-col items-start gap-1">
                          <VerdictBadge verdict={latestVerdict} />
                          <span className="font-mono text-xs text-oj-fg-muted">
                            {formatDate(latest.submitted_at)}
                          </span>
                        </div>
                      ) : (
                        <span className="font-mono text-oj-fg-muted">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isInterviewer ? (
                        <Link
                          to={`/exams/${exam.exam_id}`}
                          className="text-xs font-medium text-oj-accent hover:underline"
                        >
                          View
                        </Link>
                      ) : actionEnabled ? (
                        <button
                          type="button"
                          onClick={() => access?.can_start ? handleStartExam(exam) : handleContinueExam(exam)}
                          disabled={startingExamId === exam.exam_id}
                          className="rounded-md bg-oj-accent px-3 py-1.5 text-xs font-semibold text-white
                                     hover:bg-oj-accent-dim disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {startingExamId === exam.exam_id ? 'Starting...' : actionLabel}
                        </button>
                      ) : (
                        <span className="font-mono text-xs text-oj-fg-muted">{actionLabel}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
