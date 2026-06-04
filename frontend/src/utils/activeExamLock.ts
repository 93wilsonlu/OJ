export interface ActiveExamLock {
  examId: string
  path: string
}

const STORAGE_KEY = 'active-exam-lock'
export const ACTIVE_EXAM_LOCK_EVENT = 'active-exam-lock-change'

function notifyLockChanged() {
  window.dispatchEvent(new Event(ACTIVE_EXAM_LOCK_EVENT))
}

export function getActiveExamLock(): ActiveExamLock | null {
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<ActiveExamLock>
    if (!parsed.examId || !parsed.path) return null
    return { examId: parsed.examId, path: parsed.path }
  } catch {
    return null
  }
}

export function setActiveExamLock(lock: ActiveExamLock) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(lock))
  notifyLockChanged()
}

export function clearActiveExamLock(examId?: string) {
  const current = getActiveExamLock()
  if (examId && current?.examId !== examId) return
  sessionStorage.removeItem(STORAGE_KEY)
  notifyLockChanged()
}
