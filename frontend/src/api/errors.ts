export class ApiError extends Error {
  status: number
  detail: unknown

  constructor(status: number, message: string, detail: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

function detailToMessage(detail: unknown): string | null {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (item && typeof item === 'object' && 'msg' in item) {
          const loc = 'loc' in item && Array.isArray(item.loc)
            ? `${item.loc.join('.')}: `
            : ''
          return `${loc}${String(item.msg)}`
        }
        return null
      })
      .filter(Boolean)
    return messages.length > 0 ? messages.join('; ') : null
  }
  return null
}

function friendlyMessage(status: number, detail: unknown, fallback: string): string {
  const message = detailToMessage(detail)
  if (status === 401) return 'Session expired. Please sign in again.'
  if (status === 403) return message ?? 'Insufficient permissions for this action.'
  if (status === 422 || status === 409 || status === 429) return message ?? fallback
  return message ?? fallback
}

export async function throwOnApiError(res: Response, fallback = `HTTP ${res.status}`) {
  if (res.ok) return
  const body = await res.json().catch(() => ({}))
  const detail = body && typeof body === 'object' && 'detail' in body
    ? (body as { detail?: unknown }).detail
    : undefined
  throw new ApiError(res.status, friendlyMessage(res.status, detail, fallback), detail)
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
