import { useSyncExternalStore } from 'react'

/** Wide enough for a right-hand summary panel beside the content (Tailwind's xl). */
export const WIDE_SCREEN_QUERY = '(min-width: 1280px)'

/**
 * Whether a media query matches, kept live as the window resizes. False where matchMedia is missing (tests, very old
 * browsers), so extras that only make sense on big screens are simply not rendered there.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return (): void => undefined
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return (): void => { list.removeEventListener('change', onChange) }
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  )
}
