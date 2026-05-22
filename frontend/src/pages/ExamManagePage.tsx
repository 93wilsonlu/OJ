import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

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

function fromLocalDatetime(local: string): string {
  return new Date(local).toISOString()
}

interface ExamFormData {
  title: string
  description: string
  start_time: string
  end_time: string
  show_score: boolean
}

const EMPTY_FORM: ExamFormData = {
  title: '',
  description: '',
  start_time: '',
  end_time: '',
  show_score: false,
}

function difficultyColor(d: string) {
  if (d === 'easy') return 'text-green-400'
  if (d === 'hard') return 'text-red-400'
  return 'text-yellow-400'
}

export default function ExamManagePage() {
  const { examId } = useParams<{ examId: string }>()
  const isNew = !examId
  const navigate = useNavigate()
  const { getAccessToken } = useAuth()

  const [token, setToken] = useState<string | null>(null)
  const [form, setForm] = useState<ExamFormData>(EMPTY_FORM)
  const [exam, setExam] = useState<Exam | null>(null)
  const [assignments, setAssignments] = useState<ExamAssignment[]>([])
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // add-assignment form
  const [addProblemId, setAddProblemId] = useState('')
  const [addCandidateId, setAddCandidateId] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    getAccessToken().then(setToken)
  }, [getAccessToken])

  useEffect(() => {
    if (!token) return
    apiListProblems(token).then(setProblems).catch(() => {})
    if (!isNew && examId) {
      setLoading(true)
      Promise.all([apiGetExam(token, examId), apiListAssignments(token, examId)])
        .then(([e, a]) => {
          setExam(e)
          setAssignments(a)
          setForm({
            title: e.title,
            description: e.description ?? '',
            start_time: toLocalDatetime(e.start_time),
            end_time: toLocalDatetime(e.end_time),
            show_score: e.show_score,
          })
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
        start_time: fromLocalDatetime(form.start_time),
        end_time: fromLocalDatetime(form.end_time),
        show_score: form.show_score,
      }
      if (isNew) {
        const created = await apiCreateExam(token, payload)
        navigate(`/exams/${created.exam_id}/manage`)
      } else if (examId) {
        const updated = await apiUpdateExam(token, examId, payload)
        setExam(updated)
        setForm((f) => ({ ...f, title: updated.title, description: updated.description ?? '' }))
      }
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
      navigate('/exams')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  async function handleAddAssignment() {
    if (!token || !examId) return
    if (!addProblemId || !addCandidateId.trim()) {
      setAddError('Both problem and candidate ID are required.')
      return
    }
    setAdding(true)
    setAddError(null)
    try {
      const a = await apiCreateAssignment(token, examId, {
        problem_id: addProblemId,
        candidate_id: addCandidateId.trim(),
      })
      setAssignments((prev) => [...prev, a])
      setAddCandidateId('')
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to add assignment')
    } finally {
      setAdding(false)
    }
  }

  async function handleRemoveAssignment(assignmentId: string) {
    if (!token || !examId) return
    setDeletingId(assignmentId)
    try {
      await apiDeleteAssignment(token, examId, assignmentId)
      setAssignments((prev) => prev.filter((a) => a.assignment_id !== assignmentId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove assignment')
    } finally {
      setDeletingId(null)
    }
  }

  const problemMap = new Map(problems.map((p) => [p.problem_id, p]))

  if (loading) return <div className="p-8 text-oj-fg-muted text-sm font-mono">Loading…</div>

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-oj-fg">
            {isNew ? 'New Exam' : `Edit: ${exam?.title ?? ''}`}
          </h1>
          {!isNew && (
            <Link to="/exams" className="text-xs text-oj-accent hover:underline mt-1 block">
              ← Back to exams
            </Link>
          )}
        </div>
        {!isNew && (
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 rounded-md text-xs text-red-400 hover:bg-red-400/10"
          >
            Delete exam
          </button>
        )}
      </div>

      {/* Exam details form */}
      <section className="space-y-4 rounded-xl border border-oj-border bg-oj-surface p-5">
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

        {error && <p className="text-red-400 text-sm font-mono">{error}</p>}

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-md text-sm font-medium bg-oj-accent text-oj-bg
                       hover:bg-oj-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : isNew ? 'Create exam' : 'Save changes'}
          </button>
        </div>
      </section>

      {/* Assignments — only show after exam is created */}
      {!isNew && examId && (
        <section className="space-y-4 rounded-xl border border-oj-border bg-oj-surface p-5">
          <h2 className="text-sm font-semibold text-oj-fg-muted uppercase tracking-wider font-mono">
            Assignments ({assignments.length})
          </h2>

          {/* Add assignment form */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Problem</span>
              <select
                value={addProblemId}
                onChange={(e) => setAddProblemId(e.target.value)}
                className={inputCls}
              >
                <option value="">Select problem…</option>
                {problems.map((p) => (
                  <option key={p.problem_id} value={p.problem_id}>
                    {p.title} ({p.difficulty})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Candidate ID (UUID)</span>
              <input
                value={addCandidateId}
                onChange={(e) => setAddCandidateId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className={inputCls}
              />
            </div>
            <button
              onClick={handleAddAssignment}
              disabled={adding}
              className="shrink-0 px-4 py-1.5 rounded-md text-sm font-medium bg-oj-accent
                         text-oj-bg hover:bg-oj-accent/90 disabled:opacity-50"
            >
              {adding ? 'Adding…' : '+ Add'}
            </button>
          </div>
          {addError && <p className="text-red-400 text-sm font-mono">{addError}</p>}

          {/* Assignment list */}
          {assignments.length === 0 ? (
            <p className="text-sm text-oj-fg-muted">No assignments yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-oj-border">
              <table className="w-full text-sm">
                <thead className="bg-oj-surface/50 text-oj-fg-muted">
                  <tr>
                    <th className="text-left px-4 py-2.5">Problem</th>
                    <th className="text-left px-4 py-2.5">Candidate ID</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => {
                    const p = problemMap.get(a.problem_id)
                    return (
                      <tr key={a.assignment_id} className="border-b border-oj-border last:border-0">
                        <td className="px-4 py-3">
                          <span className="text-oj-fg">{p?.title ?? a.problem_id}</span>
                          {p && (
                            <span className={`ml-2 text-xs font-mono ${difficultyColor(p.difficulty)}`}>
                              {p.difficulty}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-oj-fg-muted font-mono text-xs">
                          {a.candidate_id}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleRemoveAssignment(a.assignment_id)}
                            disabled={deletingId === a.assignment_id}
                            className="px-3 py-1.5 rounded-md text-xs text-red-400 hover:bg-red-400/10
                                       disabled:opacity-40"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
