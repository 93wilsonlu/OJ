import { useNavigate } from 'react-router-dom'

interface Props {
  status?: number
  message?: string
}

const STATUS_COPY: Record<number, { title: string; detail: string }> = {
  403: { title: 'Access denied',       detail: 'You don\'t have permission to view this page.' },
  500: { title: 'Server error',        detail: 'Something went wrong on our end. Please try again.' },
  0:   { title: 'Network error',       detail: 'Could not reach the server. Check your connection.' },
}

export default function ErrorPage({ status = 500, message }: Props) {
  const navigate = useNavigate()
  const copy = STATUS_COPY[status] ?? STATUS_COPY[500]

  return (
    <div className="min-h-dvh bg-oj-bg flex items-center justify-center px-4">
      <div className="text-center animate-fade-in max-w-sm">
        <p className="font-mono text-5xl font-bold text-oj-warn mb-2">{status || 'ERR'}</p>
        <h1 className="text-xl font-semibold text-oj-fg mb-2">{copy.title}</h1>
        <p className="text-sm text-oj-fg-muted mb-2">{message ?? copy.detail}</p>
        <div className="flex gap-3 justify-center mt-8">
          <button onClick={() => navigate(-1)} className="btn-secondary">
            Go back
          </button>
          <button onClick={() => window.location.reload()} className="btn-primary">
            Retry
          </button>
        </div>
      </div>
    </div>
  )
}
