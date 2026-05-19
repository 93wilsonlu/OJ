import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGetProblem } from '../api/problems'
import { useAuth } from '../hooks/useAuth'
import type { Problem } from '../types/problem'

function difficultyStyle(d: string) {
  if (d === 'easy') return 'bg-green-900/60 text-green-300 ring-1 ring-green-700'
  if (d === 'hard') return 'bg-red-900/60 text-red-300 ring-1 ring-red-700'
  return 'bg-yellow-900/60 text-yellow-300 ring-1 ring-yellow-700'
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-mono text-oj-fg-muted mb-1 uppercase tracking-wider">{label}</p>
      {children}
    </div>
  )
}

function CodeBlock({ text }: { text: string }) {
  return (
    <pre className="bg-oj-surface2 rounded-md px-4 py-3 text-sm font-mono text-oj-fg
                    overflow-x-auto whitespace-pre-wrap break-words">
      {text}
    </pre>
  )
}

export default function ProblemViewPage() {
  const { problemId } = useParams<{ problemId: string }>()
  const { getAccessToken } = useAuth()
  const [problem, setProblem] = useState<Problem | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!problemId) return
    getAccessToken().then((token) => {
      if (!token) return
      apiGetProblem(token, problemId)
        .then(setProblem)
        .catch((e) => setError(e.message))
    })
  }, [problemId, getAccessToken])

  if (error) return <div className="p-8 text-red-400 text-sm font-mono">Error: {error}</div>
  if (!problem) return <div className="p-8 text-oj-fg-muted text-sm font-mono">Loading…</div>

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Back link */}
      <Link to="/problems" className="text-xs text-oj-accent hover:underline">
        ← Back to problems
      </Link>

      {/* Title + meta */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-semibold text-oj-fg">{problem.title}</h1>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium font-mono
                        ${difficultyStyle(problem.difficulty)}`}
          >
            {problem.difficulty}
          </span>
        </div>
        <div className="flex gap-4 text-xs font-mono text-oj-fg-muted">
          <span>Time limit: {problem.time_limit} ms</span>
          <span>Memory: {problem.memory_limit} MB</span>
          <span>Languages: {problem.allowed_langs.join(', ')}</span>
        </div>
      </div>

      {/* Description */}
      <Block label="Description">
        <div className="text-sm text-oj-fg leading-relaxed whitespace-pre-wrap">
          {problem.description}
        </div>
      </Block>

      {/* Input / Output format */}
      {problem.input_format && (
        <Block label="Input format">
          <div className="text-sm text-oj-fg leading-relaxed whitespace-pre-wrap">
            {problem.input_format}
          </div>
        </Block>
      )}
      {problem.output_format && (
        <Block label="Output format">
          <div className="text-sm text-oj-fg leading-relaxed whitespace-pre-wrap">
            {problem.output_format}
          </div>
        </Block>
      )}

      {/* Sample I/O */}
      {problem.sample_input && (
        <Block label="Sample input">
          <CodeBlock text={problem.sample_input} />
        </Block>
      )}
      {problem.sample_output && (
        <Block label="Sample output">
          <CodeBlock text={problem.sample_output} />
        </Block>
      )}
    </div>
  )
}
