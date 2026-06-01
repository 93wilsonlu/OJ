import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getErrorMessage } from '../api/errors'
import { apiListSubmissions } from '../api/submissions'
import VerdictBadge from '../components/VerdictBadge'
import { useAuth } from '../hooks/useAuth'
import type { SubmissionListItem } from '../types/submission'
import { formatDate, formatScore } from '../utils/format'

function verdictOf(submission: SubmissionListItem) {
  return submission.judge_result?.verdict ?? submission.status
}

function uniqueVerdicts(submissions: SubmissionListItem[]) {
  return [...new Set(submissions.map(verdictOf))].sort()
}

export default function SubmissionsPage() {
  const { user, getAccessToken } = useAuth()
  const [submissions, setSubmissions] = useState<SubmissionListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    let cancelled = false

    async function loadSubmissions() {
      setLoading(true)
      setError(null)
      try {
        const token = await getAccessToken()
        if (!token) throw new Error('Session expired. Please sign in again.')
        const candidate = appliedQuery.trim()
        const data = await apiListSubmissions(token, candidate ? { candidate } : undefined)
        if (!cancelled) setSubmissions(data)
      } catch (e) {
        if (!cancelled) setError(getErrorMessage(e, 'Failed to load submissions'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadSubmissions()
    return () => {
      cancelled = true
    }
  }, [appliedQuery, getAccessToken])

  if (loading) {
    return <div className="p-8 text-oj-fg-muted text-sm font-mono">Loading submissions...</div>
  }

  if (error) {
    return <div className="p-8 text-red-700 text-sm font-mono">Error: {error}</div>
  }

  const isCandidate = user?.role === 'candidate'
  const verdictOptions = uniqueVerdicts(submissions)
  const filteredSubmissions = submissions.filter((submission) => {
    const verdict = verdictOf(submission)
    const q = query.trim().toLowerCase()
    const matchesStatus = statusFilter === 'all' || verdict === statusFilter
    const matchesQuery = !q || [
      submission.problem_title,
      submission.exam_title,
      submission.problem_id,
      submission.submission_id,
      submission.candidate_name,
      submission.candidate_email,
      submission.language,
    ].some((value) => value.toLowerCase().includes(q))
    return matchesStatus && matchesQuery
  })
  const acceptedCount = submissions.filter((submission) => verdictOf(submission) === 'Accepted').length
  const runningCount = submissions.filter((submission) => (
    submission.status === 'pending' || submission.status === 'judging'
  )).length
  const latestSubmittedAt = submissions[0]?.submitted_at

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-oj-fg">
          {isCandidate ? 'My Submissions' : 'Submissions'}
        </h1>
        <p className="text-sm text-oj-fg-muted mt-1">
          {isCandidate
            ? 'All of your submitted answers across assigned problems.'
            : 'Submission status for all candidates.'}
        </p>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <SummaryCard label="Total" value={String(submissions.length)} />
        <SummaryCard label="Accepted" value={String(acceptedCount)} />
        <SummaryCard label="Running" value={String(runningCount)} />
        <SummaryCard label="Latest" value={latestSubmittedAt ? formatDate(latestSubmittedAt) : '-'} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          setAppliedQuery(query.trim())
        }}
        className="mb-4 flex flex-col gap-3 rounded-lg border border-oj-border bg-oj-surface p-3 sm:flex-row"
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={isCandidate ? 'Search problem, exam, submission...' : 'Search candidate name or Gmail...'}
          className="min-w-0 flex-1 rounded border border-oj-border bg-oj-bg px-3 py-2 text-sm text-oj-fg
                     placeholder:text-oj-fg-muted focus:outline-none focus:ring-1 focus:ring-oj-accent"
        />
        {!isCandidate && (
          <button
            type="submit"
            className="rounded border border-oj-accent bg-oj-accent px-4 py-2 text-sm font-medium text-white
                       transition-colors hover:bg-red-700"
          >
            Search
          </button>
        )}
        <select
          aria-label="Verdict filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded border border-oj-border bg-oj-bg px-3 py-2 text-sm text-oj-fg
                     focus:outline-none focus:ring-1 focus:ring-oj-accent"
        >
          <option value="all">All statuses</option>
          {verdictOptions.map((verdict) => (
            <option key={verdict} value={verdict}>{verdict}</option>
          ))}
        </select>
      </form>

      {submissions.length === 0 ? (
        <p className="text-sm text-oj-fg-muted">No submissions yet.</p>
      ) : filteredSubmissions.length === 0 ? (
        <p className="text-sm text-oj-fg-muted">No submissions match your filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-oj-border bg-oj-surface">
          <table className="min-w-full divide-y divide-oj-border text-sm">
            <thead className="bg-oj-surface2">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-oj-fg-muted">
                  Problem
                </th>
                {!isCandidate && (
                  <th className="px-4 py-3 text-left font-semibold text-oj-fg-muted">
                    Candidate
                  </th>
                )}
                <th className="px-4 py-3 text-left font-semibold text-oj-fg-muted">
                  Language
                </th>
                <th className="px-4 py-3 text-left font-semibold text-oj-fg-muted">
                  Status
                </th>
                <th className="px-4 py-3 text-right font-semibold text-oj-fg-muted">
                  Score
                </th>
                <th className="px-4 py-3 text-left font-semibold text-oj-fg-muted">
                  Submitted
                </th>
                <th className="px-4 py-3 text-right font-semibold text-oj-fg-muted">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-oj-border">
              {filteredSubmissions.map((submission) => {
                const verdict = verdictOf(submission)
                return (
                  <tr key={submission.submission_id} className="transition-colors hover:bg-red-50/40">
                    <td className="px-4 py-3">
                      <div className="font-medium text-oj-fg">{submission.problem_title}</div>
                      <div className="text-xs text-oj-fg-muted font-mono mt-0.5">
                        {submission.exam_title} / {submission.problem_id.slice(0, 8)}
                      </div>
                    </td>
                    {!isCandidate && (
                      <td className="px-4 py-3">
                        <div className="font-medium text-oj-fg">{submission.candidate_name}</div>
                        <div className="text-xs text-oj-fg-muted font-mono mt-0.5">
                          {submission.candidate_email}
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3 text-oj-fg-muted font-mono">
                      {submission.language}
                    </td>
                    <td className="px-4 py-3">
                      <VerdictBadge verdict={verdict} showFull />
                    </td>
                    <td className="px-4 py-3 text-right text-oj-fg font-mono">
                      {formatScore(submission.judge_result?.score)}
                    </td>
                    <td className="px-4 py-3 text-oj-fg-muted font-mono whitespace-nowrap">
                      {formatDate(submission.submitted_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/submissions/${submission.submission_id}`}
                        className="text-xs text-oj-accent hover:underline"
                      >
                        View
                      </Link>
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

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-oj-border bg-oj-surface px-3 py-2">
      <div className="text-xs text-oj-fg-muted font-mono">{label}</div>
      <div className="mt-0.5 truncate text-sm text-oj-fg font-mono">{value}</div>
    </div>
  )
}
