export type SubmissionStatus = 'pending' | 'judging' | 'completed' | 'failed'

export interface Submission {
  submission_id: string
  exam_id: string
  problem_id: string
  candidate_id: string
  language: string
  status: SubmissionStatus
  submitted_at: string
}

export interface JudgeResult {
  result_id: string
  submission_id: string
  verdict: string
  score: number | null
  passed_count: number | null
  total_count: number
  execution_time: number | null
  memory_usage: number | null
  error_message: string | null
  judged_at: string
}

export interface SubmissionDetail extends Submission {
  judge_result: JudgeResult | null
}

export interface SubmissionListItem extends SubmissionDetail {
  problem_title: string
  candidate_name: string
  candidate_email: string
}
