import type { ReactElement, ReactNode } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  THEME_STORAGE_KEY,
  applyTheme,
  parseThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '../../application/theme/themePreference'
import { readStoredValue, writeStoredValue } from '../../infrastructure/storage/safeStorage'

interface ThemeContextValue {
  readonly preference: ThemePreference
  readonly resolvedTheme: ResolvedTheme
  readonly setPreference: (next: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const darkQuery = '(prefers-color-scheme: dark)'
function devicePrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(darkQuery).matches
}

/** Owns the Light / Dark / Auto choice for this device. public/theme-init.js already applied it before paint. */
export function ThemeProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => parseThemePreference(readStoredValue(THEME_STORAGE_KEY)))
  const [isDevicePreferringDark, setIsDevicePreferringDark] = useState<boolean>(devicePrefersDark)
  const resolvedTheme = resolveTheme(preference, isDevicePreferringDark)

  // Auto follows the device live, for example when the phone switches to dark mode at sunset.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return undefined
    }
    const query = window.matchMedia(darkQuery)
    const onChange = (event: MediaQueryListEvent): void => { setIsDevicePreferringDark(event.matches) }
    query.addEventListener('change', onChange)
    return (): void => { query.removeEventListener('change', onChange) }
  }, [])

  useEffect(() => {
    applyTheme(document.documentElement, resolvedTheme)
  }, [resolvedTheme])

  const setPreference = useCallback((next: ThemePreference): void => {
    writeStoredValue(THEME_STORAGE_KEY, next)
    setPreferenceState(next)
  }, [])

  const value = useMemo(() => ({ preference, resolvedTheme, setPreference }), [preference, resolvedTheme, setPreference])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/** Outside a ThemeProvider (isolated component tests) this reports light and ignores changes. */
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext) ?? { preference: 'light', resolvedTheme: 'light', setPreference: (): void => undefined }
}
