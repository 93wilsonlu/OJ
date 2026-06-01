import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiListExams } from '../api/exams'
import { useAuth } from '../hooks/useAuth'
import type { Exam } from '../types/exam'
import { formatDate } from '../utils/format'

type StatusFilter = 'all' | 'upcoming' | 'running' | 'expired'

const inputCls = `w-full bg-oj-surface2 border border-oj-border rounded px-3 py-1.5
                  text-sm text-oj-fg focus:outline-none focus:ring-1 focus:ring-oj-accent`

function examStatus(exam: Exam): StatusFilter {
  const now = Date.now()
  const start = new Date(exam.start_time).getTime()
  const end = new Date(exam.end_time).getTime()
  if (now < start) return 'upcoming'
  if (now > end) return 'expired'
  return 'running'
}

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'All',
  upcoming: 'Upcoming',
  running: 'Running',
  expired: 'Expired',
}

const STATUS_COLORS: Record<StatusFilter, string> = {
  all: '',
  upcoming: 'text-blue-400',
  running: 'text-green-400',
  expired: 'text-slate-500',
}

export default function InterviewerDashboard() {
  const { getAccessToken } = useAuth()
  const navigate = useNavigate()
  const [token, setToken] = useState<string | null>(null)
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  useEffect(() => {
    getAccessToken().then(setToken)
  }, [getAccessToken])

  useEffect(() => {
    if (!token) return
    apiListExams(token)
      .then(setExams)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load exams'))
      .finally(() => setLoading(false))
  }, [token])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return exams.filter((e) => {
      const matchSearch = e.title.toLowerCase().includes(q)
      const matchStatus = statusFilter === 'all' || examStatus(e) === statusFilter
      return matchSearch && matchStatus
    })
  }, [exams, search, statusFilter])

  if (loading) return <div className="p-8 text-oj-fg-muted text-sm font-mono">Loading…</div>
  if (error) return <div className="p-8 text-red-400 text-sm font-mono">Error: {error}</div>

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-oj-fg">Exam Management</h1>
        <button
          onClick={() => navigate('/exams/new')}
          className="bg-oj-accent text-oj-bg px-4 py-2 rounded-md text-sm font-semibold hover:opacity-90"
        >
          + New Exam
        </button>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search exams…"
          className={`${inputCls} max-w-xs`}
        />
        <div className="flex gap-1">
          {(['all', 'upcoming', 'running', 'expired'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                statusFilter === s
                  ? 'border-oj-accent bg-oj-accent/10 text-oj-accent'
                  : 'border-oj-border text-oj-fg-muted hover:bg-oj-surface2'
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <section className="bg-oj-surface border border-oj-border rounded-lg overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-oj-surface border-b border-oj-border text-oj-fg-muted uppercase tracking-wide">
            <tr>
              <th className="p-4 font-semibold">Title</th>
              <th className="p-4 font-semibold">Status</th>
              <th className="p-4 font-semibold">Start Time</th>
              <th className="p-4 font-semibold">End Time</th>
              <th className="p-4 font-semibold" colSpan={2}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-oj-border">
            {filtered.map((exam) => {
              const status = examStatus(exam)
              return (
                <tr key={exam.exam_id} className="hover:bg-black/20 transition-colors text-oj-fg">
                  <td className="p-4 font-medium">{exam.title}</td>
                  <td className={`p-4 text-xs font-mono ${STATUS_COLORS[status]}`}>
                    {STATUS_LABELS[status]}
                  </td>
                  <td className="p-4 font-mono text-xs">{formatDate(exam.start_time)}</td>
                  <td className="p-4 font-mono text-xs">{formatDate(exam.end_time)}</td>
                  <td className="p-4">
                    <Link to={`/exams/${exam.exam_id}/manage`} className="text-oj-accent hover:underline text-xs">
                      Manage →
                    </Link>
                  </td>
                  <td className="p-4">
                    <Link to={`/exams/${exam.exam_id}/results`} className="text-oj-fg-muted hover:underline text-xs">
                      Results →
                    </Link>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-oj-fg-muted">
                  {exams.length === 0 ? 'No exams yet.' : 'No exams match your search.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
