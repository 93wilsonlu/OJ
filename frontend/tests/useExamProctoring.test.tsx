import { renderHook, act } from '@testing-library/react'
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'
import { useExamProctoring } from '../src/hooks/useExamProctoring'

describe('useExamProctoring hook', () => {
  let mockFetch: any

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useFakeTimers()

    // Mock global fetch
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'in_progress' }),
    } as Response)
    vi.stubGlobal('fetch', mockFetch)

    // Mock document attributes
    Object.defineProperty(document, 'fullscreenElement', {
      writable: true,
      configurable: true,
      value: null
    })
    Object.defineProperty(document, 'visibilityState', {
      writable: true,
      configurable: true,
      value: 'visible'
    })
    document.hasFocus = () => true
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('hook behaves correctly when disabled', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('token')
    const { result } = renderHook(() => useExamProctoring('exam-id', getAccessToken, false))

    expect(result.current.started).toBe(true)
    expect(result.current.violating).toBe(false)
  })

  test('hook detects violation when enabled and blur occurs', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('token')
    
    // We mock fullscreenElement as non-null initially so it mounts without immediate violation
    Object.defineProperty(document, 'fullscreenElement', {
      writable: true,
      configurable: true,
      value: {} // not null -> compliant
    })

    const { result } = renderHook(() => useExamProctoring('exam-id', getAccessToken, true))

    expect(result.current.violating).toBe(false)

    // Now make it violating (fullscreen lost)
    await act(async () => {
      Object.defineProperty(document, 'fullscreenElement', {
        writable: true,
        configurable: true,
        value: null
      })
      const event = new Event('fullscreenchange')
      document.dispatchEvent(event)
    })

    expect(result.current.violating).toBe(true)
    expect(result.current.eventType).toBe('fullscreen_lost')

    // Expect apiFullscreenExit to have been called via fetch
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/exams/exam-id/fullscreen-exit', expect.any(Object))

    // Advance timers to trigger warning countdown
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current.remainingSeconds).toBe(1)

    // Advance timers past WARNING_SECONDS (3s)
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current.remainingSeconds).toBe(0)
    
    // After countdown finishes it reports fullscreen return
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/exams/exam-id/fullscreen-return', expect.any(Object))
  })

  test('enterFullscreen throws error', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('token')
    const { result } = renderHook(() => useExamProctoring('exam-id', getAccessToken, true))

    // Wait for initial mount and reportExit to settle
    await act(async () => {})

    // Mock document.documentElement.requestFullscreen to reject
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      writable: true,
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error('Fullscreen denied'))
    })

    await act(async () => {
      await result.current.enterFullscreen()
    })

    expect(result.current.error).toBe('Fullscreen denied')

    // Clean up
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      writable: true,
      configurable: true,
      value: undefined
    })
  })
})
