import { useEffect, useRef, useState } from 'react'
import { apiGetSubmission } from '../api/submissions'
import type { SubmissionDetail } from '../types/submission'

const TERMINAL = new Set(['completed', 'failed'])

export function useSubmissionPoller(
  submissionId: string | null,
  getAccessToken: () => Promise<string | null>,
) {
  const [data, setData] = useState<SubmissionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!submissionId) return
    setData(null)
    setError(null)

    const stop = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }

    const poll = async () => {
      try {
        const token = await getAccessToken()
        if (!token) throw new Error('Session expired. Please sign in again.')
        const result = await apiGetSubmission(token, submissionId)
        setData(result)
        if (TERMINAL.has(result.status)) stop()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Polling error')
        stop()
      }
    }

    poll()
    timerRef.current = setInterval(poll, 2000)
    return stop
  }, [submissionId, getAccessToken])

  return { data, error }
}
