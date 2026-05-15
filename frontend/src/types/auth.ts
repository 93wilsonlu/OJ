export interface UserOut {
  user_id: string
  name: string
  email: string
  role: 'admin' | 'interviewer' | 'problem_admin' | 'candidate'
}

export interface LoginResponse {
  access_token: string
  refresh_token: string
  user: UserOut
}

export interface RefreshResponse {
  access_token: string
}
