import Editor from '@monaco-editor/react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getErrorMessage } from '../api/errors'
import { apiListExamProblems } from '../api/exams'
import { apiCreateSubmission } from '../api/submissions'
import VerdictBadge from '../components/VerdictBadge'
import { useAuth } from '../hooks/useAuth'
import { useSubmissionPoller } from '../hooks/useSubmissionPoller'
import type { ExamProblem } from '../types/exam'
import type { SubmissionStatus } from '../types/submission'

const LANGUAGE_OPTIONS: Record<string, { label: string; monaco: string; starter: string }> = {
  python3: {
    label: 'Python 3',
    monaco: 'python',
    starter: '# Write your solution here\n',
  },
  cpp17: {
    label: 'C++17',
    monaco: 'cpp',
    starter: '# Write your solution here\n',
  },
}

function languageLabel(lang: string) {
  return LANGUAGE_OPTIONS[lang]?.label ?? lang
}

function starterCode(lang: string) {
  return LANGUAGE_OPTIONS[lang]?.starter ?? ''
}

function monacoLanguage(lang: string) {
  return LANGUAGE_OPTIONS[lang]?.monaco ?? lang
}

function draftKey(examId: string | undefined, problemId: string | undefined, lang: string) {
  if (!examId || !problemId) return null
  return `candidate-draft:${examId}:${problemId}:${lang}`
}

function loadDraft(examId: string | undefined, problemId: string | undefined, lang: string) {
  const key = draftKey(examId, problemId, lang)
  if (!key) return starterCode(lang)
  return localStorage.getItem(key) ?? starterCode(lang)
}

function loadReusableSubmission(submissionId: string | null) {
  if (!submissionId) return null
  const raw = sessionStorage.getItem(`submission-reuse:${submissionId}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as {
      exam_id: string
      problem_id: string
      language: string
      code: string
    }
  } catch {
    return null
  }
}

function ProblemStatement({ problem }: { problem: ExamProblem }) {
  return (
    <article className="h-full overflow-y-auto px-5 py-4">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-oj-fg">{problem.title}</h1>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-oj-fg-muted font-mono">
          <span>Time: {problem.time_limit} ms</span>
          <span>Memory: {problem.memory_limit} MB</span>
        </div>
      </div>

      <section className="space-y-5 text-sm leading-7 text-oj-fg">
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-oj-fg-muted">
            Statement
          </h2>
          <p className="whitespace-pre-wrap">{problem.description}</p>
        </div>

        {problem.input_format && (
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-oj-fg-muted">
              Input
            </h2>
            <p className="whitespace-pre-wrap">{problem.input_format}</p>
          </div>
        )}

        {problem.output_format && (
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-oj-fg-muted">
              Output
            </h2>
            <p className="whitespace-pre-wrap">{problem.output_format}</p>
          </div>
        )}

        {(problem.sample_input || problem.sample_output) && (
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-oj-fg-muted">
              Sample
            </h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {problem.sample_input && (
                <div>
                  <p className="mb-1 text-xs text-oj-fg-muted">Input</p>
                  <pre className="overflow-x-auto rounded bg-oj-bg p-3 text-xs text-oj-fg">
                    {problem.sample_input}
                  </pre>
                </div>
              )}
              {problem.sample_output && (
                <div>
                  <p className="mb-1 text-xs text-oj-fg-muted">Output</p>
                  <pre className="overflow-x-auto rounded bg-oj-bg p-3 text-xs text-oj-fg">
                    {problem.sample_output}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </article>
  )
}

function SubmissionPanel({
  status,
  verdict,
  score,
  passed,
  total,
  runtime,
  memory,
  error,
}: {
  status: SubmissionStatus | null
  verdict: string | null
  score: number | null | undefined
  passed: number | null | undefined
  total: number | null | undefined
  runtime: number | null | undefined
  memory: number | null | undefined
  error: string | null | undefined
}) {
  if (!status) {
    return (
      <div className="text-xs text-oj-fg-muted font-mono">
        Submit your solution to see judge feedback here.
      </div>
    )
  }

  const active = status === 'pending' || status === 'judging'
  const display = verdict ?? status

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <VerdictBadge verdict={display} showFull />
        {active && <span className="text-xs text-oj-fg-muted font-mono animate-pulse">Waiting for judge...</span>}
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <ResultMetric label="Score" value={score === null || score === undefined ? '-' : String(score)} />
        <ResultMetric
          label="Passed"
          value={passed === null || passed === undefined || total === null || total === undefined ? '-' : `${passed} / ${total}`}
        />
        <ResultMetric label="Time" value={runtime === null || runtime === undefined ? '-' : `${runtime} ms`} />
        <ResultMetric label="Memory" value={memory === null || memory === undefined ? '-' : `${memory} KB`} />
      </div>

      {error && (
        <pre className="max-h-32 overflow-auto rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700 whitespace-pre-wrap">
          {error}
        </pre>
      )}
    </div>
  )
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-oj-border bg-oj-bg px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-oj-fg-muted">{label}</div>
      <div className="mt-0.5 text-xs text-oj-fg font-mono">{value}</div>
    </div>
  )
}

export default function ProblemEditor() {
  const { examId, problemId } = useParams<{ examId: string; problemId: string }>()
  const [searchParams] = useSearchParams()
  const { getAccessToken } = useAuth()

  const [problem, setProblem] = useState<ExamProblem | null>(null)
  const [problemError, setProblemError] = useState<string | null>(null)
  const [language, setLanguage] = useState('python3')
  const [code, setCode] = useState(() => loadDraft(examId, problemId, 'python3'))
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [appliedReuseId, setAppliedReuseId] = useState<string | null>(null)

  const { data: submissionData, error: pollError } = useSubmissionPoller(
    submissionId,
    getAccessToken,
  )

  const availableLanguages = useMemo(() => {
    if (!problem?.allowed_langs.length) return ['python3', 'cpp17']
    return problem.allowed_langs
  }, [problem])

  useEffect(() => {
    if (!examId || !problemId) return
    const currentExamId = examId
    const currentProblemId = problemId
    let cancelled = false

    async function loadProblem() {
      setProblemError(null)
      try {
        const token = await getAccessToken()
        if (!token) throw new Error('Session expired. Please sign in again.')
        // Candidates read problems via the exam-scoped endpoint, not the
        // staff-only problem bank (/problems/{id}).
        const problems = await apiListExamProblems(token, currentExamId)
        const found = problems.find((p) => p.problem_id === currentProblemId)
        if (!found) throw new Error('Problem not found in this exam.')
        if (!cancelled) setProblem(found)
      } catch (e) {
        if (!cancelled) setProblemError(getErrorMessage(e, 'Failed to load problem'))
      }
    }

    loadProblem()
    return () => {
      cancelled = true
    }
  }, [examId, problemId, getAccessToken])

  useEffect(() => {
    const reuseId = searchParams.get('fromSubmission')
    if (!reuseId || appliedReuseId === reuseId) return
    const reuse = loadReusableSubmission(reuseId)
    if (!reuse || reuse.exam_id !== examId || reuse.problem_id !== problemId) return

    setLanguage(reuse.language)
    setCode(reuse.code)
    setAppliedReuseId(reuseId)
  }, [appliedReuseId, examId, problemId, searchParams])

  useEffect(() => {
    if (!problem) return
    const nextLanguage = availableLanguages.includes(language) ? language : availableLanguages[0]
    if (nextLanguage !== language) {
      setLanguage(nextLanguage)
      setCode(loadDraft(examId, problemId, nextLanguage))
    }
  }, [availableLanguages, examId, language, problem, problemId])

  useEffect(() => {
    const key = draftKey(examId, problemId, language)
    if (!key) return
    localStorage.setItem(key, code)
  }, [code, examId, language, problemId])

  function handleLanguageChange(nextLanguage: string) {
    const currentKey = draftKey(examId, problemId, language)
    if (currentKey) localStorage.setItem(currentKey, code)
    setLanguage(nextLanguage)
    setCode(loadDraft(examId, problemId, nextLanguage))
  }

  async function handleSubmit() {
    if (!examId || !problemId) return
    setSubmitting(true)
    setSubmitError(null)
    setSubmissionId(null)

    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Session expired. Please sign in again.')
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

  const judgeResult = submissionData?.judge_result

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col bg-oj-bg">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b border-oj-border bg-oj-surface px-4 py-2">
        <Link to={examId ? `/exams/${examId}` : '/exams'} className="text-xs text-oj-accent hover:underline">
          Back to exam
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-oj-fg">
            {problem?.title ?? 'Loading problem...'}
          </div>
          {problem && (
            <div className="text-xs text-oj-fg-muted font-mono">
              {problem.time_limit} ms / {problem.memory_limit} MB
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-xs text-oj-fg-muted font-mono">
          Language
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="rounded border border-oj-border bg-oj-surface2 px-2 py-1 text-sm text-oj-fg
                       focus:outline-none focus:ring-1 focus:ring-oj-accent"
          >
            {availableLanguages.map((lang) => (
              <option key={lang} value={lang}>{languageLabel(lang)}</option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !problem}
          className="rounded-md bg-oj-accent px-4 py-1.5 text-sm font-semibold text-white
                     transition-colors hover:bg-oj-accent-dim disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Submit'}
        </button>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(320px,42%)_minmax(0,1fr)]">
        <section className="min-h-0 border-b border-oj-border bg-oj-surface lg:border-b-0 lg:border-r">
          {problem ? (
            <ProblemStatement problem={problem} />
          ) : (
            <div className="p-5 text-sm text-oj-fg-muted font-mono">
              {problemError ? `Error: ${problemError}` : 'Loading problem...'}
            </div>
          )}
        </section>

        <section className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1">
            <Editor
              height="100%"
              language={monacoLanguage(language)}
              value={code}
              onChange={(value) => setCode(value ?? '')}
              theme="vs-dark"
              options={{
                fontSize: 14,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                tabSize: 2,
                automaticLayout: true,
              }}
            />
          </div>

          <footer className="shrink-0 border-t border-oj-border bg-oj-surface px-4 py-3">
            {submitError && (
              <div className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {submitError}
              </div>
            )}
            {pollError && (
              <div className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {pollError}
              </div>
            )}
            <SubmissionPanel
              status={submissionData?.status ?? null}
              verdict={judgeResult?.verdict ?? null}
              score={judgeResult?.score}
              passed={judgeResult?.passed_count}
              total={judgeResult?.total_count}
              runtime={judgeResult?.execution_time}
              memory={judgeResult?.memory_usage}
              error={judgeResult?.error_message}
            />
          </footer>
        </section>
      </main>
    </div>
  )
}
