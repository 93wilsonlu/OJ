import { useParams } from 'react-router-dom'
import VerdictBadge from '../components/VerdictBadge'
import { useAuth } from '../hooks/useAuth'
import { useSubmissionPoller } from '../hooks/useSubmissionPoller'

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function metricValue(value: number | null | undefined, suffix = '') {
  if (value === null || value === undefined) return '-'
  return `${value}${suffix}`
}

export default function SubmissionStatus() {
  const { submissionId } = useParams<{ submissionId: string }>()
  const { getAccessToken } = useAuth()
  const { data, error } = useSubmissionPoller(submissionId ?? null, getAccessToken)

  if (error) {
    return <div className="p-8 text-red-400 text-sm font-mono">Error: {error}</div>
  }

  if (!data) {
    return <div className="p-8 text-oj-fg-muted text-sm font-mono animate-pulse">Loading...</div>
  }

  const jr = data.judge_result
  const displayVerdict = jr?.verdict ?? data.status
  const isRunning = (data.status === 'pending' || data.status === 'judging') && !jr

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-oj-fg">Submission</h1>
          <p className="mt-1 text-sm text-oj-fg-muted font-mono">{data.submission_id}</p>
        </div>
        <VerdictBadge verdict={displayVerdict} showFull />
      </div>

      <section className="rounded-lg border border-oj-border bg-oj-surface">
        <dl className="divide-y divide-oj-border text-sm">
          <InfoRow label="Language" value={data.language} />
          <InfoRow label="Submitted" value={formatDate(data.submitted_at)} />
          <InfoRow label="Status" value={data.status} />
          <InfoRow label="Score" value={metricValue(jr?.score)} />
          <InfoRow
            label="Passed"
            value={jr?.passed_count === null || jr?.passed_count === undefined ? '-' : `${jr.passed_count} / ${jr.total_count}`}
          />
          <InfoRow label="Time" value={metricValue(jr?.execution_time, ' ms')} />
          <InfoRow label="Memory" value={metricValue(jr?.memory_usage, ' KB')} />
        </dl>
      </section>

      {isRunning && (
        <p className="mt-4 text-sm text-oj-fg-muted font-mono animate-pulse">
          {data.status === 'pending' ? 'Waiting in queue...' : 'Judging...'}
        </p>
      )}

      {jr?.error_message && (
        <section className="mt-5">
          <h2 className="mb-2 text-sm font-semibold text-oj-fg">Judge Message</h2>
          <pre className="overflow-auto rounded-lg border border-red-700/50 bg-red-950/30 p-3 text-xs text-red-300 whitespace-pre-wrap">
            {jr.error_message}
          </pre>
        </section>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 px-4 py-3">
      <dt className="text-oj-fg-muted">{label}</dt>
      <dd className="min-w-0 truncate text-oj-fg font-mono">{value}</dd>
    </div>
  )
}
