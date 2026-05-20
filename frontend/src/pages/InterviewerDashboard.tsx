import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiListExams, apiCreateExam, CreateExamSchema } from '../api/exams'
import { apiListProblems } from '../api/problems'
import { apiListAdminUsers } from '../api/admin'
import { useAuth } from '../hooks/useAuth'
import type { Exam } from '../types/exam'

const inputCls = `w-full bg-oj-surface2 border border-oj-border rounded px-3 py-1.5
                  text-sm text-oj-fg focus:outline-none focus:ring-1 focus:ring-oj-accent`

const EMPTY_CREATE_FORM: CreateExamSchema = {
  title: '',
  description: '',
  start_time: '',
  end_time: '',
  show_score: true,
}

// ── 1. CreateExamModal  ────────────────────────────────────────────────

function CreateExamModal({
  open,
  saving,
  error,
  availableProblems,
  availableCandidates,
  onClose,
  onSubmit,
}: {
  open: boolean
  saving: boolean
  error: string | null
  availableProblems: any[]
  availableCandidates: any[]
  onClose: () => void
  onSubmit: (payload: CreateExamSchema, problemIds: string[], candidateIds: string[]) => Promise<void>
}) {
  const [form, setForm] = useState<CreateExamSchema>(EMPTY_CREATE_FORM)
  const [selectedProblems, setSelectedProblems] = useState<string[]>([])
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([])

  useEffect(() => {
    if (open) {
      setForm(EMPTY_CREATE_FORM)
      setSelectedProblems([])
      setSelectedCandidates([])
    }
  }, [open])

  if (!open) return null

  const toggleProblem = (id: string) => {
    setSelectedProblems(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  const toggleCandidate = (id: string) => {
    setSelectedCandidates(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  const handleSubmit = () => {
    if (!form.start_time || !form.end_time) {
      alert("Please select start and end times.");
      return;
    }
    onSubmit(
      {
        ...form,
        start_time: new Date(form.start_time).toISOString(),
        end_time: new Date(form.end_time).toISOString()
      },
      selectedProblems,
      selectedCandidates
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-2xl rounded-xl border border-oj-border bg-oj-surface p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-oj-fg">Create Exam</h2>
          <button onClick={onClose} className="text-oj-fg-muted hover:text-oj-fg">×</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Exam Information */}
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Title</span>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className={inputCls}
                placeholder="e.g., 2026 Spring Midterm"
              />
            </label>
            
            <label className="block">
              <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Description</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className={`${inputCls} min-h-[60px] resize-y`}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Start Time</span>
                <input
                  type="datetime-local"
                  value={form.start_time}
                  onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="text-xs text-oj-fg-muted font-mono mb-1 block">End Time</span>
                <input
                  type="datetime-local"
                  value={form.end_time}
                  onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                  className={inputCls}
                />
              </label>
            </div>
            
            <label className="flex items-center gap-2 mt-2">
              <input 
                type="checkbox" 
                checked={form.show_score}
                onChange={(e) => setForm((f) => ({ ...f, show_score: e.target.checked }))}
                className="accent-oj-accent rounded bg-oj-surface2 border-oj-border"
              />
              <span className="text-sm text-oj-fg">Show scores to candidates</span>
            </label>
          </div>

          {/* Assigning problems and candidates */}
          <div className="space-y-4 border-t md:border-t-0 md:border-l border-oj-border md:pl-6 pt-4 md:pt-0">
            <div>
              <span className="text-xs text-oj-fg-muted font-mono mb-2 block">Assign Problems ({selectedProblems.length})</span>
              <div className="max-h-32 overflow-y-auto bg-oj-surface2 rounded border border-oj-border p-2 space-y-1">
                {availableProblems.map(p => (
                  <label key={p.problem_id} className="flex items-center gap-2 cursor-pointer hover:bg-oj-bg p-1 rounded">
                    <input 
                      type="checkbox" 
                      checked={selectedProblems.includes(p.problem_id)}
                      onChange={() => toggleProblem(p.problem_id)}
                      className="accent-oj-accent"
                    />
                    <span className="text-sm text-oj-fg truncate">{p.title}</span>
                  </label>
                ))}
                {availableProblems.length === 0 && <span className="text-xs text-oj-fg-muted">No problems available.</span>}
              </div>
            </div>

            <div>
              <span className="text-xs text-oj-fg-muted font-mono mb-2 block">Assign Candidates ({selectedCandidates.length})</span>
              <div className="max-h-32 overflow-y-auto bg-oj-surface2 rounded border border-oj-border p-2 space-y-1">
                {availableCandidates.map(c => (
                  <label key={c.user_id} className="flex items-center gap-2 cursor-pointer hover:bg-oj-bg p-1 rounded">
                    <input 
                      type="checkbox" 
                      checked={selectedCandidates.includes(c.user_id)}
                      onChange={() => toggleCandidate(c.user_id)}
                      className="accent-oj-accent"
                    />
                    <span className="text-sm text-oj-fg truncate">{c.name} <span className="text-xs text-oj-fg-muted">({c.email})</span></span>
                  </label>
                ))}
                {availableCandidates.length === 0 && <span className="text-xs text-oj-fg-muted">No candidates available.</span>}
              </div>
            </div>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm font-mono mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm text-oj-fg-muted hover:bg-oj-surface2"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.title}
            className="px-4 py-1.5 rounded-md text-sm font-medium bg-oj-accent text-oj-bg
                       hover:bg-oj-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Creating…' : 'Create Exam'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 2. InterviewerDashboard ────────────────────────────────────────────────

export default function InterviewerDashboard() {
  const { getAccessToken } = useAuth()
  const [token, setToken] = useState<string | null>(null)
  
  const [exams, setExams] = useState<Exam[]>([])
  const [availableProblems, setAvailableProblems] = useState<any[]>([]) 
  const [availableCandidates, setAvailableCandidates] = useState<any[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    getAccessToken().then(setToken)
  }, [getAccessToken])

  const fetchAllData = async (currentToken: string) => {
    try {
      setLoading(true)
      const [examsData, problemsData, usersData] = await Promise.all([
        apiListExams(currentToken),
        apiListProblems(currentToken),
        apiListAdminUsers(currentToken, { role: 'candidate', page: 1, pageSize: 100 })
      ])
      
      setExams(examsData)
      setAvailableProblems(problemsData)
      setAvailableCandidates(usersData.items || []) 
      
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load initial data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) {
      fetchAllData(token)
    }
  }, [token])


  const handleCreate = async (payload: CreateExamSchema, problemIds: string[], candidateIds: string[]) => {
    if (!token) return
    setCreating(true)
    setCreateError(null)
    try {

      const newExam = await apiCreateExam(token, payload)
      
      const assignmentPromises = []
      for (const candidateId of candidateIds) {
        for (const problemId of problemIds) {
          assignmentPromises.push(
            fetch(`/api/v1/exams/${newExam.exam_id}/assignments`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                candidate_id: candidateId,
                problem_id: problemId,
              })
            }).then(res => {
              if (!res.ok) throw new Error('Failed to assign problem')
            })
          )
        }
      }
      
      await Promise.all(assignmentPromises)

      setCreateOpen(false) 
      await fetchAllData(token)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Create or assign failed')
    } finally {
      setCreating(false)
    }
  }

  if (loading && exams.length === 0) return <div className="p-8 text-oj-fg-muted text-sm font-mono">Loading…</div>
  if (error) return <div className="p-8 text-red-400 text-sm font-mono">Error: {error}</div>

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-oj-fg">Exam Management</h1>
        <button 
          onClick={() => setCreateOpen(true)}
          className="bg-oj-accent text-oj-bg px-4 py-2 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          + New Exam
        </button>
      </div>

      <section className="bg-oj-surface border border-oj-border rounded-lg overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-oj-surface border-b border-oj-border text-oj-fg-muted uppercase tracking-wide">
            <tr>
              <th className="p-4 font-semibold">Title</th>
              <th className="p-4 font-semibold">Start Time</th>
              <th className="p-4 font-semibold">End Time</th>
              <th className="p-4 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-oj-border">
            {exams.map((exam) => (
              <tr key={exam.exam_id} className="hover:bg-black/20 transition-colors text-oj-fg">
                <td className="p-4 font-medium">{exam.title}</td>
                <td className="p-4 font-mono text-xs">{new Date(exam.start_time).toLocaleString()}</td>
                <td className="p-4 font-mono text-xs">{new Date(exam.end_time).toLocaleString()}</td>
                <td className="p-4">
                  <Link
                    to={`/interviewer/${exam.exam_id}`}
                    className="text-oj-accent hover:underline text-xs"
                  >
                    Manage →
                  </Link>
                </td>
              </tr>
            ))}
            {exams.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-oj-fg-muted">
                  No exams assigned yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <CreateExamModal 
        open={createOpen}
        saving={creating}
        error={createError}
        availableProblems={availableProblems}
        availableCandidates={availableCandidates}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />
    </div>
  )
}