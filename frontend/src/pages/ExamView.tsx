import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError, getErrorMessage } from '../api/errors'
import { apiGetCandidateExamState, apiGetExam, apiListExamProblems } from '../api/exams'
import { useAuth } from '../hooks/useAuth'
import type { Exam, ExamProblem } from '../types/exam'
import { formatDate } from '../utils/format'

type ExamStatus = 'Active' | 'Upcoming' | 'Ended'

const STATUS_STYLE: Record<ExamStatus, string> = {
  Active: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  Upcoming: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  Ended: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
}

function examStatus(exam: Exam, now: Date): ExamStatus {
  if (now < new Date(exam.start_time)) return 'Upcoming'
  if (now > new Date(exam.end_time)) return 'Ended'
  return 'Active'
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

function remainingLabel(exam: Exam, now: Date) {
  const status = examStatus(exam, now)
  if (status === 'Upcoming') {
    return `Starts in ${formatDuration(new Date(exam.start_time).getTime() - now.getTime())}`
  }
  if (status === 'Active') {
    return `${formatDuration(new Date(exam.end_time).getTime() - now.getTime())} left`
  }
  return 'Closed'
}

function languageLabel(langs: string[]) {
  return langs.length > 0 ? langs.join(', ') : '-'
}

function isProctoringLockError(error: unknown) {
  return error instanceof ApiError
    && error.status === 403
    && getErrorMessage(error, '').toLowerCase().includes('proctoring violation')
}

export default function ExamView() {
  const { examId } = useParams<{ examId: string }>()
  const { user, getAccessToken } = useAuth()
  const [exam, setExam] = useState<Exam | null>(null)
  const [problems, setProblems] = useState<ExamProblem[]>([])
  const [now, setNow] = useState(() => new Date())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [candidateLocked, setCandidateLocked] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!examId) return
    const currentExamId = examId

    let cancelled = false

    async function loadExam() {
      setLoading(true)
      setError(null)
      try {
        const token = await getAccessToken()
        if (!token) throw new Error('Session expired. Please sign in again.')
        const [examData, problemList, state] = await Promise.all([
          apiGetExam(token, currentExamId),
          apiListExamProblems(token, currentExamId).catch((e) => {
            if (isProctoringLockError(e)) return []
            throw e
          }),
          user?.role === 'candidate'
            ? apiGetCandidateExamState(token, currentExamId)
            : Promise.resolve(null),
        ])
        if (!cancelled) {
          setExam(examData)
          setProblems(problemList)
          setCandidateLocked(state?.status === 'locked')
        }
      } catch (e) {
        if (!cancelled) setError(getErrorMessage(e, 'Failed to load exam'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadExam()
    return () => {
      cancelled = true
    }
  }, [examId, getAccessToken, user?.role])

  if (loading) return <div className="p-8 text-sm text-oj-fg-muted">Loading...</div>
  if (error) return <div className="p-8 text-sm font-medium text-red-700">Error: {error}</div>
  if (!exam || !examId) return null

  const status = examStatus(exam, now)
  const canSubmit = user?.role === 'candidate' && status === 'Active' && !candidateLocked
  const isStaff = user?.role === 'interviewer' || user?.role === 'admin'

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-5">
        <Link to="/exams" className="text-sm font-medium text-oj-accent hover:underline">
          Back to exams
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-oj-border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-oj-fg">{exam.title}</h1>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}
              >
                {status}
              </span>
            </div>
            {exam.description && (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-oj-fg-muted">
                {exam.description}
              </p>
            )}
          </div>
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-right">
            <div className="text-xs font-semibold uppercase text-oj-accent">Remaining</div>
            <div className="mt-1 font-mono text-lg text-oj-fg">{remainingLabel(exam, now)}</div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <div className="text-xs font-medium text-oj-fg-muted">Start Time</div>
            <div className="mt-0.5 font-mono text-oj-fg">{formatDate(exam.start_time)}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-oj-fg-muted">End Time</div>
            <div className="mt-0.5 font-mono text-oj-fg">{formatDate(exam.end_time)}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-oj-fg-muted">Problems</div>
            <div className="mt-0.5 font-mono text-oj-fg">{problems.length}</div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-sm font-semibold uppercase text-oj-fg-muted">
            Problems
          </h2>
          {status !== 'Active' && user?.role === 'candidate' && (
            <p className="mt-1 text-sm text-oj-fg-muted">
              {status === 'Upcoming' ? 'Submissions open at start time.' : "The exam has ended, so you can't open problems."}
            </p>
          )}
          {candidateLocked && (
            <p className="mt-1 text-sm font-medium text-red-700">
              This exam is locked because the fullscreen policy was violated.
            </p>
          )}
        </div>

        {problems.length === 0 ? (
          <div className="rounded-lg border border-oj-border bg-white px-4 py-8 text-sm text-oj-fg-muted shadow-sm">
            No problems assigned yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-oj-border bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="border-b border-oj-border bg-oj-surface2 text-oj-fg-muted">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">#</th>
                  <th className="px-4 py-3 text-left font-semibold">Problem</th>
                  <th className="px-4 py-3 text-left font-semibold">Limits</th>
                  <th className="px-4 py-3 text-left font-semibold">Languages</th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-oj-border">
                {problems.map((problem, index) => (
                  <tr key={problem.problem_id} className="transition-colors hover:bg-red-50/40">
                    <td className="px-4 py-3 font-mono text-oj-fg-muted">
                      {index + 1}
                    </td>
                    <td className="min-w-[240px] px-4 py-3">
                      <div className="font-semibold text-oj-fg">{problem.title}</div>
                      <div className="mt-0.5 font-mono text-xs text-oj-fg-muted">
                        {problem.problem_id.slice(0, 8)}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-oj-fg-muted">
                      {problem.time_limit} ms / {problem.memory_limit} MB
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-oj-fg-muted">
                      {languageLabel(problem.allowed_langs)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canSubmit ? (
                        <Link
                          to={`/exams/${examId}/problems/${problem.problem_id}`}
                          className="rounded-md bg-oj-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-oj-accent-dim"
                        >
                          Solve
                        </Link>
                      ) : isStaff ? (
                        <Link
                          to={`/problems/${problem.problem_id}/view`}
                          className="text-xs font-medium text-oj-accent hover:underline"
                        >
                          View
                        </Link>
                      ) : (
                        <span className="font-mono text-xs text-oj-fg-muted">
                          {candidateLocked ? 'Locked' : status === 'Upcoming' ? 'Not started' : 'Ended'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
