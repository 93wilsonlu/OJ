import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getErrorMessage } from '../api/errors'
import { apiListExamProblems, apiListExams } from '../api/exams'
import { apiListSubmissions } from '../api/submissions'
import VerdictBadge from '../components/VerdictBadge'
import { useAuth } from '../hooks/useAuth'
import type { Exam } from '../types/exam'
import type { SubmissionListItem } from '../types/submission'

type ExamStatus = 'Active' | 'Upcoming' | 'Ended'
type StatusFilter = 'all' | ExamStatus

const STATUS_STYLE: Record<ExamStatus, string> = {
  Active: 'bg-green-900/60 text-green-300 ring-1 ring-green-700',
  Upcoming: 'bg-blue-900/60 text-blue-300 ring-1 ring-blue-700',
  Ended: 'bg-slate-700/60 text-slate-400 ring-1 ring-slate-600',
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

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function examRemaining(exam: Exam, now: Date) {
  const status = examStatus(exam, now)
  if (status === 'Upcoming') {
    return `Starts in ${formatDuration(new Date(exam.start_time).getTime() - now.getTime())}`
  }
  if (status === 'Active') {
    return `${formatDuration(new Date(exam.end_time).getTime() - now.getTime())} left`
  }
  return 'Closed'
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

export default function CandidateDashboard() {
  const { user, getAccessToken } = useAuth()
  const isInterviewer = user?.role === 'interviewer' || user?.role === 'admin'
  const [exams, setExams] = useState<Exam[]>([])
  const [problemCounts, setProblemCounts] = useState<Record<string, number>>({})
  const [latestSubmissions, setLatestSubmissions] = useState<Record<string, SubmissionListItem>>({})
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [now, setNow] = useState(() => new Date())
  const [loading, setLoading] = useState(true)
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
        const [counts, submissions] = await Promise.all([
          Promise.all(
            data.map(async (exam) => {
              const problems = await apiListExamProblems(token, exam.exam_id)
              return [exam.exam_id, problems.length] as const
            }),
          ),
          apiListSubmissions(token),
        ])
        if (!cancelled) {
          setExams(data)
          setProblemCounts(Object.fromEntries(counts))
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
  }, [getAccessToken])

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
    return <div className="p-8 text-oj-fg-muted text-sm font-mono">Loading exams...</div>
  }

  if (error) {
    return <div className="p-8 text-red-400 text-sm font-mono">Error: {error}</div>
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-oj-fg">
            {isInterviewer ? 'Exams' : 'My Exams'}
          </h1>
          <p className="text-sm text-oj-fg-muted mt-1">
            {stats.Active} active, {stats.Upcoming} upcoming, {stats.Ended} ended
          </p>
        </div>
        {isInterviewer && (
          <Link
            to="/exams/new"
            className="px-4 py-2 rounded-md text-sm font-medium bg-oj-accent text-oj-bg
                       hover:bg-oj-accent/90"
          >
            + New Exam
          </Link>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_220px] mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exams"
          className="w-full bg-oj-surface2 border border-oj-border rounded px-3 py-2
                     text-sm text-oj-fg placeholder:text-oj-fg-muted
                     focus:outline-none focus:ring-1 focus:ring-oj-accent"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="w-full bg-oj-surface2 border border-oj-border rounded px-3 py-2
                     text-sm text-oj-fg focus:outline-none focus:ring-1 focus:ring-oj-accent"
        >
          <option value="all">All statuses</option>
          <option value="Active">Active</option>
          <option value="Upcoming">Upcoming</option>
          <option value="Ended">Ended</option>
        </select>
      </div>

      {exams.length === 0 ? (
        <p className="text-oj-fg-muted text-sm">No exams assigned yet.</p>
      ) : visibleExams.length === 0 ? (
        <p className="text-oj-fg-muted text-sm">No exams match your filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-oj-border bg-oj-surface">
          <table className="min-w-full text-sm">
            <thead className="bg-oj-surface2 text-oj-fg-muted">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Exam</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Problems</th>
                <th className="px-4 py-3 text-left font-semibold">Start Time</th>
                <th className="px-4 py-3 text-left font-semibold">End Time</th>
                <th className="px-4 py-3 text-left font-semibold">Remaining</th>
                <th className="px-4 py-3 text-left font-semibold">Last Submission</th>
                <th className="px-4 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-oj-border">
              {visibleExams.map((exam) => {
                const status = examStatus(exam, now)
                const latest = latestSubmissions[exam.exam_id]
                const latestVerdict = latest?.judge_result?.verdict ?? latest?.status
                return (
                  <tr key={exam.exam_id} className="hover:bg-oj-muted/60 transition-colors">
                    <td className="px-4 py-3 min-w-[240px]">
                      <Link
                        to={`/exams/${exam.exam_id}`}
                        className="font-medium text-oj-fg hover:text-oj-accent"
                      >
                        {exam.title}
                      </Link>
                      {exam.description && (
                        <div className="text-xs text-oj-fg-muted mt-0.5 max-w-[32rem] truncate">
                          {exam.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full
                                    text-xs font-medium font-mono ${STATUS_STYLE[status]}`}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-oj-fg font-mono">
                      {problemCounts[exam.exam_id] ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-oj-fg-muted font-mono whitespace-nowrap">
                      {fmtDate(exam.start_time)}
                    </td>
                    <td className="px-4 py-3 text-oj-fg-muted font-mono whitespace-nowrap">
                      {fmtDate(exam.end_time)}
                    </td>
                    <td className="px-4 py-3 text-oj-fg font-mono whitespace-nowrap">
                      {examRemaining(exam, now)}
                    </td>
                    <td className="px-4 py-3 min-w-[150px]">
                      {latest ? (
                        <div className="flex flex-col items-start gap-1">
                          <VerdictBadge verdict={latestVerdict} />
                          <span className="text-xs text-oj-fg-muted font-mono">
                            {fmtDate(latest.submitted_at)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-oj-fg-muted font-mono">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        {isInterviewer && (
                          <>
                            <Link
                              to={`/exams/${exam.exam_id}/results`}
                              className="text-xs text-oj-accent hover:underline"
                            >
                              Results
                            </Link>
                            <Link
                              to={`/exams/${exam.exam_id}/manage`}
                              className="text-xs text-oj-accent hover:underline"
                            >
                              Manage
                            </Link>
                          </>
                        )}
                        <Link
                          to={`/exams/${exam.exam_id}`}
                          className="px-3 py-1.5 rounded-md text-xs font-medium
                                     bg-oj-accent text-oj-bg hover:bg-oj-accent/90"
                        >
                          Open
                        </Link>
                      </div>
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
