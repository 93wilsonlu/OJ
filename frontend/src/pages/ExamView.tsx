import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getErrorMessage } from '../api/errors'
import { apiGetExam, apiListExamProblems } from '../api/exams'
import { useAuth } from '../hooks/useAuth'
import type { Exam, ExamProblem } from '../types/exam'

const DIFFICULTY_STYLE: Record<string, string> = {
  easy:   'bg-green-900/60 text-green-300 ring-1 ring-green-700',
  medium: 'bg-yellow-900/60 text-yellow-300 ring-1 ring-yellow-700',
  hard:   'bg-red-900/60 text-red-300 ring-1 ring-red-700',
}

export default function ExamView() {
  const { examId } = useParams<{ examId: string }>()
  const { user, getAccessToken } = useAuth()
  const [exam, setExam] = useState<Exam | null>(null)
  const [problems, setProblems] = useState<ExamProblem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  if (loading) return <div className="p-8 text-oj-fg-muted text-sm font-mono">Loading…</div>
  if (error) return <div className="p-8 text-red-400 text-sm font-mono">Error: {error}</div>
  if (!exam) return null

  const now = new Date()
  const ended = now > new Date(exam.end_time)
  const canSubmit = user?.role === 'candidate' && !ended

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
              const diffStyle = DIFFICULTY_STYLE[p.difficulty] ?? ''
              const content = (
                <>
                  <span className="font-medium text-oj-fg">{p.title}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full
                                      text-xs font-medium font-mono capitalize ${diffStyle}`}>
                      {p.difficulty}
                    </span>
                    <span className="text-xs text-oj-fg-muted font-mono">
                      {p.time_limit} ms / {p.memory_limit} MB
                    </span>
                  </div>
                </>
              )
              return (
                <li key={p.problem_id}>
                  {canSubmit ? (
                    <Link
                      to={`/exams/${examId}/problems/${p.problem_id}`}
                      className="flex items-center justify-between gap-3 p-4 rounded-lg
                                 bg-oj-surface border border-oj-border
                                 hover:border-oj-accent/50 transition-colors"
                    >
                      {content}
                    </Link>
                  ) : user?.role === 'interviewer' || user?.role === 'admin' ? (
                    <Link
                      to={`/problems/${p.problem_id}/view`}
                      className="flex items-center justify-between gap-3 p-4 rounded-lg
                                 bg-oj-surface border border-oj-border
                                 hover:border-oj-accent/50 transition-colors"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className="flex items-center justify-between gap-3 p-4 rounded-lg
                                    bg-oj-surface border border-oj-border opacity-60 cursor-not-allowed">
                      {content}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
