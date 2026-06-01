import { useCallback, useEffect, useRef, useState } from 'react'
import { getErrorMessage } from '../api/errors'
import { apiCreateProctoringEvent, apiGetCandidateExamState } from '../api/exams'

const WARNING_SECONDS = 10

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
) {
  const [started, setStarted] = useState(false)
  const [violating, setViolating] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState(WARNING_SECONDS)
  const [locked, setLocked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const warningStartedAtRef = useRef<number | null>(null)
  const lastViolatingRef = useRef(false)
  const lastTimeoutReportAtRef = useRef<number | null>(null)

  const reportEvent = useCallback(async (
    eventType: string,
    isViolation: boolean,
  ) => {
    if (!examId) return
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Session expired. Please sign in again.')
      const state = await apiCreateProctoringEvent(token, examId, {
        event_type: eventType,
        violating: isViolation,
      })
      setLocked(state.status === 'locked')
      setError(null)
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to report proctoring event'))
    }
  }, [examId, getAccessToken])

  useEffect(() => {
    if (!examId) return
    let cancelled = false

    async function loadState() {
      try {
        const token = await getAccessToken()
        if (!token) throw new Error('Session expired. Please sign in again.')
        const state = await apiGetCandidateExamState(token, examId!)
        if (!cancelled) setLocked(state.status === 'locked')
      } catch (e) {
        if (!cancelled) setError(getErrorMessage(e, 'Failed to load exam state'))
      }
    }

    loadState()
    return () => {
      cancelled = true
    }
  }, [examId, getAccessToken])

  const evaluateCompliance = useCallback((eventType?: string) => {
    if (!started || locked) return
    const nextViolating = !isCompliant()
    setViolating(nextViolating)

    if (nextViolating && !lastViolatingRef.current) {
      warningStartedAtRef.current = Date.now()
      lastTimeoutReportAtRef.current = null
      setRemainingSeconds(WARNING_SECONDS)
      void reportEvent(eventType ?? violatingEventType(), true)
    }

    if (!nextViolating && lastViolatingRef.current) {
      warningStartedAtRef.current = null
      lastTimeoutReportAtRef.current = null
      setRemainingSeconds(WARNING_SECONDS)
      void reportEvent(eventType ?? 'compliance_restored', false)
    }

    lastViolatingRef.current = nextViolating
  }, [locked, reportEvent, started])

  useEffect(() => {
    if (!started || locked) return

    const onFullscreenChange = () => {
      evaluateCompliance(document.fullscreenElement ? 'fullscreen_restored' : 'fullscreen_lost')
    }
    const onVisibilityChange = () => {
      evaluateCompliance(document.visibilityState === 'visible' ? 'tab_visible' : 'tab_hidden')
    }
    const onBlur = () => evaluateCompliance('window_blur')
    const onFocus = () => evaluateCompliance('window_focus')

    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)

    evaluateCompliance('monitor_started')

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [evaluateCompliance, locked, started])

  useEffect(() => {
    if (!started || locked) return

    const timer = window.setInterval(() => {
      if (!lastViolatingRef.current || warningStartedAtRef.current === null) return
      const elapsedMs = Date.now() - warningStartedAtRef.current
      const nextRemaining = Math.max(0, WARNING_SECONDS - Math.floor(elapsedMs / 1000))
      setRemainingSeconds(nextRemaining)

      const lastTimeoutReportAt = lastTimeoutReportAtRef.current
      if (
        elapsedMs >= WARNING_SECONDS * 1000
        && (lastTimeoutReportAt === null || Date.now() - lastTimeoutReportAt >= 1000)
      ) {
        lastTimeoutReportAtRef.current = Date.now()
        void reportEvent('warning_timeout', true)
      }
    }, 250)

    return () => window.clearInterval(timer)
  }, [locked, reportEvent, started])

  const enterFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      }
      setStarted(true)
      setViolating(false)
      warningStartedAtRef.current = null
      lastViolatingRef.current = false
      lastTimeoutReportAtRef.current = null
      setRemainingSeconds(WARNING_SECONDS)
      await reportEvent('fullscreen_restored', false)
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to enter fullscreen mode'))
    }
  }, [reportEvent])

  return {
    started,
    violating,
    remainingSeconds,
    locked,
    error,
    enterFullscreen,
  }
}
