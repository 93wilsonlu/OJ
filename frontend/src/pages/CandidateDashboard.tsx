import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiListExams } from '../api/exams'
import { useAuth } from '../hooks/useAuth'
import type { Exam } from '../types/exam'

function examStatus(exam: Exam): { label: string; style: string } {
  const now = new Date()
  const start = new Date(exam.start_time)
  const end = new Date(exam.end_time)
  if (now < start) return { label: 'Upcoming', style: 'bg-blue-900/60 text-blue-300 ring-1 ring-blue-700' }
  if (now > end) return { label: 'Ended', style: 'bg-slate-700/60 text-slate-400 ring-1 ring-slate-600' }
  return { label: 'Active', style: 'bg-green-900/60 text-green-300 ring-1 ring-green-700' }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function CandidateDashboard() {
  const { getAccessToken } = useAuth()
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getAccessToken().then((token) => {
      if (!token) return
      apiListExams(token)
        .then(setExams)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false))
    })
  }, [getAccessToken])

  if (loading) {
    return (
      <div className="p-8 text-oj-fg-muted text-sm font-mono">Loading exams…</div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-red-400 text-sm font-mono">Error: {error}</div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold text-oj-fg mb-6">My Exams</h1>

      {exams.length === 0 ? (
        <p className="text-oj-fg-muted text-sm">No exams assigned yet.</p>
      ) : (
        <ul className="space-y-3">
          {exams.map((exam) => {
            const status = examStatus(exam)
            return (
              <li key={exam.exam_id}>
                <Link
                  to={`/exams/${exam.exam_id}`}
                  className="block p-4 rounded-lg bg-oj-surface border border-oj-border
                             hover:border-oj-accent/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-oj-fg truncate">{exam.title}</span>
                    <span
                      className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full
                                  text-xs font-medium font-mono ${status.style}`}
                    >
                      {status.label}
                    </span>
                  </div>
                  <p className="text-xs text-oj-fg-muted mt-1 font-mono">
                    {fmtDate(exam.start_time)} – {fmtDate(exam.end_time)}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
