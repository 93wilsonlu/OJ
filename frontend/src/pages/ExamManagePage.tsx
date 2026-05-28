import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiListAdminUsers } from '../api/admin'
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
import type { AdminUser } from '../types/admin'
import type { Exam, ExamAssignment } from '../types/exam'
import type { Problem } from '../types/problem'

const inputCls = `w-full bg-oj-surface2 border border-oj-border rounded px-3 py-1.5
                  text-sm text-oj-fg focus:outline-none focus:ring-1 focus:ring-oj-accent`

interface FormData {
  title: string
  description: string
  start_time: string
  end_time: string
  show_score: boolean
}

const EMPTY_FORM: FormData = {
  title: '',
  description: '',
  start_time: '',
  end_time: '',
  show_score: false,
}

function toLocalDatetime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toIsoDatetime(local: string): string {
  return new Date(local).toISOString()
}

function assignmentKey(candidateId: string, problemId: string) {
  return `${candidateId}_${problemId}`
}

export default function ExamManagePage() {
  const { examId } = useParams<{ examId: string }>()
  const isNew = !examId
  const navigate = useNavigate()
  const { getAccessToken } = useAuth()

  const [exam, setExam] = useState<Exam | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [allProblems, setAllProblems] = useState<Problem[]>([])
  const [selectedProblems, setSelectedProblems] = useState<string[]>([])
  const [problemSearch, setProblemSearch] = useState('')
  const [problemDifficulty, setProblemDifficulty] = useState('all')

  const [allCandidates, setAllCandidates] = useState<AdminUser[]>([])
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([])
  const [candidateSearch, setCandidateSearch] = useState('')

  const [originalAssignments, setOriginalAssignments] = useState<ExamAssignment[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const freshToken = await getAccessToken()
      if (!freshToken || cancelled) return

      try {
        const [problems, users] = await Promise.all([
          apiListProblems(freshToken),
          apiListAdminUsers(freshToken, { role: 'candidate', pageSize: 100 }),
        ])
        if (cancelled) return
        setAllProblems(problems)
        setAllCandidates(users.items)
      } catch {
        // Keep the form usable even if optional selector data fails to load.
      }

      if (!isNew && examId) {
        setLoading(true)
        try {
          const [examData, assignments] = await Promise.all([
            apiGetExam(freshToken, examId),
            apiListAssignments(freshToken, examId),
          ])
          if (cancelled) return
          setExam(examData)
          setOriginalAssignments(assignments)
          setForm({
            title: examData.title,
            description: examData.description ?? '',
            start_time: toLocalDatetime(examData.start_time),
            end_time: toLocalDatetime(examData.end_time),
            show_score: examData.show_score,
          })
          setSelectedProblems([...new Set(assignments.map((a) => a.problem_id))])
          setSelectedCandidates([...new Set(assignments.map((a) => a.candidate_id))])
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load exam')
        } finally {
          if (!cancelled) setLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [examId, getAccessToken, isNew])

  async function handleSave() {
    const freshToken = await getAccessToken()
    if (!freshToken) return

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
        start_time: toIsoDatetime(form.start_time),
        end_time: toIsoDatetime(form.end_time),
        show_score: form.show_score,
      }

      let targetId = examId
      if (isNew) {
        const created = await apiCreateExam(freshToken, payload)
        targetId = created.exam_id
      } else if (examId) {
        const updated = await apiUpdateExam(freshToken, examId, payload)
        setExam(updated)
      }

      if (!targetId) return

      const expectedKeys = new Set<string>()
      for (const candidateId of selectedCandidates) {
        for (const problemId of selectedProblems) {
          expectedKeys.add(assignmentKey(candidateId, problemId))
        }
      }

      const currentMap = new Map(
        originalAssignments.map((assignment) => [
          assignmentKey(assignment.candidate_id, assignment.problem_id),
          assignment.assignment_id,
        ]),
      )

      await Promise.all([
        ...[...expectedKeys]
          .filter((key) => !currentMap.has(key))
          .map((key) => {
            const [candidateId, problemId] = key.split('_')
            return apiCreateAssignment(freshToken, targetId, { candidate_id: candidateId, problem_id: problemId })
          }),
        ...[...currentMap.entries()]
          .filter(([key]) => !expectedKeys.has(key))
          .map(([, assignmentId]) => apiDeleteAssignment(freshToken, targetId, assignmentId)),
      ])

      navigate(isNew ? `/exams/${targetId}/manage` : '/exams')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    const freshToken = await getAccessToken()
    if (!freshToken || !examId) return
    if (!confirm('Delete this exam? This cannot be undone.')) return

    try {
      await apiDeleteExam(freshToken, examId)
      navigate('/exams')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const filteredProblems = allProblems.filter((problem) => {
    const matchSearch = problem.title.toLowerCase().includes(problemSearch.toLowerCase())
    const matchDifficulty = problemDifficulty === 'all' || problem.difficulty === problemDifficulty
    return matchSearch && matchDifficulty
  })
  const displayProblems = filteredProblems.slice(0, 50)

  const filteredCandidates = allCandidates.filter((candidate) => {
    const search = candidateSearch.toLowerCase()
    return candidate.name.toLowerCase().includes(search) || candidate.email.toLowerCase().includes(search)
  })
  const displayCandidates = filteredCandidates.slice(0, 50)

  function toggleProblem(id: string) {
    setSelectedProblems((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id])
  }

  function toggleCandidate(id: string) {
    setSelectedCandidates((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id])
  }

  function selectAllProblems() {
    const newIds = filteredProblems.map((problem) => problem.problem_id).filter((id) => !selectedProblems.includes(id))
    setSelectedProblems((prev) => [...prev, ...newIds])
  }

  function clearAllProblems() {
    const toRemove = new Set(filteredProblems.map((problem) => problem.problem_id))
    setSelectedProblems((prev) => prev.filter((id) => !toRemove.has(id)))
  }

  function selectAllCandidates() {
    const newIds = filteredCandidates.map((candidate) => candidate.user_id).filter((id) => !selectedCandidates.includes(id))
    setSelectedCandidates((prev) => [...prev, ...newIds])
  }

  function clearAllCandidates() {
    const toRemove = new Set(filteredCandidates.map((candidate) => candidate.user_id))
    setSelectedCandidates((prev) => prev.filter((id) => !toRemove.has(id)))
  }

  if (loading) return <div className="p-8 text-oj-fg-muted text-sm font-mono">Loading...</div>

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between gap-4 mb-8">
        <div>
          <button
            onClick={() => navigate('/exams')}
            className="text-xs text-oj-accent hover:underline block mb-1"
          >
            Back to exams
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
            {saving ? 'Saving...' : isNew ? 'Create exam' : 'Save changes'}
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm font-mono mb-4">{error}</p>}

      <section className="space-y-4 rounded-xl border border-oj-border bg-oj-surface p-5 mb-8">
        <h2 className="text-sm font-semibold text-oj-fg-muted uppercase tracking-wider font-mono">
          Exam details
        </h2>

        <label className="block">
          <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Title *</span>
          <input
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            className={inputCls}
            placeholder="e.g. Backend Engineer Interview"
          />
        </label>

        <label className="block">
          <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Description</span>
          <textarea
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
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
              onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-xs text-oj-fg-muted font-mono mb-1 block">End time *</span>
            <input
              type="datetime-local"
              value={form.end_time}
              onChange={(event) => setForm((current) => ({ ...current, end_time: event.target.value }))}
              className={inputCls}
            />
          </label>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.show_score}
            onChange={(event) => setForm((current) => ({ ...current, show_score: event.target.checked }))}
            className="accent-oj-accent"
          />
          <span className="text-sm text-oj-fg">Show score to candidates</span>
        </label>
      </section>

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
              placeholder="Search problems..."
              value={problemSearch}
              onChange={(event) => setProblemSearch(event.target.value)}
              className={`${inputCls} py-1 text-xs flex-1`}
            />
            <select
              value={problemDifficulty}
              onChange={(event) => setProblemDifficulty(event.target.value)}
              className={`${inputCls} py-1 text-xs w-[72px]`}
            >
              <option value="all">All</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <div className="h-[220px] overflow-y-auto bg-oj-bg rounded border border-oj-border p-2 space-y-1">
            {displayProblems.map((problem) => (
              <label key={problem.problem_id} className="flex items-center gap-2 cursor-pointer hover:bg-oj-surface2 p-1.5 rounded">
                <input
                  type="checkbox"
                  checked={selectedProblems.includes(problem.problem_id)}
                  onChange={() => toggleProblem(problem.problem_id)}
                  className="accent-oj-accent shrink-0"
                />
                <span className="text-sm text-oj-fg truncate flex-1">{problem.title}</span>
                <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono ${
                  problem.difficulty === 'easy'
                    ? 'bg-green-900/40 text-green-400'
                    : problem.difficulty === 'hard'
                      ? 'bg-red-900/40 text-red-400'
                      : 'bg-yellow-900/40 text-yellow-400'
                }`}>
                  {problem.difficulty}
                </span>
              </label>
            ))}
            {filteredProblems.length === 0 && <p className="text-xs text-oj-fg-muted p-2 text-center">No matching problems.</p>}
            {filteredProblems.length > 50 && (
              <p className="text-[10px] text-oj-fg-muted p-1 text-center border-t border-oj-border mt-1">
                Showing 50 of {filteredProblems.length}
              </p>
            )}
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
            placeholder="Search name or email..."
            value={candidateSearch}
            onChange={(event) => setCandidateSearch(event.target.value)}
            className={`${inputCls} py-1 text-xs mb-2`}
          />
          <div className="h-[220px] overflow-y-auto bg-oj-bg rounded border border-oj-border p-2 space-y-1">
            {displayCandidates.map((candidate) => (
              <label key={candidate.user_id} className="flex items-center gap-2 cursor-pointer hover:bg-oj-surface2 p-1.5 rounded">
                <input
                  type="checkbox"
                  checked={selectedCandidates.includes(candidate.user_id)}
                  onChange={() => toggleCandidate(candidate.user_id)}
                  className="accent-oj-accent shrink-0"
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-sm text-oj-fg truncate">{candidate.name}</span>
                  <span className="text-[10px] text-oj-fg-muted font-mono truncate">{candidate.email}</span>
                </div>
              </label>
            ))}
            {filteredCandidates.length === 0 && <p className="text-xs text-oj-fg-muted p-2 text-center">No matching candidates.</p>}
            {filteredCandidates.length > 50 && (
              <p className="text-[10px] text-oj-fg-muted p-1 text-center border-t border-oj-border mt-1">
                Showing 50 of {filteredCandidates.length}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
