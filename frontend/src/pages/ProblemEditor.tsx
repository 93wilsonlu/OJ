import Editor from '@monaco-editor/react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiCreateSubmission } from '../api/submissions'
import { useAuth } from '../hooks/useAuth'
import { useSubmissionPoller } from '../hooks/useSubmissionPoller'
import type { SubmissionStatus } from '../types/submission'

const LANGUAGES = [
  { value: 'python3', label: 'Python 3' },
  { value: 'cpp17', label: 'C++17' },
]

const MONACO_LANG: Record<string, string> = {
  python3: 'python',
  cpp17: 'cpp',
}

const DEFAULT_CODE: Record<string, string> = {
  python3: '# Write your solution here\n',
  cpp17: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // write your solution\n    return 0;\n}\n',
}

function VerdictPanel({ status, verdict, error }: {
  status: SubmissionStatus | null
  verdict: string | null
  error: string | null
}) {
  if (!status) return null

  const verdictStyles: Record<string, string> = {
    Accepted: 'text-green-400',
    'Wrong Answer': 'text-red-400',
    'Compile Error': 'text-orange-400',
    'Runtime Error': 'text-red-400',
    'Time Limit Exceeded': 'text-yellow-400',
    'Memory Limit Exceeded': 'text-yellow-400',
    'System Error': 'text-slate-400',
  }

  return (
    <div className="mt-4 p-4 rounded-lg bg-oj-surface border border-oj-border text-sm font-mono">
      {status === 'pending' || status === 'judging' ? (
        <span className="text-oj-fg-muted animate-pulse">
          {status === 'pending' ? 'Queued…' : 'Judging…'}
        </span>
      ) : verdict ? (
        <span className={verdictStyles[verdict] ?? 'text-oj-fg'}>
          {verdict}
        </span>
      ) : null}
      {error && <p className="text-red-400 mt-1 whitespace-pre-wrap">{error}</p>}
    </div>
  )
}

export default function ProblemEditor() {
  const { examId, problemId } = useParams<{ examId: string; problemId: string }>()
  const { accessToken, getAccessToken } = useAuth()

  const [language, setLanguage] = useState('python3')
  const [code, setCode] = useState(DEFAULT_CODE['python3'])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submissionId, setSubmissionId] = useState<string | null>(null)

  const { data: submissionData } = useSubmissionPoller(submissionId, accessToken)

  function handleLanguageChange(lang: string) {
    setLanguage(lang)
    setCode(DEFAULT_CODE[lang] ?? '')
  }

  async function handleSubmit() {
    if (!examId || !problemId) return
    setSubmitting(true)
    setSubmitError(null)
    setSubmissionId(null)

    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const submission = await apiCreateSubmission(token, {
        exam_id: examId,
        problem_id: problemId,
        language,
        code,
      })
      setSubmissionId(submission.submission_id)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-oj-surface border-b border-oj-border shrink-0">
        <select
          value={language}
          onChange={(e) => handleLanguageChange(e.target.value)}
          className="text-sm bg-oj-surface2 text-oj-fg border border-oj-border rounded px-2 py-1
                     focus:outline-none focus:ring-1 focus:ring-oj-accent"
        >
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="ml-auto px-4 py-1.5 rounded-md text-sm font-medium
                     bg-oj-accent text-oj-bg hover:bg-oj-accent/90
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={MONACO_LANG[language] ?? language}
          value={code}
          onChange={(value) => setCode(value ?? '')}
          theme="vs-dark"
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
          }}
        />
      </div>

      {/* Result panel */}
      <div className="shrink-0 px-4 pb-4">
        {submitError && (
          <div className="mt-4 p-3 rounded-lg bg-red-900/20 border border-red-700/50
                          text-sm font-mono text-red-400">
            {submitError}
          </div>
        )}
        <VerdictPanel
          status={submissionData?.status ?? null}
          verdict={submissionData?.judge_result?.verdict ?? null}
          error={submissionData?.judge_result?.error_message ?? null}
        />
      </div>
    </div>
  )
}
