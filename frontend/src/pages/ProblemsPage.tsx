import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiDeleteProblem, apiListProblems } from '../api/problems'
import { useAuth } from '../hooks/useAuth'
import type { Difficulty, Problem } from '../types/problem'

const DIFFICULTY_STYLE: Record<Difficulty, string> = {
  easy:   'bg-green-900/60 text-green-300 ring-1 ring-green-700',
  medium: 'bg-amber-900/60 text-amber-300 ring-1 ring-amber-700',
  hard:   'bg-red-900/60 text-red-300 ring-1 ring-red-700',
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProblemsPage() {
  const { user, getAccessToken } = useAuth()
  const navigate = useNavigate()
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    getAccessToken().then((t) => {
      if (!t) return
      setToken(t)
      apiListProblems(t)
        .then(setProblems)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false))
    })
  }, [getAccessToken])

  async function handleDelete(problemId: string) {
    if (!token) return
    if (!confirm('Delete this problem? This cannot be undone.')) return
    try {
      await apiDeleteProblem(token, problemId)
      setProblems((prev) => prev.filter((p) => p.problem_id !== problemId))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  if (loading) return <div className="p-8 text-oj-fg-muted text-sm font-mono">Loading…</div>
  if (error) return <div className="p-8 text-red-400 text-sm font-mono">Error: {error}</div>

  const canWrite = user?.role === 'problem_admin' || user?.role === 'admin'

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-oj-fg">Problems</h1>
          {canWrite && (
            <button
              onClick={() => navigate('/problems/new')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium
                         bg-oj-accent text-oj-bg hover:bg-oj-accent/90 transition-colors"
            >
              <span aria-hidden>+</span> New Problem
            </button>
          )}
        </div>

        {problems.length === 0 ? (
          <p className="text-oj-fg-muted text-sm">No problems yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-oj-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-oj-border bg-oj-surface/50">
                  <th className="text-left px-4 py-2.5 text-oj-fg-muted font-medium">Title</th>
                  <th className="text-left px-4 py-2.5 text-oj-fg-muted font-medium">Difficulty</th>
                  <th className="text-left px-4 py-2.5 text-oj-fg-muted font-medium font-mono">Time</th>
                  <th className="text-left px-4 py-2.5 text-oj-fg-muted font-medium font-mono">Memory</th>
                  <th className="text-left px-4 py-2.5 text-oj-fg-muted font-medium">Languages</th>
                  {canWrite && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {problems.map((p, i) => (
                  <tr
                    key={p.problem_id}
                    className={`border-b border-oj-border last:border-0 hover:bg-oj-surface/40 transition-colors
                                ${i % 2 === 0 ? '' : 'bg-oj-surface/20'}`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/problems/${p.problem_id}`}
                        className="font-medium text-oj-fg hover:text-oj-accent transition-colors"
                      >
                        {p.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full
                                        text-xs font-medium font-mono ${DIFFICULTY_STYLE[p.difficulty as Difficulty]}`}>
                        {p.difficulty}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-oj-fg-muted font-mono">{p.time_limit} ms</td>
                    <td className="px-4 py-3 text-oj-fg-muted font-mono">{p.memory_limit} MB</td>
                    <td className="px-4 py-3 text-oj-fg-muted font-mono text-xs">
                      {p.allowed_langs.join(', ')}
                    </td>
                    {canWrite && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            to={`/problems/${p.problem_id}`}
                            className="text-xs text-oj-accent hover:text-oj-accent/80 transition-colors"
                          >
                            Edit
                          </Link>
                          <button
                            onClick={() => handleDelete(p.problem_id)}
                            className="text-xs text-red-400/70 hover:text-red-400 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}
