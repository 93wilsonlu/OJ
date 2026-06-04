import { useCallback, useEffect, useRef, useState } from 'react'
import { getErrorMessage } from '../api/errors'
import { apiFullscreenExit, apiFullscreenReturn } from '../api/exams'

const WARNING_SECONDS = 5

function isCompliant() {
  return Boolean(document.fullscreenElement)
    && document.visibilityState === 'visible'
    && document.hasFocus()
}

function violatingEventType() {
  if (!document.fullscreenElement) return 'fullscreen_lost'
  if (document.visibilityState !== 'visible') return 'tab_hidden'
  if (!document.hasFocus()) return 'window_blur'
  return 'policy_violation'
}

export function useExamProctoring(
  examId: string | undefined,
  getAccessToken: () => Promise<string | null>,
  enabled: boolean,
) {
  const [started, setStarted] = useState(!enabled)
  const [violating, setViolating] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState(WARNING_SECONDS)
  const [forceEnded, setForceEnded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const warningStartedAtRef = useRef<number | null>(null)
  const lastViolatingRef = useRef(false)
  const forceEndReportedRef = useRef(false)

  useEffect(() => {
    setStarted(!enabled || Boolean(document.fullscreenElement))
    setViolating(false)
    setRemainingSeconds(WARNING_SECONDS)
    warningStartedAtRef.current = null
    lastViolatingRef.current = false
    forceEndReportedRef.current = false
  }, [enabled, examId])

  const reportExit = useCallback(async () => {
    if (!examId || !enabled) return
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Session expired. Please sign in again.')
      const attempt = await apiFullscreenExit(token, examId)
      setForceEnded(attempt.status === 'force_ended')
      setError(null)
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to report fullscreen exit'))
    }
  }, [enabled, examId, getAccessToken])

  const reportReturn = useCallback(async () => {
    if (!examId || !enabled) return
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Session expired. Please sign in again.')
      const attempt = await apiFullscreenReturn(token, examId)
      setForceEnded(attempt.status === 'force_ended')
      setError(null)
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to report fullscreen return'))
    }
  }, [enabled, examId, getAccessToken])

  const evaluateCompliance = useCallback(() => {
    if (!enabled || forceEnded) return
    const nextViolating = !isCompliant()
    setViolating(nextViolating)

    if (nextViolating && !lastViolatingRef.current) {
      warningStartedAtRef.current = Date.now()
      forceEndReportedRef.current = false
      setRemainingSeconds(WARNING_SECONDS)
      void reportExit()
    }

    if (!nextViolating && lastViolatingRef.current) {
      warningStartedAtRef.current = null
      forceEndReportedRef.current = false
      setRemainingSeconds(WARNING_SECONDS)
      void reportReturn()
    }

    lastViolatingRef.current = nextViolating
  }, [enabled, forceEnded, reportExit, reportReturn])

  useEffect(() => {
    if (!enabled || forceEnded) return

    const onFullscreenChange = () => {
      setStarted(Boolean(document.fullscreenElement))
      evaluateCompliance()
    }
    const onVisibilityChange = () => evaluateCompliance()
    const onBlur = () => evaluateCompliance()
    const onFocus = () => evaluateCompliance()

    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)

    evaluateCompliance()

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [enabled, evaluateCompliance, forceEnded])

  useEffect(() => {
    if (!enabled || forceEnded) return

    const timer = window.setInterval(() => {
      if (!lastViolatingRef.current || warningStartedAtRef.current === null) return
      const elapsedMs = Date.now() - warningStartedAtRef.current
      const nextRemaining = Math.max(0, WARNING_SECONDS - Math.floor(elapsedMs / 1000))
      setRemainingSeconds(nextRemaining)

      if (elapsedMs >= WARNING_SECONDS * 1000 && !forceEndReportedRef.current) {
        forceEndReportedRef.current = true
        void reportReturn()
      }
    }, 250)

    return () => window.clearInterval(timer)
  }, [enabled, forceEnded, reportReturn])

  const enterFullscreen = useCallback(async () => {
    if (!enabled) return
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      }
      setStarted(true)
      setViolating(false)
      warningStartedAtRef.current = null
      lastViolatingRef.current = false
      forceEndReportedRef.current = false
      setRemainingSeconds(WARNING_SECONDS)
      await reportReturn()
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to enter fullscreen mode'))
    }
  }, [enabled, reportReturn])

  return {
    started,
    violating,
    remainingSeconds,
    locked: forceEnded,
    forceEnded,
    error,
    enterFullscreen,
    eventType: violating ? violatingEventType() : null,
  }
}
