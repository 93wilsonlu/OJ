import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  apiCreateProblem,
  apiCreateTestCase,
  apiDeleteProblem,
  apiDeleteTestCase,
  apiGetProblem,
  apiListTestCases,
  apiUpdateProblem,
  apiUpdateTestCase,
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

      {error && <p className="text-red-700 text-sm font-mono">{error}</p>}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="px-4 py-1.5 rounded-md text-sm font-medium bg-oj-accent text-white
                     hover:bg-oj-accent-dim disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving
            ? (isCreate ? 'Creating…' : 'Saving…')
            : (isCreate ? 'Create problem' : 'Save changes')}
        </button>
      </div>
    </section>
  )
}

// ── Test case form (add + edit) ───────────────────────────────────────────────

interface TestCaseFormInitial {
  name: string | null
  isHidden: boolean
  scoreWeight: number
  timeLimitOverride: number | null
  memoryLimitOverride: number | null
}

function FileField({
  label,
  file,
  required,
  onChange,
}: {
  label: string
  file: File | null
  required: boolean
  onChange: (file: File | null) => void
}) {
  const inputId = `${label.toLowerCase().replace(/\s+/g, '-')}-picker`

  return (
    <div className="block">
      <label htmlFor={inputId} className="text-xs text-oj-fg-muted font-mono mb-1 block">
        {label}
      </label>
      <input
        id={inputId}
        type="file"
        required={required}
        aria-label={label}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="sr-only"
      />
      <div className="flex min-w-0 items-center gap-2">
        <label
          htmlFor={inputId}
          className="shrink-0 cursor-pointer rounded border border-oj-border bg-oj-surface2 px-2 py-1 text-xs font-medium text-oj-fg-muted hover:text-oj-fg"
        >
          Choose file
        </label>
        <span className="min-w-0 truncate text-sm text-oj-fg-muted">
          {file?.name ?? 'No file selected'}
        </span>
      </div>
    </div>
  )
}

function TestCaseForm({
  token,
  problemId,
  testcaseId,
  initial,
  defaultName,
  onSaved,
  onCancel,
}: {
  token: string
  problemId: string
  testcaseId?: string
  initial?: TestCaseFormInitial
  defaultName?: string
  onSaved: (tc: TestCase) => void
  onCancel?: () => void
}) {
  const isEdit = !!testcaseId
  const [inputFile, setInputFile] = useState<File | null>(null)
  const [expectedFile, setExpectedFile] = useState<File | null>(null)
  const [name, setName] = useState(initial?.name ?? defaultName ?? '')
  const [isHidden, setIsHidden] = useState(initial?.isHidden ?? true)
  const [scoreWeight, setScoreWeight] = useState(String(initial?.scoreWeight ?? 1.0))
  const [timeLimitOverride, setTimeLimitOverride] = useState(
    initial?.timeLimitOverride != null ? String(initial.timeLimitOverride) : ''
  )
  const [memoryLimitOverride, setMemoryLimitOverride] = useState(
    initial?.memoryLimitOverride != null ? String(initial.memoryLimitOverride) : ''
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isEdit && (!inputFile || !expectedFile)) {
      setError('Both files are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const overrides = {
        name: name.trim() || null,
        timeLimitOverride: timeLimitOverride ? Number(timeLimitOverride) : null,
        memoryLimitOverride: memoryLimitOverride ? Number(memoryLimitOverride) : null,
      }
      let tc: TestCase
      if (isEdit) {
        tc = await apiUpdateTestCase(token, problemId, testcaseId!, {
          isHidden,
          scoreWeight: Number(scoreWeight),
          ...overrides,
          inputFile,
          expectedFile,
        })
      } else {
        tc = await apiCreateTestCase(token, problemId, {
          inputFile: inputFile!,
          expectedFile: expectedFile!,
          isHidden,
          scoreWeight: Number(scoreWeight),
          ...overrides,
        })
        setInputFile(null)
        setExpectedFile(null)
        setName('')
        setScoreWeight('1')
        setTimeLimitOverride('')
        setMemoryLimitOverride('')
        setIsHidden(true)
      }
      onSaved(tc)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = `bg-oj-surface2 border border-oj-border rounded px-3 py-1.5
                    text-sm text-oj-fg focus:outline-none focus:ring-1 focus:ring-oj-accent`

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block">
        <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${inputCls} w-full`}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <FileField
          label="Input file"
          file={inputFile}
          required={!isEdit}
          onChange={setInputFile}
        />
        <FileField
          label="Expected output file"
          file={expectedFile}
          required={!isEdit}
          onChange={setExpectedFile}
        />
      </div>

      <div className="grid grid-cols-4 gap-3 items-end">
        <label className="block">
          <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Score weight</span>
          <input type="number" min={0} step={0.1} value={scoreWeight}
            onChange={(e) => setScoreWeight(e.target.value)} className={`${inputCls} w-full`} />
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

      {error && <p className="text-red-700 text-xs font-mono">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-sm text-oj-fg-muted hover:text-oj-fg
                       hover:bg-oj-surface2 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className="px-3 py-1.5 rounded-md text-sm font-medium bg-oj-accent text-white
                     hover:bg-oj-accent-dim disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? (isEdit ? 'Saving…' : 'Uploading…') : (isEdit ? 'Save changes' : 'Upload')}
        </button>
      </div>
    </form>
  )
}

// ── Test case modal (add + edit) ──────────────────────────────────────────────

function TestCaseModal({
  title,
  token,
  problemId,
  testcaseId,
  initial,
  defaultName,
  onSaved,
  onClose,
}: {
  title: string
  token: string
  problemId: string
  testcaseId?: string
  initial?: TestCaseFormInitial
  defaultName?: string
  onSaved: (tc: TestCase) => void
  onClose: () => void
}) {
  const backdropRef = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose() }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xl bg-oj-surface border border-oj-border rounded-xl shadow-xl
                      max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-oj-border">
          <h2 className="text-base font-semibold text-oj-fg">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-oj-fg-muted hover:text-oj-fg">✕</button>
        </div>
        <div className="px-5 py-4">
          <TestCaseForm
            token={token}
            problemId={problemId}
            testcaseId={testcaseId}
            initial={initial}
            defaultName={defaultName}
            onSaved={(tc) => { onSaved(tc); onClose() }}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  )
}

// ── Test cases list ───────────────────────────────────────────────────────────

function TestCaseList({
  testcases,
  token,
  problemId,
  problemTimeLimitMs,
  problemMemoryMb,
  onUpdated,
  onDeleted,
}: {
  testcases: TestCase[]
  token: string
  problemId: string
  problemTimeLimitMs: number
  problemMemoryMb: number
  onUpdated: (tc: TestCase) => void
  onDeleted: (id: string) => void
}) {
  const [editingEntry, setEditingEntry] = useState<{ tc: TestCase; index: number } | null>(null)

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
    <>
      <div className="mt-3 rounded-lg border border-oj-border overflow-hidden">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-oj-border bg-oj-surface2">
              <th className="text-left px-3 py-2 text-oj-fg-muted font-medium">#</th>
              <th className="text-left px-3 py-2 text-oj-fg-muted font-medium">Name</th>
              <th className="text-left px-3 py-2 text-oj-fg-muted font-medium">Hidden</th>
              <th className="text-left px-3 py-2 text-oj-fg-muted font-medium">Weight</th>
              <th className="text-left px-3 py-2 text-oj-fg-muted font-medium">Time (ms)</th>
              <th className="text-left px-3 py-2 text-oj-fg-muted font-medium">Memory (MB)</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {testcases.map((tc, i) => (
              <tr key={tc.testcase_id} className="border-b border-oj-border last:border-0 hover:bg-red-50/40">
                <td className="px-3 py-2 text-oj-fg-muted">{i + 1}</td>
                <td className="px-3 py-2 text-oj-fg max-w-[12rem] truncate">
                  {tc.name ?? <span className="text-oj-fg-muted">Testcase #{i + 1}</span>}
                </td>
                <td className="px-3 py-2">
                  <span className={tc.is_hidden ? 'text-amber-600' : 'text-oj-fg-muted'}>
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
                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={() => setEditingEntry({ tc, index: i + 1 })}
                      className="text-oj-accent/70 hover:text-oj-accent transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(tc)}
                      className="text-red-600/70 hover:text-red-700 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingEntry && (
        <TestCaseModal
          title={editingEntry.tc.name ?? `Testcase #${editingEntry.index}`}
          token={token}
          problemId={problemId}
          testcaseId={editingEntry.tc.testcase_id}
          initial={{
            name: editingEntry.tc.name,
            isHidden: editingEntry.tc.is_hidden,
            scoreWeight: editingEntry.tc.score_weight,
            timeLimitOverride: editingEntry.tc.time_limit_override,
            memoryLimitOverride: editingEntry.tc.memory_limit_override,
          }}
          defaultName={editingEntry.tc.name ?? `Testcase #${editingEntry.index}`}
          onSaved={onUpdated}
          onClose={() => setEditingEntry(null)}
        />
      )}
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProblemDetailPage() {
  const { problemId } = useParams<{ problemId: string }>()
  const { user, getAccessToken } = useAuth()
  const navigate = useNavigate()
  const isNew = problemId === 'new'

  const [problem, setProblem] = useState<Problem | null>(null)
  const [showAddTC, setShowAddTC] = useState(false)
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
  if (error) return <div className="p-8 text-red-700 text-sm font-mono">Error: {error}</div>
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
            className="text-sm text-red-600/70 hover:text-red-700 transition-colors"
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
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-oj-fg-muted uppercase tracking-wide">
            Test Cases ({testcases.length})
          </h2>
          {canWrite && (
            <button
              onClick={() => setShowAddTC(true)}
              className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium
                         bg-oj-accent text-white hover:bg-oj-accent-dim transition-colors"
            >
              <span aria-hidden>+</span> Add Test Case
            </button>
          )}
        </div>
        <TestCaseList
          testcases={testcases}
          token={token}
          problemId={problem.problem_id}
          problemTimeLimitMs={problem.time_limit}
          problemMemoryMb={problem.memory_limit}
          onUpdated={(updated) =>
            setTestcases((prev) => prev.map((tc) => tc.testcase_id === updated.testcase_id ? updated : tc))
          }
          onDeleted={(id) => setTestcases((prev) => prev.filter((tc) => tc.testcase_id !== id))}
        />
      </section>

      {showAddTC && (
        <TestCaseModal
          title="Add Test Case"
          token={token}
          problemId={problem.problem_id}
          defaultName={`Testcase #${testcases.length + 1}`}
          onSaved={(tc) => setTestcases((prev) => [...prev, tc])}
          onClose={() => setShowAddTC(false)}
        />
      )}
    </div>
  )
}
