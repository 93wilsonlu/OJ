import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGetExamResults, apiUnlockExamCandidate } from '../api/admin'
import { apiGetSubmission } from '../api/submissions'
import VerdictBadge from '../components/VerdictBadge'
import { useAuth } from '../hooks/useAuth'
import type { ExamCandidateResult, ExamProblemResult, ExamResults } from '../types/admin'
import type { SubmissionDetail } from '../types/submission'
import { formatDate, formatScore } from '../utils/format'

interface ProblemColumn {
  problem_id: string
  title: string
}

interface CodeViewer {
  candidateName: string
  candidateEmail: string
  problemTitle: string
  submissionId: string
  language: string | null
  submittedAt: string | null
  verdict: string | null
  sourceCode: string | null
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

function isAccepted(problem: ExamProblemResult | undefined) {
  return problem?.best_score === 100 || problem?.display_submission_verdict === 'Accepted'
}

function solvedCount(candidate: ExamCandidateResult) {
  return candidate.problems.filter((problem) => isAccepted(problem)).length
}

function formatLockReason(reason: string | null) {
  return reason ? reason.replace(/_/g, ' ') : 'Locked'
}

function codeLines(sourceCode: string) {
  return sourceCode.split('\n')
}

export default function ExamResultsPage() {
  const { examId } = useParams<{ examId: string }>()
  const { getAccessToken } = useAuth()
  const [results, setResults] = useState<ExamResults | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unlockingId, setUnlockingId] = useState<string | null>(null)
  const [candidateQuery, setCandidateQuery] = useState('')
  const [problemFilterId, setProblemFilterId] = useState('')
  const [solvedCountFilter, setSolvedCountFilter] = useState('')
  const [minScoreFilter, setMinScoreFilter] = useState('')
  const [maxScoreFilter, setMaxScoreFilter] = useState('')
  const [sortBy, setSortBy] = useState('total_desc')
  const [codeViewer, setCodeViewer] = useState<CodeViewer | null>(null)
  const [codeLoadingId, setCodeLoadingId] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)

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
  const filteredCandidates = useMemo(() => {
    if (!results) return []
    const query = candidateQuery.trim().toLowerCase()
    const countValue = solvedCountFilter === '' ? null : Number(solvedCountFilter)
    const minScore = minScoreFilter === '' ? null : Number(minScoreFilter)
    const maxScore = maxScoreFilter === '' ? null : Number(maxScoreFilter)

    return results.candidates.filter((candidate) => {
      if (
        query &&
        !candidate.name.toLowerCase().includes(query) &&
        !candidate.email.toLowerCase().includes(query)
      ) {
        return false
      }

      if (problemFilterId) {
        const problem = candidate.problems.find((item) => item.problem_id === problemFilterId)
        if (!isAccepted(problem)) return false
      }

      if (countValue !== null && Number.isFinite(countValue)) {
        const count = solvedCount(candidate)
        if (count < countValue) return false
      }

      if (minScore !== null && Number.isFinite(minScore) && candidate.total_score < minScore) {
        return false
      }

      if (maxScore !== null && Number.isFinite(maxScore) && candidate.total_score > maxScore) {
        return false
      }

      return true
    }).sort((a, b) => {
      if (sortBy === 'total_asc') return a.total_score - b.total_score
      if (sortBy === 'ac_desc') return solvedCount(b) - solvedCount(a)
      if (sortBy === 'ac_asc') return solvedCount(a) - solvedCount(b)
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name) || a.email.localeCompare(b.email)
      return b.total_score - a.total_score
    })
  }, [candidateQuery, maxScoreFilter, minScoreFilter, problemFilterId, results, solvedCountFilter, sortBy])

  function clearFilters() {
    setCandidateQuery('')
    setProblemFilterId('')
    setSolvedCountFilter('')
    setMinScoreFilter('')
    setMaxScoreFilter('')
    setSortBy('total_desc')
  }

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

  async function handleViewCode(candidate: ExamCandidateResult, problem: ExamProblemResult) {
    if (!problem.display_submission_id || codeLoadingId) return
    setCodeError(null)
    setCodeLoadingId(problem.display_submission_id)
    setCodeViewer({
      candidateName: candidate.name,
      candidateEmail: candidate.email,
      problemTitle: problem.title,
      submissionId: problem.display_submission_id,
      language: problem.display_submission_language,
      submittedAt: problem.display_submission_submitted_at,
      verdict: problem.display_submission_verdict,
      sourceCode: null,
    })
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Session expired. Please sign in again.')
      const submission: SubmissionDetail = await apiGetSubmission(token, problem.display_submission_id)
      setCodeViewer({
        candidateName: candidate.name,
        candidateEmail: candidate.email,
        problemTitle: problem.title,
        submissionId: submission.submission_id,
        language: submission.language,
        submittedAt: submission.submitted_at,
        verdict: submission.judge_result?.verdict ?? problem.display_submission_verdict ?? submission.status,
        sourceCode: submission.source_code ?? null,
      })
    } catch (e) {
      setCodeError(e instanceof Error ? e.message : 'Failed to load source code')
    } finally {
      setCodeLoadingId(null)
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
        <>
        <div className="mb-4 rounded-lg border border-oj-border bg-oj-surface p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(180px,240px)_110px_110px_110px_minmax(150px,180px)_auto] md:items-end">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-oj-fg-muted">
                Search name or email
              </span>
              <input
                className="input"
                value={candidateQuery}
                onChange={(event) => setCandidateQuery(event.target.value)}
                placeholder="candidate@example.com"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-oj-fg-muted">
                AC problem
              </span>
              <select
                className="input"
                value={problemFilterId}
                onChange={(event) => setProblemFilterId(event.target.value)}
              >
                <option value="">Any problem</option>
                {columns.map((problem) => (
                  <option key={problem.problem_id} value={problem.problem_id}>
                    {problem.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-oj-fg-muted">
                Min AC count
              </span>
              <input
                className="input"
                min={0}
                max={columns.length}
                type="number"
                value={solvedCountFilter}
                onChange={(event) => setSolvedCountFilter(event.target.value)}
                placeholder="0"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-oj-fg-muted">
                Min score
              </span>
              <input
                className="input"
                min={0}
                type="number"
                value={minScoreFilter}
                onChange={(event) => setMinScoreFilter(event.target.value)}
                placeholder="0"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-oj-fg-muted">
                Max score
              </span>
              <input
                className="input"
                min={0}
                type="number"
                value={maxScoreFilter}
                onChange={(event) => setMaxScoreFilter(event.target.value)}
                placeholder="100"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-oj-fg-muted">
                Sort by
              </span>
              <select
                className="input"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
              >
                <option value="total_desc">Total score high</option>
                <option value="total_asc">Total score low</option>
                <option value="ac_desc">AC count high</option>
                <option value="ac_asc">AC count low</option>
                <option value="name_asc">Name A-Z</option>
              </select>
            </label>
            <button
              type="button"
              className="btn-secondary h-11 px-3"
              onClick={clearFilters}
            >
              Clear
            </button>
          </div>
          <div className="mt-3 text-xs text-oj-fg-muted">
            Showing {filteredCandidates.length} of {results.candidates.length} candidates
          </div>
        </div>
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
              {filteredCandidates.map((candidate) => {
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
                              {problem.display_submission_id && (
                                <button
                                  type="button"
                                  className="rounded border border-oj-border px-2 py-1 text-xs font-medium text-oj-fg hover:bg-oj-surface2 disabled:cursor-not-allowed disabled:opacity-60"
                                  disabled={codeLoadingId === problem.display_submission_id}
                                  onClick={() => handleViewCode(candidate, problem)}
                                >
                                  {codeLoadingId === problem.display_submission_id ? 'Loading...' : 'View code'}
                                </button>
                              )}
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
              {filteredCandidates.length === 0 && (
                <tr>
                  <td
                    className="px-4 py-8 text-center text-sm text-oj-fg-muted"
                    colSpan={columns.length + 3}
                  >
                    No candidates match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}
      {codeViewer && (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6"
          role="dialog"
        >
          <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 bg-slate-900 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-100">
                  {codeViewer.candidateName} / {codeViewer.problemTitle}
                </div>
                <div className="mt-1 font-mono text-xs text-slate-400">
                  {codeViewer.candidateEmail}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                {codeViewer.verdict && <VerdictBadge verdict={codeViewer.verdict} />}
                <button
                  type="button"
                  className="rounded border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
                  onClick={() => {
                    setCodeViewer(null)
                    setCodeError(null)
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 border-b border-slate-800 bg-slate-900 px-4 py-2 font-mono text-xs text-slate-400">
              <span>{codeViewer.language ?? 'unknown language'}</span>
              <span>{codeViewer.submittedAt ? formatDate(codeViewer.submittedAt) : 'unknown time'}</span>
              <span>{codeViewer.submissionId}</span>
            </div>
            <div className="min-h-[320px] overflow-auto bg-slate-950">
              {codeError ? (
                <div className="p-4 text-sm text-red-300">{codeError}</div>
              ) : codeViewer.sourceCode === null ? (
                <div className="p-4 font-mono text-sm text-slate-400">Loading source code...</div>
              ) : codeViewer.sourceCode ? (
                <div className="font-mono text-xs leading-5 text-slate-100">
                  {codeLines(codeViewer.sourceCode).map((line, index) => (
                    <div key={index} className="grid grid-cols-[4rem_minmax(0,1fr)]">
                      <span className="select-none border-r border-slate-800 pr-3 text-right text-slate-600">
                        {index + 1}
                      </span>
                      <code className="whitespace-pre px-4">{line || ' '}</code>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-sm text-slate-400">
                  Source code is unavailable for this submission.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
