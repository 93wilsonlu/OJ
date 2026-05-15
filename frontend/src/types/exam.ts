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
