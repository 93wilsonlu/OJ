import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGetExamResults, apiUnlockExamCandidate } from '../api/admin'
import VerdictBadge from '../components/VerdictBadge'
import { useAuth } from '../hooks/useAuth'
import type { ExamProblemResult, ExamResults } from '../types/admin'
import { formatScore } from '../utils/format'

interface ProblemColumn {
  problem_id: string
  title: string
}

function problemColumns(results: ExamResults | null): ProblemColumn[] {
  if (!results) return []
  const columns = new Map<string, ProblemColumn>()
  for (const candidate of results.candidates) {
    for (const problem of candidate.problems) {
      if (!columns.has(problem.problem_id)) {
        columns.set(problem.problem_id, {
          problem_id: problem.problem_id,
          title: problem.title,
        })
      }
    }
  }
  return Array.from(columns.values())
}

function problemMap(problems: ExamProblemResult[]) {
  return new Map(problems.map((problem) => [problem.problem_id, problem]))
}

function formatLockReason(reason: string | null) {
  return reason ? reason.replace(/_/g, ' ') : 'Locked'
}

export default function ExamResultsPage() {
  const { examId } = useParams<{ examId: string }>()
  const { getAccessToken } = useAuth()
  const [results, setResults] = useState<ExamResults | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unlockingId, setUnlockingId] = useState<string | null>(null)

  const loadResults = useCallback(async () => {
    if (!examId) return
    const token = await getAccessToken()
    if (!token) return
    const data = await apiGetExamResults(token, examId)
    setResults(data)
  }, [examId, getAccessToken])

  useEffect(() => {
    if (!examId) return
    loadResults()
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load results'))
      .finally(() => setLoading(false))
  }, [examId, loadResults])

  const columns = useMemo(() => problemColumns(results), [results])

  async function handleUnlock(candidateId: string) {
    if (!examId || unlockingId) return
    setError(null)
    setUnlockingId(candidateId)
    try {
      const token = await getAccessToken()
      if (!token) return
      await apiUnlockExamCandidate(token, examId, candidateId)
      await loadResults()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to unlock candidate')
    } finally {
      setUnlockingId(null)
    }
  }

  if (loading) {
    return <div className="p-8 text-oj-fg-muted text-sm font-mono">Loading results...</div>
  }

  if (error) {
    return <div className="p-8 text-red-400 text-sm font-mono">Error: {error}</div>
  }

  if (!results) return null

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link to="/exams" className="text-xs text-oj-accent hover:underline">
          Back to exams
        </Link>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-oj-fg">{results.title}</h1>
            <p className="text-sm text-oj-fg-muted mt-1">
              {results.candidates.length} candidates, {columns.length} problems
            </p>
          </div>
        </div>
      </div>

      {results.candidates.length === 0 ? (
        <p className="text-sm text-oj-fg-muted">No assigned candidates yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-oj-border bg-oj-surface">
          <table className="min-w-full divide-y divide-oj-border text-sm">
            <thead className="bg-oj-surface2">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-oj-fg-muted">
                  Candidate
                </th>
                <th className="px-4 py-3 text-left font-semibold text-oj-fg-muted">
                  Status
                </th>
                {columns.map((problem) => (
                  <th
                    key={problem.problem_id}
                    className="px-4 py-3 text-left font-semibold text-oj-fg-muted min-w-36"
                  >
                    {problem.title}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-semibold text-oj-fg-muted">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-oj-border">
              {results.candidates.map((candidate) => {
                const byProblem = problemMap(candidate.problems)
                return (
                  <tr key={candidate.candidate_id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-oj-fg">{candidate.name}</div>
                      <div className="text-xs text-oj-fg-muted font-mono mt-0.5">
                        {candidate.email}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-2">
                        {!candidate.is_active && (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                            Inactive
                          </span>
                        )}
                        {candidate.proctoring_status === 'locked' ? (
                          <>
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                              Locked
                            </span>
                            <div className="text-xs text-oj-fg-muted">
                              {formatLockReason(candidate.lock_reason)}
                            </div>
                            <button
                              type="button"
                              className="rounded border border-oj-border px-2 py-1 text-xs font-medium text-oj-fg hover:bg-oj-surface2 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={unlockingId === candidate.candidate_id}
                              onClick={() => handleUnlock(candidate.candidate_id)}
                            >
                              {unlockingId === candidate.candidate_id ? 'Unlocking...' : 'Unlock'}
                            </button>
                          </>
                        ) : candidate.is_active ? (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            Active
                          </span>
                        ) : null}
                      </div>
                    </td>
                    {columns.map((column) => {
                      const problem = byProblem.get(column.problem_id)
                      return (
                        <td key={column.problem_id} className="px-4 py-3">
                          {problem ? (
                            <div className="space-y-1.5">
                              <div className="font-mono text-oj-fg">
                                {formatScore(problem.best_score)}
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {problem.latest_verdict ? (
                                  <VerdictBadge verdict={problem.latest_verdict} />
                                ) : (
                                  <span className="text-xs text-oj-fg-muted">No verdict</span>
                                )}
                                <span className="text-xs text-oj-fg-muted font-mono">
                                  {problem.submission_count} submissions
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-oj-fg-muted">Not assigned</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-4 py-3 text-right font-mono font-semibold text-oj-fg">
                      {formatScore(candidate.total_score)}
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
