export interface Exam {
  exam_id: string
  title: string
  description: string | null
  start_time: string
  end_time: string
  show_score: boolean
  created_by: string | null
  created_at: string
}

export interface ExamAssignment {
  assignment_id: string
  exam_id: string
  candidate_id: string
  problem_id: string
  assigned_difficulty: string | null
  created_at: string
}

export interface ExamCreate {
  title: string
  description?: string
  start_time: string
  end_time: string
  show_score: boolean
}

export type ExamUpdate = Partial<ExamCreate>

export interface ExamProblem {
  assignment_id: string
  problem_id: string
  title: string
  description: string
  input_format: string | null
  output_format: string | null
  sample_input: string | null
  sample_output: string | null
  difficulty: string
  time_limit: number
  memory_limit: number
  allowed_langs: string[]
}

export interface ExamCandidateState {
  exam_id: string
  candidate_id: string
  status: 'active' | 'locked'
  warning_started_at: string | null
  locked_at: string | null
  lock_reason: string | null
  last_event_type: string | null
  last_seen_at: string
}

export interface ProctoringEventCreate {
  event_type: string
  violating: boolean
}
