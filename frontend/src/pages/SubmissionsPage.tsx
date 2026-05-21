import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiListSubmissions } from '../api/submissions'
import VerdictBadge from '../components/VerdictBadge'
import { useAuth } from '../hooks/useAuth'
import type { SubmissionListItem } from '../types/submission'

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatScore(score: number | null | undefined) {
  if (score === null || score === undefined) return '-'
  return Number.isInteger(score) ? String(score) : score.toFixed(2)
}

export default function SubmissionsPage() {
  const { user, getAccessToken } = useAuth()
  const [submissions, setSubmissions] = useState<SubmissionListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getAccessToken().then((token) => {
      if (!token) return
      apiListSubmissions(token)
        .then(setSubmissions)
        .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load submissions'))
        .finally(() => setLoading(false))
    })
  }, [getAccessToken])

  if (loading) {
    return <div className="p-8 text-oj-fg-muted text-sm font-mono">Loading submissions...</div>
  }

  if (error) {
    return <div className="p-8 text-red-400 text-sm font-mono">Error: {error}</div>
  }

  const isCandidate = user?.role === 'candidate'

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

      {submissions.length === 0 ? (
        <p className="text-sm text-oj-fg-muted">No submissions yet.</p>
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
              {submissions.map((submission) => {
                const verdict = submission.judge_result?.verdict ?? submission.status
                return (
                  <tr key={submission.submission_id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-oj-fg">{submission.problem_title}</div>
                      <div className="text-xs text-oj-fg-muted font-mono mt-0.5">
                        {submission.problem_id.slice(0, 8)}
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
