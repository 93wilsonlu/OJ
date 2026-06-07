const PATH_SEGMENT_RE = /^[A-Za-z0-9_-]+$/

export function pathSegment(value: string, name = 'path segment'): string {
  if (!PATH_SEGMENT_RE.test(value)) {
    throw new Error(`Invalid ${name}`)
  }
  return encodeURIComponent(value)
}

export async function throwOnError(res: Response): Promise<void> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`)
  }
}
