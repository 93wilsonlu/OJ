import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGetExam } from '../api/exams'
import { apiListSubmissions } from '../api/submissions'
import VerdictBadge from '../components/VerdictBadge'
import { useAuth } from '../hooks/useAuth'
import type { Exam } from '../types/exam'
import type { Submission } from '../types/submission'

export default function ExamView() {
  const { examId } = useParams<{ examId: string }>()
  const { getAccessToken } = useAuth()
  const [exam, setExam] = useState<Exam | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!examId) return
    getAccessToken().then(async (token) => {
      if (!token) return
      try {
        const [examData, subs] = await Promise.all([
          apiGetExam(token, examId),
          apiListSubmissions(token, { exam_id: examId }),
        ])
        setExam(examData)
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

      {/* Problem list placeholder — problems are linked from assignments */}
      {!ended && (
        <div className="p-4 rounded-lg bg-oj-surface border border-oj-border text-sm text-oj-fg-muted">
          To attempt a problem, navigate to{' '}
          <code className="font-mono text-oj-accent">
            /exams/{examId}/problems/&lt;problem_id&gt;
          </code>
        </div>
      )}
    </div>
  )
}
