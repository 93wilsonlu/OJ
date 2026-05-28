export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatScore(score: number | null | undefined): string {
  if (score == null) return '-'
  return Number.isInteger(score) ? String(score) : score.toFixed(2)
}
