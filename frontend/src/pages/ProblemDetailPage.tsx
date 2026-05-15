import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  apiCreateProblem,
  apiCreateTestCase,
  apiDeleteProblem,
  apiDeleteTestCase,
  apiGetProblem,
  apiListTestCases,
  apiUpdateProblem,
} from '../api/problems'
import { useAuth } from '../hooks/useAuth'
import type { Difficulty, Problem, TestCase } from '../types/problem'

const LANGS = ['python3', 'cpp17']
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

const EMPTY_FORM = {
  title: '',
  description: '',
  input_format: null as string | null,
  output_format: null as string | null,
  sample_input: null as string | null,
  sample_output: null as string | null,
  difficulty: 'easy' as Difficulty,
  time_limit: 1000,
  memory_limit: 256,
  allowed_langs: ['python3', 'cpp17'],
}

type FormState = typeof EMPTY_FORM

// ── Problem form (create + edit) ──────────────────────────────────────────────

function ProblemForm({
  initial,
  token,
  problemId,
  onCreate,
  onSaved,
}: {
  initial: FormState
  token: string
  problemId?: string               // required in edit mode
  onCreate?: (p: Problem) => void  // create mode
  onSaved?: (p: Problem) => void   // edit mode
}) {
  const isCreate = !!onCreate
  const [form, setForm] = useState<FormState>({ ...initial })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(isCreate)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setDirty(true)
  }

  function toggleLang(lang: string) {
    setForm((f) => ({
      ...f,
      allowed_langs: f.allowed_langs.includes(lang)
        ? f.allowed_langs.filter((l) => l !== lang)
        : [...f.allowed_langs, lang],
    }))
    setDirty(true)
  }

  async function handleSave() {
    if (!form.title.trim()) { setError('Title is required.'); return }
    if (!form.description.trim()) { setError('Description is required.'); return }
    if (form.allowed_langs.length === 0) { setError('Select at least one language.'); return }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        title: form.title,
        description: form.description,
        input_format: form.input_format ?? undefined,
        output_format: form.output_format ?? undefined,
        sample_input: form.sample_input ?? undefined,
        sample_output: form.sample_output ?? undefined,
        difficulty: form.difficulty,
        time_limit: form.time_limit,
        memory_limit: form.memory_limit,
        allowed_langs: form.allowed_langs,
      }
      if (isCreate) {
        const created = await apiCreateProblem(token, payload)
        onCreate!(created)
      } else {
        const updated = await apiUpdateProblem(token, problemId!, payload)
        onSaved!(updated)
        setDirty(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = `w-full bg-oj-surface2 border border-oj-border rounded px-3 py-1.5
                    text-sm text-oj-fg focus:outline-none focus:ring-1 focus:ring-oj-accent`

  return (
    <section className="rounded-xl border border-oj-border bg-oj-surface p-5 space-y-4">
      {!isCreate && (
        <h2 className="text-sm font-semibold text-oj-fg-muted uppercase tracking-wide">Problem Settings</h2>
      )}

      <label className="block">
        <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Title *</span>
        <input value={form.title} onChange={(e) => set('title', e.target.value)} className={inputCls} />
      </label>

      <label className="block">
        <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Description *</span>
        <textarea
          rows={5}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          className={`${inputCls} resize-none`}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Input format</span>
          <textarea rows={2} value={form.input_format ?? ''} onChange={(e) => set('input_format', e.target.value || null)} className={`${inputCls} resize-none`} />
        </label>
        <label className="block">
          <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Output format</span>
          <textarea rows={2} value={form.output_format ?? ''} onChange={(e) => set('output_format', e.target.value || null)} className={`${inputCls} resize-none`} />
        </label>
        <label className="block">
          <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Sample input</span>
          <textarea rows={2} value={form.sample_input ?? ''} onChange={(e) => set('sample_input', e.target.value || null)} className={`${inputCls} resize-none font-mono text-xs`} />
        </label>
        <label className="block">
          <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Sample output</span>
          <textarea rows={2} value={form.sample_output ?? ''} onChange={(e) => set('sample_output', e.target.value || null)} className={`${inputCls} resize-none font-mono text-xs`} />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Difficulty</span>
          <select value={form.difficulty} onChange={(e) => set('difficulty', e.target.value as Difficulty)} className={inputCls}>
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Time limit (ms)</span>
          <input type="number" min={1} value={form.time_limit} onChange={(e) => set('time_limit', Number(e.target.value))} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Memory limit (MB)</span>
          <input type="number" min={1} value={form.memory_limit} onChange={(e) => set('memory_limit', Number(e.target.value))} className={inputCls} />
        </label>
      </div>

      <fieldset>
        <legend className="text-xs text-oj-fg-muted font-mono mb-2">Languages *</legend>
        <div className="flex gap-4">
          {LANGS.map((lang) => (
            <label key={lang} className="flex items-center gap-2 text-sm text-oj-fg cursor-pointer">
              <input type="checkbox" checked={form.allowed_langs.includes(lang)} onChange={() => toggleLang(lang)} className="accent-oj-accent" />
              {lang}
            </label>
          ))}
        </div>
      </fieldset>

      {error && <p className="text-red-400 text-sm font-mono">{error}</p>}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="px-4 py-1.5 rounded-md text-sm font-medium bg-oj-accent text-oj-bg
                     hover:bg-oj-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving
            ? (isCreate ? 'Creating…' : 'Saving…')
            : (isCreate ? 'Create problem' : 'Save changes')}
        </button>
      </div>
    </section>
  )
}

// ── Add test case form ────────────────────────────────────────────────────────

function AddTestCaseForm({
  token,
  problemId,
  onAdded,
}: {
  token: string
  problemId: string
  onAdded: (tc: TestCase) => void
}) {
  const [inputFile, setInputFile] = useState<File | null>(null)
  const [expectedFile, setExpectedFile] = useState<File | null>(null)
  const [isHidden, setIsHidden] = useState(true)
  const [scoreWeight, setScoreWeight] = useState(1.0)
  const [timeLimitOverride, setTimeLimitOverride] = useState('')
  const [memoryLimitOverride, setMemoryLimitOverride] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!inputFile || !expectedFile) { setError('Both files are required.'); return }
    setUploading(true)
    setError(null)
    try {
      const tc = await apiCreateTestCase(token, problemId, {
        inputFile,
        expectedFile,
        isHidden,
        scoreWeight,
        timeLimitOverride: timeLimitOverride ? Number(timeLimitOverride) : null,
        memoryLimitOverride: memoryLimitOverride ? Number(memoryLimitOverride) : null,
      })
      onAdded(tc)
      setInputFile(null)
      setExpectedFile(null)
      setScoreWeight(1.0)
      setTimeLimitOverride('')
      setMemoryLimitOverride('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const inputCls = `bg-oj-surface2 border border-oj-border rounded px-3 py-1.5
                    text-sm text-oj-fg focus:outline-none focus:ring-1 focus:ring-oj-accent`

  return (
    <form onSubmit={handleUpload} className="mt-4 p-4 rounded-lg border border-dashed border-oj-border space-y-3">
      <h3 className="text-xs font-semibold text-oj-fg-muted uppercase tracking-wide">Add Test Case</h3>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Input file *</span>
          <input
            type="file"
            required
            onChange={(e) => setInputFile(e.target.files?.[0] ?? null)}
            className="text-sm text-oj-fg-muted file:mr-2 file:px-2 file:py-1 file:rounded
                       file:border-0 file:bg-oj-surface2 file:text-oj-fg-muted file:text-xs
                       file:cursor-pointer cursor-pointer"
          />
        </label>
        <label className="block">
          <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Expected output file *</span>
          <input
            type="file"
            required
            onChange={(e) => setExpectedFile(e.target.files?.[0] ?? null)}
            className="text-sm text-oj-fg-muted file:mr-2 file:px-2 file:py-1 file:rounded
                       file:border-0 file:bg-oj-surface2 file:text-oj-fg-muted file:text-xs
                       file:cursor-pointer cursor-pointer"
          />
        </label>
      </div>

      <div className="grid grid-cols-4 gap-3 items-end">
        <label className="block">
          <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Score weight</span>
          <input type="number" min={0} step={0.1} value={scoreWeight}
            onChange={(e) => setScoreWeight(Number(e.target.value))} className={`${inputCls} w-full`} />
        </label>
        <label className="block">
          <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Time limit (ms)</span>
          <input type="number" min={1} placeholder="inherit" value={timeLimitOverride}
            onChange={(e) => setTimeLimitOverride(e.target.value)} className={`${inputCls} w-full`} />
        </label>
        <label className="block">
          <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Memory limit (MB)</span>
          <input type="number" min={1} placeholder="inherit" value={memoryLimitOverride}
            onChange={(e) => setMemoryLimitOverride(e.target.value)} className={`${inputCls} w-full`} />
        </label>
        <label className="flex items-center gap-2 text-sm text-oj-fg cursor-pointer pb-1.5">
          <input type="checkbox" checked={isHidden} onChange={(e) => setIsHidden(e.target.checked)} className="accent-oj-accent" />
          Hidden
        </label>
      </div>

      {error && <p className="text-red-400 text-xs font-mono">{error}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={uploading}
          className="px-3 py-1.5 rounded-md text-sm font-medium bg-oj-accent text-oj-bg
                     hover:bg-oj-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </div>
    </form>
  )
}

// ── Test cases list ───────────────────────────────────────────────────────────

function TestCaseList({
  testcases,
  token,
  problemId,
  problemTimeLimitMs,
  problemMemoryMb,
  onDeleted,
}: {
  testcases: TestCase[]
  token: string
  problemId: string
  problemTimeLimitMs: number
  problemMemoryMb: number
  onDeleted: (id: string) => void
}) {
  async function handleDelete(tc: TestCase) {
    if (!confirm('Delete this test case?')) return
    try {
      await apiDeleteTestCase(token, problemId, tc.testcase_id)
      onDeleted(tc.testcase_id)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  if (testcases.length === 0) {
    return <p className="text-oj-fg-muted text-sm mt-3">No test cases yet.</p>
  }

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-oj-border">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="border-b border-oj-border bg-oj-surface/50">
            <th className="text-left px-3 py-2 text-oj-fg-muted font-medium">#</th>
            <th className="text-left px-3 py-2 text-oj-fg-muted font-medium">Hidden</th>
            <th className="text-left px-3 py-2 text-oj-fg-muted font-medium">Weight</th>
            <th className="text-left px-3 py-2 text-oj-fg-muted font-medium">Time (ms)</th>
            <th className="text-left px-3 py-2 text-oj-fg-muted font-medium">Memory (MB)</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {testcases.map((tc, i) => (
            <tr key={tc.testcase_id} className="border-b border-oj-border last:border-0 hover:bg-oj-surface/40">
              <td className="px-3 py-2 text-oj-fg-muted">{i + 1}</td>
              <td className="px-3 py-2">
                <span className={tc.is_hidden ? 'text-amber-300' : 'text-oj-fg-muted'}>
                  {tc.is_hidden ? 'hidden' : 'visible'}
                </span>
              </td>
              <td className="px-3 py-2 text-oj-fg">{tc.score_weight}</td>
              <td className="px-3 py-2 text-oj-fg">
                {tc.time_limit_override !== null
                  ? <span className="text-oj-accent">{tc.time_limit_override}</span>
                  : <span className="text-oj-fg-muted">{problemTimeLimitMs} (default)</span>}
              </td>
              <td className="px-3 py-2 text-oj-fg">
                {tc.memory_limit_override !== null
                  ? <span className="text-oj-accent">{tc.memory_limit_override}</span>
                  : <span className="text-oj-fg-muted">{problemMemoryMb} (default)</span>}
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  onClick={() => handleDelete(tc)}
                  className="text-red-400/70 hover:text-red-400 transition-colors"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProblemDetailPage() {
  const { problemId } = useParams<{ problemId: string }>()
  const { user, getAccessToken } = useAuth()
  const navigate = useNavigate()
  const isNew = problemId === 'new'

  const [problem, setProblem] = useState<Problem | null>(null)
  const [testcases, setTestcases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)

  const canWrite = user?.role === 'problem_admin' || user?.role === 'admin'

  useEffect(() => {
    getAccessToken().then(async (t) => {
      if (!t) return
      setToken(t)
      if (isNew) return

      try {
        const [p, tcs] = await Promise.all([
          apiGetProblem(t, problemId!),
          apiListTestCases(t, problemId!),
        ])
        setProblem(p)
        setTestcases(tcs)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    })
  }, [problemId, isNew, getAccessToken])

  async function handleDelete() {
    if (!token || !problem) return
    if (!confirm(`Delete "${problem.title}"? This cannot be undone.`)) return
    try {
      await apiDeleteProblem(token, problem.problem_id)
      navigate('/problems')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  if (loading) return <div className="p-8 text-oj-fg-muted text-sm font-mono">Loading…</div>
  if (error) return <div className="p-8 text-red-400 text-sm font-mono">Error: {error}</div>
  if (!token) return null

  // ── Create mode ──
  if (isNew) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <div>
          <button
            onClick={() => navigate('/problems')}
            className="text-xs text-oj-fg-muted hover:text-oj-fg font-mono mb-2 block"
          >
            ← Problems
          </button>
          <h1 className="text-xl font-semibold text-oj-fg">New Problem</h1>
        </div>
        <ProblemForm
          initial={EMPTY_FORM}
          token={token}
          onCreate={(created) => navigate(`/problems/${created.problem_id}`)}
        />
      </div>
    )
  }

  // ── Edit mode ──
  if (!problem) return null

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <button
            onClick={() => navigate('/problems')}
            className="text-xs text-oj-fg-muted hover:text-oj-fg font-mono mb-2 block"
          >
            ← Problems
          </button>
          <h1 className="text-xl font-semibold text-oj-fg">{problem.title}</h1>
        </div>
        {canWrite && (
          <button
            onClick={handleDelete}
            className="text-sm text-red-400/70 hover:text-red-400 transition-colors"
          >
            Delete problem
          </button>
        )}
      </div>

      {canWrite && (
        <ProblemForm
          initial={{
            title: problem.title,
            description: problem.description,
            input_format: problem.input_format,
            output_format: problem.output_format,
            sample_input: problem.sample_input,
            sample_output: problem.sample_output,
            difficulty: problem.difficulty,
            time_limit: problem.time_limit,
            memory_limit: problem.memory_limit,
            allowed_langs: problem.allowed_langs,
          }}
          token={token}
          problemId={problem.problem_id}
          onSaved={(updated) => setProblem(updated)}
        />
      )}

      <section>
        <h2 className="text-sm font-semibold text-oj-fg-muted uppercase tracking-wide mb-1">
          Test Cases ({testcases.length})
        </h2>
        <TestCaseList
          testcases={testcases}
          token={token}
          problemId={problem.problem_id}
          problemTimeLimitMs={problem.time_limit}
          problemMemoryMb={problem.memory_limit}
          onDeleted={(id) => setTestcases((prev) => prev.filter((tc) => tc.testcase_id !== id))}
        />
        {canWrite && (
          <AddTestCaseForm
            token={token}
            problemId={problem.problem_id}
            onAdded={(tc) => setTestcases((prev) => [...prev, tc])}
          />
        )}
      </section>
    </div>
  )
}
