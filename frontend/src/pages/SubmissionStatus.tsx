import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGetExamAccess } from '../api/exams'
import VerdictBadge from '../components/VerdictBadge'
import { useAuth } from '../hooks/useAuth'
import { useSubmissionPoller } from '../hooks/useSubmissionPoller'
import { formatDate } from '../utils/format'

function metricValue(value: number | null | undefined, suffix = '') {
  if (value === null || value === undefined) return '-'
  return `${value}${suffix}`
}

export default function SubmissionStatus() {
  const { examId, submissionId } = useParams<{ examId?: string; submissionId: string }>()
  const { user, getAccessToken } = useAuth()
  const { data, error } = useSubmissionPoller(submissionId ?? null, getAccessToken)
  const [canEditSubmission, setCanEditSubmission] = useState(true)

  useEffect(() => {
    if (!data || user?.role !== 'candidate') return
    let cancelled = false

    async function loadAccess() {
      try {
        const token = await getAccessToken()
        if (!token) throw new Error('Session expired. Please sign in again.')
        const access = await apiGetExamAccess(token, data!.exam_id)
        if (!cancelled) setCanEditSubmission(access.can_edit_submission)
      } catch {
        if (!cancelled) setCanEditSubmission(false)
      }
    }

    loadAccess()
    return () => {
      cancelled = true
    }
  }, [data, getAccessToken, user?.role])

  if (error) {
    return <div className="p-8 text-red-700 text-sm font-mono">Error: {error}</div>
  }

  if (!data) {
    return <div className="p-8 text-oj-fg-muted text-sm font-mono animate-pulse">Loading...</div>
  }

  const submission = data
  if (examId && submission.exam_id !== examId) {
    return (
      <div className="p-8 text-red-700 text-sm font-mono">
        Error: Submission does not belong to this exam.
      </div>
    )
  }

  const jr = submission.judge_result
  const displayVerdict = jr?.verdict ?? submission.status
  const isRunning = (submission.status === 'pending' || submission.status === 'judging') && !jr
  const canReuseCode = Boolean(submission.source_code) && canEditSubmission
  const editorUrl = `/exams/${submission.exam_id}/problems/${submission.problem_id}?fromSubmission=${submission.submission_id}`

  function saveCodeForEditor() {
    if (!submission.source_code) return
    sessionStorage.setItem(
      `submission-reuse:${submission.submission_id}`,
      JSON.stringify({
        exam_id: submission.exam_id,
        problem_id: submission.problem_id,
        language: submission.language,
        code: submission.source_code,
      }),
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {examId && (
        <div className="mb-5">
          <Link
            to={`/exams/${examId}`}
            className="rounded-md border border-oj-border bg-white px-3 py-1.5 text-xs font-semibold text-oj-fg
                       hover:border-oj-accent hover:text-oj-accent"
          >
            Back to exam
          </Link>
        </div>
      )}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-oj-fg">Submission</h1>
          <p className="mt-1 text-sm text-oj-fg-muted font-mono">{submission.submission_id}</p>
        </div>
        <VerdictBadge verdict={displayVerdict} showFull />
      </div>

      <section className="rounded-lg border border-oj-border bg-oj-surface">
        <dl className="divide-y divide-oj-border text-sm">
          <InfoRow label="Language" value={submission.language} />
          <InfoRow label="Submitted" value={formatDate(submission.submitted_at)} />
          <InfoRow label="Status" value={submission.status} />
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
          {submission.status === 'pending' ? 'Waiting in queue...' : 'Judging...'}
        </p>
      )}

      {jr?.error_message && (
        <section className="mt-5">
          <h2 className="mb-2 text-sm font-semibold text-oj-fg">Judge Message</h2>
          <pre className="overflow-auto rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 whitespace-pre-wrap">
            {jr.error_message}
          </pre>
        </section>
      )}

      <section className="mt-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-oj-fg">Source Code</h2>
          {canReuseCode && (
            <Link
              to={editorUrl}
              onClick={saveCodeForEditor}
              className="rounded-md bg-oj-accent px-3 py-1.5 text-xs font-semibold text-white
                         hover:bg-oj-accent-dim"
            >
              Use in editor
            </Link>
          )}
        </div>
        {submission.source_code ? (
          <pre className="max-h-[420px] overflow-auto rounded-lg border border-oj-border bg-oj-bg p-4 text-xs text-oj-fg whitespace-pre">
            {submission.source_code}
          </pre>
        ) : (
          <div className="rounded-lg border border-oj-border bg-oj-surface p-4 text-sm text-oj-fg-muted">
            Source code is unavailable for this submission.
          </div>
        )}
      </section>
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
