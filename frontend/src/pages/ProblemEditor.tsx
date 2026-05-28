import Editor from '@monaco-editor/react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getErrorMessage } from '../api/errors'
import { apiGetProblem } from '../api/problems'
import { apiCreateSubmission } from '../api/submissions'
import { useAuth } from '../hooks/useAuth'
import { useSubmissionPoller } from '../hooks/useSubmissionPoller'
import type { Problem } from '../types/problem'
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

const DIFFICULTY_STYLE: Record<string, string> = {
  easy:   'bg-green-900/60 text-green-300 ring-1 ring-green-700',
  medium: 'bg-yellow-900/60 text-yellow-300 ring-1 ring-yellow-700',
  hard:   'bg-red-900/60 text-red-300 ring-1 ring-red-700',
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

function ProblemPanel({ problem }: { problem: Problem }) {
  const diffStyle = DIFFICULTY_STYLE[problem.difficulty] ?? ''
  return (
    <div className="w-2/5 border-r border-oj-border overflow-y-auto p-5 shrink-0">
      <div className="flex items-start gap-3 mb-4">
        <h1 className="text-base font-semibold text-oj-fg flex-1">{problem.title}</h1>
        <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full
                          text-xs font-medium font-mono capitalize ${diffStyle}`}>
          {problem.difficulty}
        </span>
      </div>

      <div className="flex gap-4 text-xs font-mono text-oj-fg-muted mb-5">
        <span>Time: {problem.time_limit} ms</span>
        <span>Memory: {problem.memory_limit} MB</span>
      </div>

      <div className="prose prose-invert prose-sm max-w-none text-oj-fg text-sm leading-relaxed">
        <p className="whitespace-pre-wrap">{problem.description}</p>

        {problem.input_format && (
          <>
            <h3 className="text-xs font-semibold text-oj-fg-muted uppercase tracking-wide mt-5 mb-1">
              Input
            </h3>
            <p className="whitespace-pre-wrap text-oj-fg">{problem.input_format}</p>
          </>
        )}

        {problem.output_format && (
          <>
            <h3 className="text-xs font-semibold text-oj-fg-muted uppercase tracking-wide mt-4 mb-1">
              Output
            </h3>
            <p className="whitespace-pre-wrap text-oj-fg">{problem.output_format}</p>
          </>
        )}

        {(problem.sample_input || problem.sample_output) && (
          <>
            <h3 className="text-xs font-semibold text-oj-fg-muted uppercase tracking-wide mt-4 mb-2">
              Example
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {problem.sample_input && (
                <div>
                  <p className="text-xs text-oj-fg-muted mb-1">Input</p>
                  <pre className="bg-oj-surface2 rounded p-2 text-xs overflow-x-auto text-oj-fg">
                    {problem.sample_input}
                  </pre>
                </div>
              )}
              {problem.sample_output && (
                <div>
                  <p className="text-xs text-oj-fg-muted mb-1">Output</p>
                  <pre className="bg-oj-surface2 rounded p-2 text-xs overflow-x-auto text-oj-fg">
                    {problem.sample_output}
                  </pre>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function ProblemEditor() {
  const { examId, problemId } = useParams<{ examId: string; problemId: string }>()
  const { getAccessToken } = useAuth()

  const [problem, setProblem] = useState<Problem | null>(null)
  const [problemError, setProblemError] = useState<string | null>(null)
  const [language, setLanguage] = useState('python3')
  const [code, setCode] = useState(DEFAULT_CODE['python3'])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submissionId, setSubmissionId] = useState<string | null>(null)

  const { data: submissionData, error: pollError } = useSubmissionPoller(
    submissionId,
    getAccessToken,
  )

  useEffect(() => {
    if (!problemId) return
    const currentProblemId = problemId

    let cancelled = false

    async function loadProblem() {
      setProblemError(null)
      try {
        const token = await getAccessToken()
        if (!token) throw new Error('Session expired. Please sign in again.')
        const data = await apiGetProblem(token, currentProblemId)
        if (!cancelled) setProblem(data)
      } catch (e) {
        if (!cancelled) setProblemError(getErrorMessage(e, 'Failed to load problem'))
      }
    }

    loadProblem()
    return () => {
      cancelled = true
    }
  }, [problemId, getAccessToken])

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
      setSubmitError(getErrorMessage(e, 'Submission failed'))
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

      {/* Split: description | editor */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {problem ? (
          <ProblemPanel problem={problem} />
        ) : (
          <div className="w-2/5 border-r border-oj-border overflow-y-auto p-5 shrink-0">
            <p className="text-sm text-oj-fg-muted font-mono">
              {problemError ? `Error: ${problemError}` : 'Loading problem...'}
            </p>
          </div>
        )}

        <div className="flex flex-col flex-1 min-w-0">
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
            {pollError && (
              <div className="mt-4 p-3 rounded-lg bg-red-900/20 border border-red-700/50
                              text-sm font-mono text-red-400">
                {pollError}
              </div>
            )}
            <VerdictPanel
              status={submissionData?.status ?? null}
              verdict={submissionData?.judge_result?.verdict ?? null}
              error={submissionData?.judge_result?.error_message ?? null}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
