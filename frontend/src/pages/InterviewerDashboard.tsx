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

  // 新增：搜尋與過濾狀態
  const [problemSearch, setProblemSearch] = useState('')
  const [problemDifficulty, setProblemDifficulty] = useState<string>('all')
  const [candidateSearch, setCandidateSearch] = useState('')

  useEffect(() => {
    if (open) {
      setForm(EMPTY_CREATE_FORM)
      setSelectedProblems([])
      setSelectedCandidates([])
      setProblemSearch('')
      setProblemDifficulty('all')
      setCandidateSearch('')
    }
  }, [open])

  if (!open) return null

  // ── 過濾邏輯 ──
  const filteredProblems = availableProblems.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(problemSearch.toLowerCase())
    const matchesDiff = problemDifficulty === 'all' || p.difficulty === problemDifficulty
    return matchesSearch && matchesDiff
  })

  const filteredCandidates = availableCandidates.filter(c => {
    const searchLower = candidateSearch.toLowerCase()
    return c.name.toLowerCase().includes(searchLower) || c.email.toLowerCase().includes(searchLower)
  })

  // 為了效能，清單最多顯示 50 筆
  const displayProblems = filteredProblems.slice(0, 50)
  const displayCandidates = filteredCandidates.slice(0, 50)

  // ── 互動邏輯 ──
  const toggleProblem = (id: string) => {
    setSelectedProblems(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  const toggleCandidate = (id: string) => {
    setSelectedCandidates(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  const handleSelectAllProblems = () => {
    // 找出目前「符合過濾條件」且「還沒被選」的 ID
    const newIds = filteredProblems.map(p => p.problem_id).filter(id => !selectedProblems.includes(id))
    setSelectedProblems(prev => [...prev, ...newIds])
  }

  const handleDeselectAllProblems = () => {
    // 找出目前「符合過濾條件」且「已經被選」的 ID
    const idsToRemove = filteredProblems.map(p => p.problem_id)
    setSelectedProblems(prev => prev.filter(id => !idsToRemove.includes(id)))
  }

  const handleSelectAllCandidates = () => {
    const newIds = filteredCandidates.map(c => c.user_id).filter(id => !selectedCandidates.includes(id))
    setSelectedCandidates(prev => [...prev, ...newIds])
  }

  const handleDeselectAllCandidates = () => {
    const idsToRemove = filteredCandidates.map(c => c.user_id)
    setSelectedCandidates(prev => prev.filter(id => !idsToRemove.includes(id)))
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
      <div className="w-full max-w-4xl rounded-xl border border-oj-border bg-oj-surface p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-oj-fg">Create New Exam</h2>
          <button onClick={onClose} className="text-oj-fg-muted hover:text-oj-fg transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* === 左半邊：基本資訊 === */}
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs text-oj-fg-muted font-mono mb-1 block uppercase tracking-wider">Title</span>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className={inputCls}
                placeholder="e.g., 2026 Spring Midterm"
              />
            </label>
            
            <label className="block">
              <span className="text-xs text-oj-fg-muted font-mono mb-1 block uppercase tracking-wider">Description</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className={`${inputCls} min-h-[80px] resize-y`}
                placeholder="Details about this exam..."
              />
            </label>

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs text-oj-fg-muted font-mono mb-1 block uppercase tracking-wider">Start Time</span>
                <input
                  type="datetime-local"
                  value={form.start_time}
                  onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="text-xs text-oj-fg-muted font-mono mb-1 block uppercase tracking-wider">End Time</span>
                <input
                  type="datetime-local"
                  value={form.end_time}
                  onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                  className={inputCls}
                />
              </label>
            </div>
            
            <label className="flex items-center gap-2 mt-4 pt-2 cursor-pointer group"> {/* 添加 pt-2、cursor-pointer 和 group */}
              <input 
                type="checkbox" 
                checked={form.show_score}
                onChange={(e) => setForm((f) => ({ ...f, show_score: e.target.checked }))}
                className="accent-oj-accent rounded bg-oj-surface2 border border-oj-border w-5 h-5 cursor-pointer" // 略微放大並添加邊框和光標
              />
              <span className="text-sm text-oj-fg select-none group-hover:text-oj-fg transition-colors">Show scores to candidates</span> {/* 添加 select-none */}
            </label>
          </div>

          {/* === 右半邊：指派區塊 === */}
          <div className="space-y-6 lg:border-l border-oj-border lg:pl-8">
            
            {/* --- 題目指派 --- */}
            <div className="flex flex-col h-[280px]"> 
              <div className="flex items-end justify-between mb-2">
                <span className="text-xs text-oj-fg-muted font-mono uppercase tracking-wider">
                  Problems <span className="text-oj-accent ml-1">({selectedProblems.length} selected)</span>
                </span>
                <div className="flex gap-2">
                  <button onClick={handleSelectAllProblems} className="text-xs text-oj-accent hover:underline">Select All</button>
                  <span className="text-oj-border">|</span>
                  <button onClick={handleDeselectAllProblems} className="text-xs text-oj-fg-muted hover:underline">Clear</button>
                </div>
              </div>
              
              {/* 搜尋與過濾列 */}
              <div className="flex gap-2 mb-2 shrink-0 w-full">
                {/* 左邊搜尋框佔滿剩餘空間 */}
                <div className="flex-1 min-w-0">
                  <input 
                    type="text" 
                    placeholder="Search problems..." 
                    value={problemSearch}
                    onChange={e => setProblemSearch(e.target.value)}
                    className={`${inputCls} py-1 text-xs`}
                  />
                </div>
                {/* 右邊下拉選單固定寬度 */}
                <div className="w-[100px] shrink-0">
                  <select 
                    value={problemDifficulty} 
                    onChange={e => setProblemDifficulty(e.target.value)}
                    className={`${inputCls} py-1 text-xs cursor-pointer`}
                  >
                    <option value="all">All Diff</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>

              {/* 清單 */}
              <div className="flex-1 overflow-y-auto bg-oj-surface2 rounded border border-oj-border p-2 space-y-1">
                {displayProblems.map(p => (
                  <label key={p.problem_id} className="flex items-center gap-3 cursor-pointer hover:bg-oj-bg p-1.5 rounded transition-colors border border-transparent hover:border-oj-border">
                    <input 
                      type="checkbox" 
                      checked={selectedProblems.includes(p.problem_id)}
                      onChange={() => toggleProblem(p.problem_id)}
                      className="accent-oj-accent shrink-0"
                    />
                    <span className="text-sm text-oj-fg truncate flex-1">{p.title}</span>
                    <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider font-mono ${p.difficulty === 'easy' ? 'bg-green-900/40 text-green-400' : p.difficulty === 'medium' ? 'bg-yellow-900/40 text-yellow-400' : 'bg-red-900/40 text-red-400'}`}>
                      {p.difficulty}
                    </span>
                  </label>
                ))}
                {filteredProblems.length === 0 && <div className="text-xs text-oj-fg-muted p-2 text-center">No matching problems found.</div>}
                {filteredProblems.length > 50 && <div className="text-xs text-oj-fg-muted p-2 text-center border-t border-oj-border mt-2 pt-2">Showing 50 of {filteredProblems.length}. Use search to narrow down.</div>}
              </div>
            </div>

            {/* --- 考生指派 --- */}
            <div className="flex flex-col h-[280px]">
              <div className="flex items-end justify-between mb-2">
                <span className="text-xs text-oj-fg-muted font-mono uppercase tracking-wider">
                  Candidates <span className="text-oj-accent ml-1">({selectedCandidates.length} selected)</span>
                </span>
                <div className="flex gap-2">
                  <button onClick={handleSelectAllCandidates} className="text-xs text-oj-accent hover:underline">Select All</button>
                  <span className="text-oj-border">|</span>
                  <button onClick={handleDeselectAllCandidates} className="text-xs text-oj-fg-muted hover:underline">Clear</button>
                </div>
              </div>
              
              {/* 搜尋列 */}
              <div className="mb-2 shrink-0">
                <input 
                  type="text" 
                  placeholder="Search name or email..." 
                  value={candidateSearch}
                  onChange={e => setCandidateSearch(e.target.value)}
                  className={`${inputCls} py-1 text-xs`}
                />
              </div>

              {/* 清單 */}
              <div className="flex-1 overflow-y-auto bg-oj-surface2 rounded border border-oj-border p-2 space-y-1">
                {displayCandidates.map(c => (
                  <label key={c.user_id} className="flex items-center gap-3 cursor-pointer hover:bg-oj-bg p-1.5 rounded transition-colors border border-transparent hover:border-oj-border">
                    <input 
                      type="checkbox" 
                      checked={selectedCandidates.includes(c.user_id)}
                      onChange={() => toggleCandidate(c.user_id)}
                      className="accent-oj-accent shrink-0"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm text-oj-fg truncate font-medium">{c.name}</span>
                      <span className="text-xs text-oj-fg-muted font-mono truncate">{c.email}</span>
                    </div>
                  </label>
                ))}
                {filteredCandidates.length === 0 && <div className="text-xs text-oj-fg-muted p-2 text-center">No matching candidates found.</div>}
                {filteredCandidates.length > 50 && <div className="text-xs text-oj-fg-muted p-2 text-center border-t border-oj-border mt-2 pt-2">Showing 50 of {filteredCandidates.length}. Use search to narrow down.</div>}
              </div>
            </div>

          </div>
        </div>

        {error && <div className="bg-red-900/20 border border-red-900/50 text-red-400 p-3 rounded-md text-sm font-mono mt-6">{error}</div>}

        <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-oj-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium text-oj-fg-muted hover:text-oj-fg hover:bg-oj-surface2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.title}
            className="px-6 py-2 rounded-md text-sm font-bold bg-oj-accent text-oj-bg hover:bg-oj-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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