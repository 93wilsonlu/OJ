import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getErrorMessage } from '../api/errors'
import { apiGetExam, apiListExamProblems } from '../api/exams'
import { useAuth } from '../hooks/useAuth'
import type { Exam, ExamProblem } from '../types/exam'

type ExamStatus = 'Active' | 'Upcoming' | 'Ended'

const STATUS_STYLE: Record<ExamStatus, string> = {
  Active: 'bg-green-900/60 text-green-300 ring-1 ring-green-700',
  Upcoming: 'bg-blue-900/60 text-blue-300 ring-1 ring-blue-700',
  Ended: 'bg-slate-700/60 text-slate-400 ring-1 ring-slate-600',
}

function examStatus(exam: Exam, now: Date): ExamStatus {
  if (now < new Date(exam.start_time)) return 'Upcoming'
  if (now > new Date(exam.end_time)) return 'Ended'
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

export default function ExamView() {
  const { examId } = useParams<{ examId: string }>()
  const { user, getAccessToken } = useAuth()
  const [exam, setExam] = useState<Exam | null>(null)
  const [problems, setProblems] = useState<ExamProblem[]>([])
  const [now, setNow] = useState(() => new Date())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        const [examData, problemList] = await Promise.all([
          apiGetExam(token, currentExamId),
          apiListExamProblems(token, currentExamId),
        ])
        if (!cancelled) {
          setExam(examData)
          setProblems(problemList)
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
  }, [examId, getAccessToken])

  if (loading) return <div className="p-8 text-oj-fg-muted text-sm font-mono">Loading...</div>
  if (error) return <div className="p-8 text-red-400 text-sm font-mono">Error: {error}</div>
  if (!exam || !examId) return null

  const status = examStatus(exam, now)
  const canSubmit = user?.role === 'candidate' && status === 'Active'
  const isStaff = user?.role === 'interviewer' || user?.role === 'admin'

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-5">
        <Link to="/exams" className="text-xs text-oj-accent hover:underline">
          Back to exams
        </Link>
      </div>

      <section className="mb-6 border border-oj-border bg-oj-surface rounded-lg p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold text-oj-fg">{exam.title}</h1>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs
                            font-medium font-mono ${STATUS_STYLE[status]}`}
              >
                {status}
              </span>
            </div>
            {exam.description && (
              <p className="text-sm text-oj-fg-muted mt-2 max-w-3xl">
                {exam.description}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs text-oj-fg-muted font-mono">Remaining</div>
            <div className="text-lg text-oj-fg font-mono">{remainingLabel(exam, now)}</div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 mt-5 text-sm">
          <div className="rounded border border-oj-border bg-oj-bg px-3 py-2">
            <div className="text-xs text-oj-fg-muted font-mono">Start Time</div>
            <div className="text-oj-fg font-mono mt-0.5">{fmtDate(exam.start_time)}</div>
          </div>
          <div className="rounded border border-oj-border bg-oj-bg px-3 py-2">
            <div className="text-xs text-oj-fg-muted font-mono">End Time</div>
            <div className="text-oj-fg font-mono mt-0.5">{fmtDate(exam.end_time)}</div>
          </div>
          <div className="rounded border border-oj-border bg-oj-bg px-3 py-2">
            <div className="text-xs text-oj-fg-muted font-mono">Problems</div>
            <div className="text-oj-fg font-mono mt-0.5">{problems.length}</div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-oj-fg-muted uppercase tracking-wide">
            Problems
          </h2>
          {status !== 'Active' && user?.role === 'candidate' && (
            <p className="text-xs text-amber-400 font-mono">
              {status === 'Upcoming' ? 'Submissions open at start time.' : 'This exam has ended.'}
            </p>
          )}
        </div>

        {problems.length === 0 ? (
          <p className="text-sm text-oj-fg-muted">No problems assigned yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-oj-border bg-oj-surface">
            <table className="min-w-full text-sm">
              <thead className="bg-oj-surface2 text-oj-fg-muted">
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
                  <tr key={problem.problem_id} className="hover:bg-oj-muted/60 transition-colors">
                    <td className="px-4 py-3 text-oj-fg-muted font-mono">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3 min-w-[240px]">
                      <div className="font-medium text-oj-fg">{problem.title}</div>
                      <div className="text-xs text-oj-fg-muted font-mono mt-0.5">
                        {problem.problem_id.slice(0, 8)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-oj-fg-muted font-mono whitespace-nowrap">
                      {problem.time_limit} ms / {problem.memory_limit} MB
                    </td>
                    <td className="px-4 py-3 text-oj-fg-muted font-mono whitespace-nowrap">
                      {languageLabel(problem.allowed_langs)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canSubmit ? (
                        <Link
                          to={`/exams/${examId}/problems/${problem.problem_id}`}
                          className="px-3 py-1.5 rounded-md text-xs font-medium
                                     bg-oj-accent text-oj-bg hover:bg-oj-accent/90"
                        >
                          Solve
                        </Link>
                      ) : isStaff ? (
                        <Link
                          to={`/problems/${problem.problem_id}/view`}
                          className="text-xs text-oj-accent hover:underline"
                        >
                          View
                        </Link>
                      ) : (
                        <span className="text-xs text-oj-fg-muted font-mono">
                          {status === 'Upcoming' ? 'Not started' : 'Ended'}
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
