import { useEffect, useState } from 'react'

/** The time for a screen's time-based rules, ticking so an action opens without needing a reload. */
export function useCurrentTime(intervalMilliseconds = 30000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => { setNow(new Date()) }, intervalMilliseconds)
    return (): void => { clearInterval(timer) }
  }, [intervalMilliseconds])
  return now
}
