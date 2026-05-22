import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGetExam, apiUpdateExam, apiDeleteExam, apiListExamProblems, apiListExamAssignments, apiCreateExamAssignment, apiDeleteExamAssignment } from '../api/exams';
import { apiListProblems } from '../api/problems';
import { apiListAdminUsers } from '../api/admin';
import { useAuth } from '../hooks/useAuth';
import type { Exam, ExamProblem } from '../types/exam';

const inputCls = `w-full bg-oj-surface2 border border-oj-border rounded px-3 py-1.5
                  text-sm text-oj-fg focus:outline-none focus:ring-1 focus:ring-oj-accent`;

export default function ExamDetail() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { getAccessToken } = useAuth();
  const [token, setToken] = useState<string | null>(null);

  const [exam, setExam] = useState<Exam | null>(null);
  const [assignedProblems, setAssignedProblems] = useState<ExamProblem[]>([]);
  const [assignedCandidates, setAssignedCandidates] = useState<any[]>([]);

  const [originalAssignments, setOriginalAssignments] = useState<any[]>([]);

  // States for all available items to show in edit mode
  const [availableProblems, setAvailableProblems] = useState<any[]>([]);
  const [availableCandidates, setAvailableCandidates] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // States for edit form
  const [editForm, setEditForm] = useState<Partial<Exam>>({});
  const [editProblems, setEditProblems] = useState<string[]>([]);
  const [editCandidates, setEditCandidates] = useState<string[]>([]);

  // ── 新增：編輯模式的搜尋與過濾狀態 ──
  const [problemSearch, setProblemSearch] = useState('');
  const [problemDifficulty, setProblemDifficulty] = useState<string>('all');
  const [candidateSearch, setCandidateSearch] = useState('');

  useEffect(() => {
    getAccessToken().then(setToken);
  }, [getAccessToken]);

  const loadData = async (currentToken: string, id: string) => {
    setLoading(true);
    try {
      const [examData, problemsData, allProbsData, allUsersData, assignmentsData] = await Promise.all([
        apiGetExam(currentToken, id),
        apiListExamProblems(currentToken, id),
        apiListProblems(currentToken),
        apiListAdminUsers(currentToken, { role: 'candidate', pageSize: 100 }),
        apiListExamAssignments(currentToken, id)
      ]);
      
      setExam(examData);
      setAvailableProblems(allProbsData);
      setAvailableCandidates(allUsersData.items || []);
      setOriginalAssignments(assignmentsData); 

      const uniqueProblems = Array.from(new Map(problemsData.map(p => [p.problem_id, p])).values());
      setAssignedProblems(uniqueProblems);
      
      const formatForInput = (dateString: string) => {
          const d = new Date(dateString);
          return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      };

      setEditForm({
          ...examData,
          start_time: formatForInput(examData.start_time),
          end_time: formatForInput(examData.end_time)
      });

      const candidateIds = Array.from(new Set(assignmentsData.map((a: any) => a.candidate_id))) as string[];
      const allCandidates = allUsersData.items || [];
      const matchedCandidates = allCandidates.filter(c => candidateIds.includes(c.user_id));
      setAssignedCandidates(matchedCandidates);

    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load exam details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && examId) {
      loadData(token, examId);
    }
  }, [token, examId]);

  const handleEditClick = () => {
    setEditProblems(assignedProblems.map(p => p.problem_id));
    setEditCandidates(assignedCandidates.map(c => c.user_id));
    
    // 進入編輯模式時，重置搜尋條件
    setProblemSearch('');
    setProblemDifficulty('all');
    setCandidateSearch('');
    
    setIsEditing(true);
  };

  // ── 新增：過濾邏輯 ──
  const filteredProblems = availableProblems.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(problemSearch.toLowerCase())
    const matchesDiff = problemDifficulty === 'all' || p.difficulty === problemDifficulty
    return matchesSearch && matchesDiff
  })

  const filteredCandidates = availableCandidates.filter(c => {
    const searchLower = candidateSearch.toLowerCase()
    return c.name.toLowerCase().includes(searchLower) || c.email.toLowerCase().includes(searchLower)
  })

  const displayProblems = filteredProblems.slice(0, 50)
  const displayCandidates = filteredCandidates.slice(0, 50)

  // ── 新增：全選 / 取消全選邏輯 ──
  const handleSelectAllProblems = () => {
    const newIds = filteredProblems.map(p => p.problem_id).filter(id => !editProblems.includes(id))
    setEditProblems(prev => [...prev, ...newIds])
  }

  const handleDeselectAllProblems = () => {
    const idsToRemove = filteredProblems.map(p => p.problem_id)
    setEditProblems(prev => prev.filter(id => !idsToRemove.includes(id)))
  }

  const handleSelectAllCandidates = () => {
    const newIds = filteredCandidates.map(c => c.user_id).filter(id => !editCandidates.includes(id))
    setEditCandidates(prev => [...prev, ...newIds])
  }

  const handleDeselectAllCandidates = () => {
    const idsToRemove = filteredCandidates.map(c => c.user_id)
    setEditCandidates(prev => prev.filter(id => !idsToRemove.includes(id)))
  }

  const toggleProblem = (id: string) => {
    setEditProblems(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const toggleCandidate = (id: string) => {
    setEditCandidates(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const handleSave = async () => {
    if (!token || !examId) return;
    setSaving(true);
    try {
      const payload = {
          title: editForm.title,
          description: editForm.description ?? "",
          start_time: editForm.start_time ? new Date(editForm.start_time).toISOString() : undefined,
          end_time: editForm.end_time ? new Date(editForm.end_time).toISOString() : undefined,
          show_score: editForm.show_score
      };
      await apiUpdateExam(token, examId, payload);

      const expectedAssignments = new Set<string>();
      for (const cId of editCandidates) {
        for (const pId of editProblems) {
          expectedAssignments.add(`${cId}_${pId}`);
        }
      }

      const currentAssignments = new Map<string, string>(); 
      for (const a of originalAssignments) {
        currentAssignments.set(`${a.candidate_id}_${a.problem_id}`, a.assignment_id);
      }

      const promises = [];

      for (const expectedKey of expectedAssignments) {
        if (!currentAssignments.has(expectedKey)) {
          const [cId, pId] = expectedKey.split('_');
          promises.push(
            apiCreateExamAssignment(token, examId, { candidate_id: cId, problem_id: pId })
          );
        }
      }

      for (const [currentKey, assignmentId] of currentAssignments.entries()) {
        if (!expectedAssignments.has(currentKey)) {
          promises.push(
            apiDeleteExamAssignment(token, examId, assignmentId)
          );
        }
      }

      await Promise.all(promises);

      setIsEditing(false);
      await loadData(token, examId); 
    } catch (e) {
      alert("Failed to save: " + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !examId) return;
    if (confirm("Are you sure you want to delete this exam? This action cannot be undone.")) {
      try {
        await apiDeleteExam(token, examId);
        navigate('/interviewer'); 
      } catch (e) {
        alert("Failed to delete: " + (e instanceof Error ? e.message : 'Unknown error'));
      }
    }
  };

  if (loading && !exam) return <div className="p-8 text-oj-fg-muted font-mono">Loading Exam Details...</div>;
  if (error || !exam) return <div className="p-8 text-red-400 font-mono">Error: {error || 'Exam not found'}</div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <button 
        onClick={() => {
            if(isEditing) setIsEditing(false);
            else navigate('/interviewer');
        }}
        className="mb-6 text-sm text-oj-accent hover:underline flex items-center gap-1"
      >
        {isEditing ? '← Cancel Edit' : '← Back to Dashboard'}
      </button>

      <div className="bg-oj-surface border border-oj-border rounded-lg p-6 shadow-lg">
        <div className="flex justify-between items-start mb-6 border-b border-oj-border pb-4">
          {isEditing ? (
             <div className="w-1/2">
                <span className="text-xs text-oj-fg-muted font-mono mb-1 block">Title</span>
                <input 
                  className={`${inputCls} text-lg font-bold`}
                  value={editForm.title || ''}
                  onChange={e => setEditForm({...editForm, title: e.target.value})}
                />
            </div>
          ) : (
            <h1 className="text-2xl font-bold text-oj-fg">{exam.title}</h1>
          )}
          
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <button onClick={() => setIsEditing(false)} disabled={saving} className="px-3 py-1.5 rounded text-sm text-oj-fg-muted hover:bg-oj-surface2 disabled:opacity-50">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 rounded text-sm bg-oj-accent text-oj-bg hover:bg-oj-accent/90 disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save'}
                </button>
              </>
            ) : (
              <>
                <button onClick={handleEditClick} className="px-3 py-1.5 rounded text-sm border border-oj-border text-oj-fg hover:bg-oj-surface2">Edit</button>
                <button onClick={handleDelete} className="px-3 py-1.5 rounded text-sm border border-red-900/50 text-red-400 hover:bg-red-900/20">Delete</button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_350px] gap-8">
          <div className="space-y-4">
            <div>
              <span className="text-xs text-oj-fg-muted font-mono uppercase tracking-wider block mb-1">Description</span>
              {isEditing ? (
                <textarea 
                  className={`${inputCls} min-h-[100px] resize-y`}
                  value={editForm.description || ''}
                  onChange={e => setEditForm({...editForm, description: e.target.value})}
                />
              ) : (
                <p className="text-sm text-oj-fg whitespace-pre-wrap bg-oj-surface2 rounded p-3 border border-oj-border min-h-[60px]">
                  {exam.description || <span className="text-oj-fg-muted italic">No description provided.</span>}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-oj-fg-muted font-mono uppercase tracking-wider block mb-1">Start Time</span>
                {isEditing ? (
                   <input
                     type="datetime-local"
                     value={editForm.start_time || ''}
                     onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })}
                     className={inputCls}
                   />
                ) : (
                  <div className="text-sm text-oj-fg font-mono bg-oj-surface2 p-2 rounded border border-oj-border">
                    {new Date(exam.start_time).toLocaleString()}
                  </div>
                )}
              </div>
              <div>
                <span className="text-xs text-oj-fg-muted font-mono uppercase tracking-wider block mb-1">End Time</span>
                {isEditing ? (
                   <input
                     type="datetime-local"
                     value={editForm.end_time || ''}
                     onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })}
                     className={inputCls}
                   />
                ) : (
                  <div className="text-sm text-oj-fg font-mono bg-oj-surface2 p-2 rounded border border-oj-border">
                    {new Date(exam.end_time).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-oj-border">
               {isEditing ? (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={editForm.show_score ?? true}
                      onChange={(e) => setEditForm({ ...editForm, show_score: e.target.checked })}
                      className="accent-oj-accent"
                    />
                    <span className="text-sm text-oj-fg">Show scores to candidates</span>
                  </label>
               ) : (
                  <>
                    <span className="text-xs text-oj-fg-muted font-mono uppercase tracking-wider">Show Scores:</span>
                    <span className={`text-xs px-2 py-1 rounded font-mono ${exam.show_score ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                      {exam.show_score ? 'Enabled' : 'Disabled'}
                    </span>
                  </>
               )}
            </div>
          </div>

          <div className="border-t md:border-t-0 md:border-l border-oj-border md:pl-6 pt-4 md:pt-0 space-y-6">
             {/* Problems Section */}
             <div className="flex flex-col h-[280px]">
               <div className="flex items-end justify-between mb-2">
                 <span className="text-xs font-semibold text-oj-fg uppercase tracking-wider">
                   {isEditing ? 'Assign Problems' : 'Assigned Problems'}
                   <span className="text-oj-accent ml-1 text-[10px]">
                      ({isEditing ? editProblems.length : assignedProblems.length})
                   </span>
                 </span>
                 {isEditing && (
                   <div className="flex gap-2">
                     <button onClick={handleSelectAllProblems} className="text-[10px] text-oj-accent hover:underline">Select All</button>
                     <span className="text-oj-border text-[10px]">|</span>
                     <button onClick={handleDeselectAllProblems} className="text-[10px] text-oj-fg-muted hover:underline">Clear</button>
                   </div>
                 )}
               </div>
               
               {isEditing ? (
                 <>
                   <div className="flex gap-2 mb-2 shrink-0 w-full">
                     <div className="flex-1 min-w-0">
                       <input 
                         type="text" 
                         placeholder="Search problems..." 
                         value={problemSearch}
                         onChange={e => setProblemSearch(e.target.value)}
                         className={`${inputCls} py-1 text-xs`}
                       />
                     </div>
                     <div className="w-[90px] shrink-0">
                       <select 
                         value={problemDifficulty} 
                         onChange={e => setProblemDifficulty(e.target.value)}
                         className={`${inputCls} py-1 text-xs cursor-pointer px-1`}
                       >
                         <option value="all">All Diff</option>
                         <option value="easy">Easy</option>
                         <option value="medium">Medium</option>
                         <option value="hard">Hard</option>
                       </select>
                     </div>
                   </div>

                   <div className="flex-1 overflow-y-auto bg-oj-bg rounded border border-oj-border p-2 space-y-1">
                     {displayProblems.map(p => (
                       <label key={p.problem_id} className="flex items-center gap-2 cursor-pointer hover:bg-oj-surface2 p-1.5 rounded transition-colors">
                         <input 
                           type="checkbox" 
                           checked={editProblems.includes(p.problem_id)}
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
                     {filteredProblems.length > 50 && <div className="text-[10px] text-oj-fg-muted p-1 text-center border-t border-oj-border mt-1">Showing 50 of {filteredProblems.length}</div>}
                   </div>
                 </>
               ) : (
                 <>
                   {assignedProblems.length > 0 ? (
                     <div className="flex-1 overflow-y-auto pr-2">
                       <ul className="space-y-2">
                         {assignedProblems.map(p => (
                           <li key={p.problem_id} className="bg-oj-surface2 p-2 rounded border border-oj-border text-sm text-oj-fg flex justify-between items-center">
                             <span className="truncate pr-2">{p.title}</span>
                             <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider font-mono ${p.difficulty === 'easy' ? 'bg-green-900/50 text-green-300' : p.difficulty === 'medium' ? 'bg-yellow-900/50 text-yellow-300' : 'bg-red-900/50 text-red-300'}`}>
                               {p.difficulty}
                             </span>
                           </li>
                         ))}
                       </ul>
                     </div>
                   ) : (
                     <p className="text-sm text-oj-fg-muted italic bg-oj-surface2 p-3 rounded border border-oj-border text-center">No problems assigned.</p>
                   )}
                 </>
               )}
             </div>

             {/* Candidates Section */}
             <div className="flex flex-col h-[280px]">
               <div className="flex items-end justify-between mb-2">
                 <span className="text-xs font-semibold text-oj-fg uppercase tracking-wider">
                   {isEditing ? 'Assign Candidates' : 'Assigned Candidates'}
                   <span className="text-oj-accent ml-1 text-[10px]">
                      ({isEditing ? editCandidates.length : assignedCandidates.length})
                   </span>
                 </span>
                 {isEditing && (
                   <div className="flex gap-2">
                     <button onClick={handleSelectAllCandidates} className="text-[10px] text-oj-accent hover:underline">Select All</button>
                     <span className="text-oj-border text-[10px]">|</span>
                     <button onClick={handleDeselectAllCandidates} className="text-[10px] text-oj-fg-muted hover:underline">Clear</button>
                   </div>
                 )}
               </div>
               
               {isEditing ? (
                  <>
                    <div className="mb-2 shrink-0">
                      <input 
                        type="text" 
                        placeholder="Search name or email..." 
                        value={candidateSearch}
                        onChange={e => setCandidateSearch(e.target.value)}
                        className={`${inputCls} py-1 text-xs`}
                      />
                    </div>

                    <div className="flex-1 overflow-y-auto bg-oj-bg rounded border border-oj-border p-2 space-y-1">
                      {displayCandidates.map(c => (
                        <label key={c.user_id} className="flex items-center gap-2 cursor-pointer hover:bg-oj-surface2 p-1.5 rounded transition-colors">
                          <input 
                            type="checkbox" 
                            checked={editCandidates.includes(c.user_id)}
                            onChange={() => toggleCandidate(c.user_id)}
                            className="accent-oj-accent shrink-0"
                          />
                          <div className="flex flex-col min-w-0">
                             <span className="text-sm text-oj-fg truncate font-medium">{c.name}</span>
                             <span className="text-[10px] text-oj-fg-muted font-mono truncate">{c.email}</span>
                          </div>
                        </label>
                      ))}
                      {filteredCandidates.length === 0 && <div className="text-xs text-oj-fg-muted p-2 text-center">No matching candidates found.</div>}
                      {filteredCandidates.length > 50 && <div className="text-[10px] text-oj-fg-muted p-1 text-center border-t border-oj-border mt-1">Showing 50 of {filteredCandidates.length}</div>}
                    </div>
                  </>
               ) : (
                 <>
                   {assignedCandidates.length > 0 ? (
                      <div className="flex-1 overflow-y-auto pr-2">
                        <ul className="space-y-2">
                        {assignedCandidates.map(c => (
                          <li key={c.user_id} className="bg-oj-surface2 p-2 rounded border border-oj-border text-sm flex flex-col min-w-0">
                            <span className="text-oj-fg font-medium truncate">{c.name}</span>
                            <span className="text-oj-fg-muted text-[10px] font-mono truncate">{c.email}</span>
                          </li>
                        ))}
                      </ul>
                     </div>
                   ) : (
                     <p className="text-sm text-oj-fg-muted italic bg-oj-surface2 p-3 rounded border border-oj-border text-center">
                       No candidates assigned.
                     </p>
                   )}
                 </>
               )}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}