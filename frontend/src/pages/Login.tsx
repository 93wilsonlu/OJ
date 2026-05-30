import type { FormEvent } from 'react'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { accessToken, login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (accessToken) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch {
      setError('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-oj-bg text-oj-fg">
      <div
        className="pointer-events-none fixed inset-0 opacity-70"
        style={{
          backgroundImage:
            'linear-gradient(90deg, rgba(215,219,224,0.42) 1px, transparent 1px), linear-gradient(rgba(215,219,224,0.42) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
        aria-hidden
      />

      <div className="relative grid min-h-dvh lg:grid-cols-[1fr_460px]">
        <section className="flex items-center px-6 py-12 sm:px-10 lg:px-16">
          <div className="max-w-2xl">
            <img src="/tsmc-logo.webp" alt="TSMC" className="mb-10 h-12 w-auto" />
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-oj-accent">
              Engineering Assessment Platform
            </p>
            <h1 className="text-4xl font-semibold tracking-normal text-oj-fg sm:text-5xl">
              Online Judge
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-oj-fg-muted">
              Secure coding exams, submissions, and judging workflows for technical interviews.
            </p>

            <div className="mt-10 grid max-w-xl gap-3 sm:grid-cols-3">
              <div className="border-l-2 border-oj-accent bg-white/70 px-4 py-3 shadow-sm">
                <div className="text-xs font-medium uppercase tracking-wide text-oj-fg-muted">Access</div>
                <div className="mt-1 text-sm font-semibold text-oj-fg">Role based</div>
              </div>
              <div className="border-l-2 border-oj-accent bg-white/70 px-4 py-3 shadow-sm">
                <div className="text-xs font-medium uppercase tracking-wide text-oj-fg-muted">Judge</div>
                <div className="mt-1 text-sm font-semibold text-oj-fg">Automated</div>
              </div>
              <div className="border-l-2 border-oj-accent bg-white/70 px-4 py-3 shadow-sm">
                <div className="text-xs font-medium uppercase tracking-wide text-oj-fg-muted">Status</div>
                <div className="mt-1 text-sm font-semibold text-oj-fg">Real time</div>
              </div>
            </div>
          </div>
        </section>

        <aside className="flex items-center border-t border-oj-border bg-white px-6 py-10 shadow-xl shadow-slate-200/70 sm:px-10 lg:border-l lg:border-t-0">
          <div className="w-full">
            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-oj-fg">Sign in</h2>
              <p className="mt-2 text-sm text-oj-fg-muted">Use your assigned Online Judge account.</p>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-4">
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-oj-fg">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={`input ${error ? 'input-error' : ''}`}
                  placeholder="you@example.com"
                />
              </div>

              <div className="mb-5">
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-oj-fg">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className={`input pr-12 ${error ? 'input-error' : ''}`}
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-oj-fg-muted transition-colors hover:bg-oj-surface2 hover:text-oj-fg"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700"
                >
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <p className="mt-6 text-xs leading-5 text-oj-fg-muted">
              Contact your interviewer or system administrator if your account cannot access this system.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
