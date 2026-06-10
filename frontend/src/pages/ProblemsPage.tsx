import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiDeleteProblem, apiListProblems } from '../api/problems'
import { useAuth } from '../hooks/useAuth'
import type { Difficulty, Problem } from '../types/problem'

const DIFFICULTY_STYLE: Record<Difficulty, string> = {
  easy:   'bg-green-50 text-green-700 ring-1 ring-green-200',
  medium: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  hard:   'bg-red-50 text-red-700 ring-1 ring-red-200',
}

const DIFFICULTY_ORDER: Record<Difficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
}

type SortMode =
  | 'default'
  | 'created_newest'
  | 'created_oldest'
  | 'difficulty_easy'
  | 'difficulty_hard'
  | 'title'

function sortProblems(problems: Problem[], sortMode: SortMode) {
  const items = [...problems]
  if (sortMode === 'created_newest') {
    return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }
  if (sortMode === 'created_oldest') {
    return items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }
  if (sortMode === 'difficulty_easy') {
    return items.sort((a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty])
  }
  if (sortMode === 'difficulty_hard') {
    return items.sort((a, b) => DIFFICULTY_ORDER[b.difficulty] - DIFFICULTY_ORDER[a.difficulty])
  }
  if (sortMode === 'title') {
    return items.sort((a, b) => a.title.localeCompare(b.title))
  }
  return items
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProblemsPage() {
  const { user, getAccessToken } = useAuth()
  const navigate = useNavigate()
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('default')
  const [query, setQuery] = useState('')

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
  if (error) return <div className="p-8 text-red-700 text-sm font-mono">Error: {error}</div>

  const canWrite = user?.role === 'problem_admin' || user?.role === 'admin'
  const filteredProblems = problems.filter((problem) =>
    problem.title.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const sortedProblems = sortProblems(filteredProblems, sortMode)

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-oj-fg">Problems</h1>
          {canWrite && (
            <button
              onClick={() => navigate('/problems/new')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium
                         bg-oj-accent text-white hover:bg-oj-accent-dim transition-colors"
            >
              <span aria-hidden>+</span> New Problem
            </button>
          )}
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search problems..."
            className="w-full rounded border border-oj-border bg-oj-surface2 px-3 py-2 text-sm text-oj-fg
                       placeholder:text-oj-fg-muted focus:outline-none focus:ring-1 focus:ring-oj-accent"
          />
          <label className="flex items-center gap-2 text-xs text-oj-fg-muted font-mono">
            Sort
            <select
              aria-label="Sort problems"
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="rounded border border-oj-border bg-oj-surface2 px-3 py-1.5 text-sm text-oj-fg
                         focus:outline-none focus:ring-1 focus:ring-oj-accent"
            >
              <option value="default">Default</option>
              <option value="created_newest">Created newest</option>
              <option value="created_oldest">Created oldest</option>
              <option value="difficulty_easy">Difficulty: easy to hard</option>
              <option value="difficulty_hard">Difficulty: hard to easy</option>
              <option value="title">Title A-Z</option>
            </select>
          </label>
        </div>

        {problems.length === 0 ? (
          <p className="text-oj-fg-muted text-sm">No problems yet.</p>
        ) : sortedProblems.length === 0 ? (
          <p className="text-oj-fg-muted text-sm">No problems match your search.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-oj-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-oj-border bg-oj-surface2">
                  <th className="text-left px-4 py-2.5 text-oj-fg-muted font-medium">Title</th>
                  <th className="text-left px-4 py-2.5 text-oj-fg-muted font-medium">Difficulty</th>
                  <th className="text-left px-4 py-2.5 text-oj-fg-muted font-medium font-mono">Time</th>
                  <th className="text-left px-4 py-2.5 text-oj-fg-muted font-medium font-mono">Memory</th>
                  <th className="text-left px-4 py-2.5 text-oj-fg-muted font-medium">Languages</th>
                  {canWrite && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {sortedProblems.map((p) => (
                  <tr
                    key={p.problem_id}
                    className="border-b border-oj-border last:border-0 hover:bg-red-50/40 transition-colors"
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
                            className="text-xs text-red-600/70 hover:text-red-700 transition-colors"
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
