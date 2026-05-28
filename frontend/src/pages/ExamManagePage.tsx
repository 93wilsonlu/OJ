import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  apiCreateAssignment,
  apiCreateExam,
  apiDeleteAssignment,
  apiDeleteExam,
  apiGetExam,
  apiListAssignments,
  apiUpdateExam,
} from '../api/exams'
import { apiListProblems } from '../api/problems'
import { apiListAdminUsers } from '../api/admin'
import { useAuth } from '../hooks/useAuth'
import type { Exam, ExamAssignment } from '../types/exam'
import type { Problem } from '../types/problem'

const inputCls = `w-full bg-oj-surface2 border border-oj-border rounded px-3 py-1.5
                  text-sm text-oj-fg focus:outline-none focus:ring-1 focus:ring-oj-accent`

function toLocalDatetime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface FormData {
  title: string
  description: string
  start_time: string
  end_time: string
  show_score: boolean
}

const EMPTY_FORM: FormData = { title: '', description: '', start_time: '', end_time: '', show_score: false }

export default function ExamManagePage() {
  const { examId } = useParams<{ examId: string }>()
  const isNew = !examId
  const navigate = useNavigate()
  const { getAccessToken } = useAuth()

  const [token, setToken] = useState<string | null>(null)
  const [exam, setExam] = useState<Exam | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [allProblems, setAllProblems] = useState<Problem[]>([])
  const [selectedProblems, setSelectedProblems] = useState<string[]>([])
  const [problemSearch, setProblemSearch] = useState('')
  const [problemDifficulty, setProblemDifficulty] = useState('all')

  const [allCandidates, setAllCandidates] = useState<any[]>([])
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([])
  const [candidateSearch, setCandidateSearch] = useState('')

  const [originalAssignments, setOriginalAssignments] = useState<ExamAssignment[]>([])

  useEffect(() => {
    getAccessToken().then(setToken)
  }, [getAccessToken])

  useEffect(() => {
    if (!token) return
    Promise.all([
      apiListProblems(token),
      apiListAdminUsers(token, { role: 'candidate', pageSize: 100 }),
    ]).then(([probs, users]) => {
      setAllProblems(probs)
      setAllCandidates(users.items)
    }).catch(() => {})

    if (!isNew && examId) {
      setLoading(true)
      Promise.all([apiGetExam(token, examId), apiListAssignments(token, examId)])
        .then(([e, assignments]) => {
          setExam(e)
          setOriginalAssignments(assignments)
          setForm({
            title: e.title,
            description: e.description ?? '',
            start_time: toLocalDatetime(e.start_time),
            end_time: toLocalDatetime(e.end_time),
            show_score: e.show_score,
          })
          setSelectedProblems([...new Set(assignments.map((a) => a.problem_id))])
          setSelectedCandidates([...new Set(assignments.map((a) => a.candidate_id))])
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false))
    }
  }, [token, examId, isNew])

  async function handleSave() {
    if (!token) return
    if (!form.title || !form.start_time || !form.end_time) {
      setError('Title, start time, and end time are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        start_time: new Date(form.start_time).toISOString(),
        end_time: new Date(form.end_time).toISOString(),
        show_score: form.show_score,
      }

      let targetId = examId!
      if (isNew) {
        const created = await apiCreateExam(token, payload)
        targetId = created.exam_id
      } else {
        await apiUpdateExam(token, examId!, payload)
      }

      // Diff assignments: add new (candidateId × problemId) pairs, remove dropped ones
      const expectedKeys = new Set<string>()
      for (const cId of selectedCandidates) {
        for (const pId of selectedProblems) {
          expectedKeys.add(`${cId}_${pId}`)
        }
      }
      const currentMap = new Map(originalAssignments.map((a) => [`${a.candidate_id}_${a.problem_id}`, a.assignment_id]))

      await Promise.all([
        ...[...expectedKeys]
          .filter((key) => !currentMap.has(key))
          .map((key) => {
            const [cId, pId] = key.split('_')
            return apiCreateAssignment(token, targetId, { candidate_id: cId, problem_id: pId })
          }),
        ...[...currentMap.entries()]
          .filter(([key]) => !expectedKeys.has(key))
          .map(([, assignmentId]) => apiDeleteAssignment(token, targetId, assignmentId)),
      ])

      navigate(isNew ? `/exams/${targetId}/manage` : '/interviewer')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!token || !examId) return
    if (!confirm('Delete this exam? This cannot be undone.')) return
    try {
      await apiDeleteExam(token, examId)
      navigate('/interviewer')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const filteredProblems = allProblems.filter((p) => {
    const matchSearch = p.title.toLowerCase().includes(problemSearch.toLowerCase())
    const matchDiff = problemDifficulty === 'all' || p.difficulty === problemDifficulty
    return matchSearch && matchDiff
  })
  const displayProblems = filteredProblems.slice(0, 50)

  const filteredCandidates = allCandidates.filter((c) => {
    const s = candidateSearch.toLowerCase()
    return c.name.toLowerCase().includes(s) || c.email.toLowerCase().includes(s)
  })
  const displayCandidates = filteredCandidates.slice(0, 50)

  function toggleProblem(id: string) {
    setSelectedProblems((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id])
  }
  function toggleCandidate(id: string) {
    setSelectedCandidates((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id])
  }
  function selectAllProblems() {
    const newIds = filteredProblems.map((p) => p.problem_id).filter((id) => !selectedProblems.includes(id))
    setSelectedProblems((prev) => [...prev, ...newIds])
  }
  function clearAllProblems() {
    const toRemove = new Set(filteredProblems.map((p) => p.problem_id))
    setSelectedProblems((prev) => prev.filter((id) => !toRemove.has(id)))
  }
  function selectAllCandidates() {
    const newIds = filteredCandidates.map((c) => c.user_id).filter((id) => !selectedCandidates.includes(id))
    setSelectedCandidates((prev) => [...prev, ...newIds])
  }
  function clearAllCandidates() {
    const toRemove = new Set(filteredCandidates.map((c) => c.user_id))
    setSelectedCandidates((prev) => prev.filter((id) => !toRemove.has(id)))
  }

  if (loading) return <div className="p-8 text-oj-fg-muted text-sm font-mono">Loading…</div>

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-8">
        <div>
          <button
            onClick={() => navigate('/interviewer')}
            className="text-xs text-oj-accent hover:underline block mb-1"
          >
            ← Back to exams
          </button>
          <h1 className="text-xl font-semibold text-oj-fg">
            {isNew ? 'New Exam' : `Edit: ${exam?.title ?? ''}`}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 rounded-md text-xs text-red-400 hover:bg-red-400/10"
            >
              Delete exam
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-md text-sm font-medium bg-oj-accent text-oj-bg
                       hover:bg-oj-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : isNew ? 'Create exam' : 'Save changes'}
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm font-mono mb-4">{error}</p>}

      {/* Exam details — centered top */}
      <section className="space-y-4 rounded-xl border border-oj-border bg-oj-surface p-5 mb-8">
        <h2 className="text-sm font-semibold text-oj-fg-muted uppercase tracking-wider font-mono">
          Exam details
        </h2>

        <label className="block">
          <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Title *</span>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className={inputCls}
            placeholder="e.g. Backend Engineer Interview"
          />
        </label>

        <label className="block">
          <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Description</span>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            className={`${inputCls} resize-y`}
            placeholder="Optional instructions for candidates"
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Start time *</span>
            <input
              type="datetime-local"
              value={form.start_time}
              onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-xs text-oj-fg-muted font-mono mb-1 block">End time *</span>
            <input
              type="datetime-local"
              value={form.end_time}
              onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
              className={inputCls}
            />
          </label>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.show_score}
            onChange={(e) => setForm((f) => ({ ...f, show_score: e.target.checked }))}
            className="accent-oj-accent"
          />
          <span className="text-sm text-oj-fg">Show score to candidates</span>
        </label>
      </section>

      {/* Problems + Candidates — two-column bottom */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="rounded-xl border border-oj-border bg-oj-surface p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-oj-fg-muted uppercase tracking-wider font-mono">
                Problems <span className="text-oj-accent">({selectedProblems.length})</span>
              </h2>
              <div className="flex gap-2 text-xs">
                <button onClick={selectAllProblems} className="text-oj-accent hover:underline">Select all</button>
                <span className="text-oj-border">|</span>
                <button onClick={clearAllProblems} className="text-oj-fg-muted hover:underline">Clear</button>
              </div>
            </div>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                placeholder="Search problems…"
                value={problemSearch}
                onChange={(e) => setProblemSearch(e.target.value)}
                className={`${inputCls} py-1 text-xs flex-1`}
              />
              <select
                value={problemDifficulty}
                onChange={(e) => setProblemDifficulty(e.target.value)}
                className={`${inputCls} py-1 text-xs w-[72px]`}
              >
                <option value="all">All</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div className="h-[220px] overflow-y-auto bg-oj-bg rounded border border-oj-border p-2 space-y-1">
              {displayProblems.map((p) => (
                <label key={p.problem_id} className="flex items-center gap-2 cursor-pointer hover:bg-oj-surface2 p-1.5 rounded">
                  <input
                    type="checkbox"
                    checked={selectedProblems.includes(p.problem_id)}
                    onChange={() => toggleProblem(p.problem_id)}
                    className="accent-oj-accent shrink-0"
                  />
                  <span className="text-sm text-oj-fg truncate flex-1">{p.title}</span>
                  <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono ${p.difficulty === 'easy' ? 'bg-green-900/40 text-green-400' : p.difficulty === 'hard' ? 'bg-red-900/40 text-red-400' : 'bg-yellow-900/40 text-yellow-400'}`}>
                    {p.difficulty}
                  </span>
                </label>
              ))}
              {filteredProblems.length === 0 && <p className="text-xs text-oj-fg-muted p-2 text-center">No matching problems.</p>}
              {filteredProblems.length > 50 && <p className="text-[10px] text-oj-fg-muted p-1 text-center border-t border-oj-border mt-1">Showing 50 of {filteredProblems.length}</p>}
            </div>
          </section>

          <section className="rounded-xl border border-oj-border bg-oj-surface p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-oj-fg-muted uppercase tracking-wider font-mono">
                Candidates <span className="text-oj-accent">({selectedCandidates.length})</span>
              </h2>
              <div className="flex gap-2 text-xs">
                <button onClick={selectAllCandidates} className="text-oj-accent hover:underline">Select all</button>
                <span className="text-oj-border">|</span>
                <button onClick={clearAllCandidates} className="text-oj-fg-muted hover:underline">Clear</button>
              </div>
            </div>
            <input
              type="text"
              placeholder="Search name or email…"
              value={candidateSearch}
              onChange={(e) => setCandidateSearch(e.target.value)}
              className={`${inputCls} py-1 text-xs mb-2`}
            />
            <div className="h-[220px] overflow-y-auto bg-oj-bg rounded border border-oj-border p-2 space-y-1">
              {displayCandidates.map((c) => (
                <label key={c.user_id} className="flex items-center gap-2 cursor-pointer hover:bg-oj-surface2 p-1.5 rounded">
                  <input
                    type="checkbox"
                    checked={selectedCandidates.includes(c.user_id)}
                    onChange={() => toggleCandidate(c.user_id)}
                    className="accent-oj-accent shrink-0"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm text-oj-fg truncate">{c.name}</span>
                    <span className="text-[10px] text-oj-fg-muted font-mono truncate">{c.email}</span>
                  </div>
                </label>
              ))}
              {filteredCandidates.length === 0 && <p className="text-xs text-oj-fg-muted p-2 text-center">No matching candidates.</p>}
              {filteredCandidates.length > 50 && <p className="text-[10px] text-oj-fg-muted p-1 text-center border-t border-oj-border mt-1">Showing 50 of {filteredCandidates.length}</p>}
            </div>
          </section>
        </div>
    </div>
  )
}
