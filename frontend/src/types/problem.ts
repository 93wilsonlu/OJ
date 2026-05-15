export type Difficulty = 'easy' | 'medium' | 'hard'

export interface Problem {
  problem_id: string
  title: string
  description: string
  input_format: string | null
  output_format: string | null
  sample_input: string | null
  sample_output: string | null
  difficulty: Difficulty
  time_limit: number   // ms
  memory_limit: number // MB
  allowed_langs: string[]
  created_by: string | null
  created_at: string
}

export interface ProblemCreate {
  title: string
  description: string
  input_format?: string
  output_format?: string
  sample_input?: string
  sample_output?: string
  difficulty: Difficulty
  time_limit: number
  memory_limit: number
  allowed_langs: string[]
}

export type ProblemUpdate = Partial<ProblemCreate>

export interface TestCase {
  testcase_id: string
  problem_id: string
  name: string | null
  is_hidden: boolean
  score_weight: number
  time_limit_override: number | null
  memory_limit_override: number | null
}
