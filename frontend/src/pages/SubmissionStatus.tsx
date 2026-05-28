import { useParams } from 'react-router-dom'
import VerdictBadge from '../components/VerdictBadge'
import { useAuth } from '../hooks/useAuth'
import { useSubmissionPoller } from '../hooks/useSubmissionPoller'

export default function SubmissionStatus() {
  const { submissionId } = useParams<{ submissionId: string }>()
  const { getAccessToken } = useAuth()
  const { data, error } = useSubmissionPoller(submissionId ?? null, getAccessToken)

  if (error) {
    return <div className="p-8 text-red-400 text-sm font-mono">Error: {error}</div>
  }

  if (!data) {
    return <div className="p-8 text-oj-fg-muted text-sm font-mono animate-pulse">Loading…</div>
  }

  const jr = data.judge_result

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 font-mono text-sm">
      <h1 className="text-oj-fg text-base font-semibold mb-4">Submission</h1>

      <dl className="space-y-2">
        <div className="flex gap-4">
          <dt className="text-oj-fg-muted w-32 shrink-0">ID</dt>
          <dd className="text-oj-fg truncate">{data.submission_id}</dd>
        </div>
        <div className="flex gap-4">
          <dt className="text-oj-fg-muted w-32 shrink-0">Language</dt>
          <dd className="text-oj-fg">{data.language}</dd>
        </div>
        <div className="flex gap-4">
          <dt className="text-oj-fg-muted w-32 shrink-0">Status</dt>
          <dd className="text-oj-fg capitalize">{data.status}</dd>
        </div>
      </dl>

      {jr && (
        <div className="mt-6 p-4 rounded-lg bg-oj-surface border border-oj-border space-y-2">
          <div className="flex gap-4">
            <span className="text-oj-fg-muted w-32 shrink-0">Verdict</span>
            <VerdictBadge verdict={jr.verdict} showFull />
          </div>
          {jr.score !== null && (
            <div className="flex gap-4">
              <span className="text-oj-fg-muted w-32 shrink-0">Score</span>
              <span className="text-oj-fg">{jr.score}</span>
            </div>
          )}
          {jr.passed_count !== null && (
            <div className="flex gap-4">
              <span className="text-oj-fg-muted w-32 shrink-0">Passed</span>
              <span className="text-oj-fg">{jr.passed_count} / {jr.total_count}</span>
            </div>
          )}
          {jr.execution_time !== null && (
            <div className="flex gap-4">
              <span className="text-oj-fg-muted w-32 shrink-0">Time</span>
              <span className="text-oj-fg">{jr.execution_time} ms</span>
            </div>
          )}
          {jr.error_message && (
            <div className="mt-2">
              <p className="text-oj-fg-muted mb-1">Error</p>
              <pre className="text-red-400 whitespace-pre-wrap text-xs bg-oj-bg p-2 rounded">
                {jr.error_message}
              </pre>
            </div>
          )}
        </div>
      )}

      {(data.status === 'pending' || data.status === 'judging') && !jr && (
        <p className="mt-4 text-oj-fg-muted animate-pulse">
          {data.status === 'pending' ? 'Waiting in queue…' : 'Judging…'}
        </p>
      )}
    </div>
  )
}
