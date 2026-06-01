export function formatDate(iso: string): string {
  const date = new Date(iso)
  return `${formatDateOnly(iso)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

export function formatDateOnly(iso: string): string {
  const date = new Date(iso)
  return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`
}

export function formatScore(score: number | null | undefined): string {
  if (score == null) return '-'
  return Number.isInteger(score) ? String(score) : score.toFixed(2)
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}
