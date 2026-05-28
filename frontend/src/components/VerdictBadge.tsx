const VERDICT_MAP: Record<string, { cls: string; label: string }> = {
  Accepted: { cls: 'badge-accepted', label: 'AC' },
  'Wrong Answer': { cls: 'badge-wrong', label: 'WA' },
  'Time Limit Exceeded': { cls: 'badge-tle', label: 'TLE' },
  'Memory Limit Exceeded': { cls: 'badge-mle', label: 'MLE' },
  'Compile Error': { cls: 'badge-ce', label: 'CE' },
  'Runtime Error': { cls: 'badge-re', label: 'RE' },
  'System Error': { cls: 'badge-system', label: 'SE' },
  pending: { cls: 'badge-pending', label: 'Pending' },
  judging: { cls: 'badge-pending', label: 'Judging' },
  completed: { cls: 'badge-pending', label: 'Completed' },
  failed: { cls: 'badge-system', label: 'Failed' },
}

interface Props {
  verdict: string
  showFull?: boolean
}

export default function VerdictBadge({ verdict, showFull = false }: Props) {
  const entry = VERDICT_MAP[verdict] ?? { cls: 'badge-pending', label: verdict }
  const isStatus = verdict === verdict.toLowerCase()
  return (
    <span className={`badge ${entry.cls}`} title={verdict}>
      {showFull ? (isStatus ? entry.label : verdict) : entry.label}
    </span>
  )
}
