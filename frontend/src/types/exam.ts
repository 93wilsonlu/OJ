export interface Exam {
  exam_id: string
  title: string
  description: string | null
  start_time: string
  end_time: string
  show_score: boolean
  anti_cheat_enabled: boolean
  test_time_minutes: number | null
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
  anti_cheat_enabled: boolean
  test_time_minutes?: number | null
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

export interface ExamAttempt {
  attempt_id: string
  exam_id: string
  candidate_id: string
  started_at: string
  deadline_at: string
  ended_at: string | null
  status: 'in_progress' | 'ended' | 'force_ended'
  fullscreen_exit_started_at: string | null
  force_end_at: string | null
  created_at: string
  updated_at: string
}

export interface ExamAccess {
  exam_id: string
  status_label: string
  can_view_exam: boolean
  can_view_problems: boolean
  can_start: boolean
  can_solve: boolean
  can_submit: boolean
  can_edit_submission: boolean
  can_view_submissions: boolean
  requires_fullscreen: boolean
  attempt_started_at: string | null
  attempt_deadline_at: string | null
  attempt_ended_at: string | null
}
