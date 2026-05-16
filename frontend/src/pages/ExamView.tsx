import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGetExam, apiListExamProblems } from '../api/exams'
import { apiListSubmissions } from '../api/submissions'
import VerdictBadge from '../components/VerdictBadge'
import { useAuth } from '../hooks/useAuth'
import type { Exam, ExamProblem } from '../types/exam'
import type { Submission } from '../types/submission'

const DIFFICULTY_STYLE: Record<string, string> = {
  easy:   'bg-green-900/60 text-green-300 ring-1 ring-green-700',
  medium: 'bg-yellow-900/60 text-yellow-300 ring-1 ring-yellow-700',
  hard:   'bg-red-900/60 text-red-300 ring-1 ring-red-700',
}

export default function ExamView() {
  const { examId } = useParams<{ examId: string }>()
  const { getAccessToken } = useAuth()
  const [exam, setExam] = useState<Exam | null>(null)
  const [problems, setProblems] = useState<ExamProblem[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!examId) return
    getAccessToken().then(async (token) => {
      if (!token) return
      try {
        const [examData, problemList, subs] = await Promise.all([
          apiGetExam(token, examId),
          apiListExamProblems(token, examId),
          apiListSubmissions(token, { exam_id: examId }),
        ])
        setExam(examData)
        setProblems(problemList)
        setSubmissions(subs)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    })
  }, [examId, getAccessToken])

  if (loading) return <div className="p-8 text-oj-fg-muted text-sm font-mono">Loading…</div>
  if (error) return <div className="p-8 text-red-400 text-sm font-mono">Error: {error}</div>
  if (!exam) return null

  const now = new Date()
  const ended = now > new Date(exam.end_time)

  // Build a quick map: problem_id → latest submission status for badges
  const latestByProblem = new Map<string, Submission>()
  for (const s of submissions) {
    const prev = latestByProblem.get(s.problem_id)
    if (!prev || new Date(s.submitted_at) > new Date(prev.submitted_at)) {
      latestByProblem.set(s.problem_id, s)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-oj-fg">{exam.title}</h1>
        {exam.description && (
          <p className="text-sm text-oj-fg-muted mt-1">{exam.description}</p>
        )}
        {ended && (
          <p className="text-xs text-amber-400 font-mono mt-2">This exam has ended.</p>
        )}
      </div>

      {/* Problem list */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-oj-fg-muted uppercase tracking-wide mb-3">
          Problems
        </h2>
        {problems.length === 0 ? (
          <p className="text-sm text-oj-fg-muted">No problems assigned yet.</p>
        ) : (
          <ul className="space-y-2">
            {problems.map((p) => {
              const latest = latestByProblem.get(p.problem_id)
              const diffStyle = DIFFICULTY_STYLE[p.difficulty] ?? ''
              return (
                <li key={p.problem_id}>
                  {ended ? (
                    <div className="flex items-center justify-between gap-3 p-4 rounded-lg
                                    bg-oj-surface border border-oj-border opacity-60 cursor-not-allowed">
                      <span className="font-medium text-oj-fg">{p.title}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full
                                          text-xs font-medium font-mono capitalize ${diffStyle}`}>
                          {p.difficulty}
                        </span>
                        {latest && <VerdictBadge verdict={latest.status} />}
                      </div>
                    </div>
                  ) : (
                    <Link
                      to={`/exams/${examId}/problems/${p.problem_id}`}
                      className="flex items-center justify-between gap-3 p-4 rounded-lg
                                 bg-oj-surface border border-oj-border
                                 hover:border-oj-accent/50 transition-colors"
                    >
                      <span className="font-medium text-oj-fg">{p.title}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full
                                          text-xs font-medium font-mono capitalize ${diffStyle}`}>
                          {p.difficulty}
                        </span>
                        {latest && <VerdictBadge verdict={latest.status} />}
                        <span className="text-xs text-oj-accent">Start →</span>
                      </div>
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Recent submissions */}
      {submissions.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-oj-fg-muted uppercase tracking-wide mb-3">
            My Submissions
          </h2>
          <ul className="space-y-2">
            {submissions.slice(0, 10).map((s) => (
              <li key={s.submission_id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg
                             bg-oj-surface border border-oj-border text-sm">
                <span className="text-oj-fg-muted font-mono truncate">{s.problem_id.slice(0, 8)}…</span>
                <span className="text-oj-fg-muted font-mono text-xs">{s.language}</span>
                <VerdictBadge verdict={s.status} />
                <Link
                  to={`/submissions/${s.submission_id}`}
                  className="text-xs text-oj-accent hover:underline shrink-0"
                >
                  Details
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
