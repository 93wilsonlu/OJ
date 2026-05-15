import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="min-h-dvh bg-oj-bg flex items-center justify-center px-4">
      <div className="text-center animate-fade-in">
        <p className="font-mono text-6xl font-bold text-oj-accent mb-2">404</p>
        <h1 className="text-xl font-semibold text-oj-fg mb-2">Page not found</h1>
        <p className="text-sm text-oj-fg-muted mb-8">
          The route you requested doesn't exist.
        </p>
        <Link to="/" className="btn-primary">
          Go home
        </Link>
      </div>
    </div>
  )
}
