import { useEffect, useRef } from 'react'

/** Workforce lists are not on Realtime (W3 decision); they are polled instead. */
export const workforcePollIntervalMilliseconds = 60_000

/**
 * Calls `refresh` every interval while the page is visible and whenever the window
 * regains focus. Does not call it on mount; the caller loads first.
 */
export function usePollWhileVisible(
  refresh: () => void,
  isEnabled: boolean,
  intervalMilliseconds: number = workforcePollIntervalMilliseconds,
): void {
  const latestRefreshRef = useRef(refresh)

  useEffect(() => {
    latestRefreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    if (!isEnabled) {
      return
    }
    const refreshNow = (): void => {
      latestRefreshRef.current()
    }
    const refreshWhenVisible = (): void => {
      if (document.visibilityState === 'visible') {
        refreshNow()
      }
    }
    const pollIntervalHandle = window.setInterval(refreshWhenVisible, intervalMilliseconds)
    window.addEventListener('focus', refreshNow)
    return (): void => {
      window.clearInterval(pollIntervalHandle)
      window.removeEventListener('focus', refreshNow)
    }
  }, [intervalMilliseconds, isEnabled])
}
