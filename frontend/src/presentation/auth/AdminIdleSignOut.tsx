import type { ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ADMIN_IDLE_LIMIT_MS,
  ADMIN_IDLE_WARNING_MS,
  markActive,
  msUntilIdleSignOut,
  readLastActive,
} from '../../application/session/adminIdleSession'
import { Button, Modal } from '../design/ui'
import { useAuthenticatedUser } from './AuthenticatedUserContext'

const CHECK_EVERY_MS = 1000
/** Activity is written at most this often, so scrolling doesn't write storage on every frame. */
const ACTIVITY_WRITE_EVERY_MS = 10 * 1000
const activityEvents = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const
const limitMinutes = Math.round(ADMIN_IDLE_LIMIT_MS / 60000)

/**
 * Signs the admin out after 30 minutes without use, in any tab. Reopening the site after that also signs out.
 * One minute before, a dialog offers "Stay signed in". Rendered only on the admin page.
 */
export function AdminIdleSignOut(): ReactElement | null {
  const { signOut } = useAuthenticatedUser()
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const lastWrite = useRef(0)
  const isSigningOut = useRef(false)

  const signOutForIdle = useCallback(async (): Promise<void> => {
    if (isSigningOut.current) return
    isSigningOut.current = true
    try {
      await signOut()
      toast.info(`You were signed out after ${String(limitMinutes)} minutes without use. Sign in again to continue.`, { duration: 15000 })
    } catch {
      isSigningOut.current = false
    }
  }, [signOut])

  const check = useCallback((): void => {
    const lastActive = readLastActive()
    if (lastActive === null) {
      // A session from before this rule, or storage was cleared: count from now.
      markActive()
      return
    }
    const remaining = msUntilIdleSignOut(lastActive)
    if (remaining <= 0) {
      void signOutForIdle()
      return
    }
    setSecondsLeft(remaining <= ADMIN_IDLE_WARNING_MS ? Math.ceil(remaining / 1000) : null)
  }, [signOutForIdle])

  useEffect(() => {
    // Checked on the next tick too, so reopening the site after the limit signs out before anything else happens.
    const firstCheck = window.setTimeout(check, 0)
    const timer = window.setInterval(check, CHECK_EVERY_MS)
    const onActivity = (): void => {
      const now = Date.now()
      if (now - lastWrite.current < ACTIVITY_WRITE_EVERY_MS) return
      const lastActive = readLastActive()
      // Activity after the limit doesn't revive the session; the next check signs out.
      if (lastActive !== null && msUntilIdleSignOut(lastActive, now) <= 0) return
      lastWrite.current = now
      markActive(now)
    }
    const onVisible = (): void => { if (document.visibilityState === 'visible') check() }
    for (const eventName of activityEvents) window.addEventListener(eventName, onActivity, { passive: true, capture: true })
    document.addEventListener('visibilitychange', onVisible)
    return (): void => {
      window.clearTimeout(firstCheck)
      window.clearInterval(timer)
      for (const eventName of activityEvents) window.removeEventListener(eventName, onActivity, { capture: true })
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [check])

  const staySignedIn = (): void => {
    lastWrite.current = Date.now()
    markActive(lastWrite.current)
    setSecondsLeft(null)
  }

  return (
    <Modal isOpen={secondsLeft !== null} onClose={staySignedIn} title="Are you still there?"
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={(): void => void signOutForIdle()}>Sign out now</Button>
          <Button onClick={staySignedIn}>Stay signed in</Button>
        </div>
      )}>
      <p className="text-sm text-[var(--color-ink-700)]" role="timer" aria-live="off">
        For safety, admin accounts are signed out after {limitMinutes} minutes without use. You&apos;ll be signed out in{' '}
        <strong className="tabular-nums text-[var(--color-ink-900)]">{secondsLeft ?? 0} seconds</strong>.
      </p>
    </Modal>
  )
}
