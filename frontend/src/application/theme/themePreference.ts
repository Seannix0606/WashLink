/**
 * Light, dark or follow the device. The same rules run before the first paint in public/theme-init.js (a plain
 * script, because the site's Content-Security-Policy only allows script files from the site itself). Keep the two
 * in step: the storage key, the values and the theme-color colors.
 */
export type ThemePreference = 'light' | 'dark' | 'auto'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'washlink.theme'

/** The browser bar color: brand teal in light, the dark page color in dark. */
export const themeBarColor: Readonly<Record<ResolvedTheme, string>> = { light: '#0F766E', dark: '#0A1315' }

export function parseThemePreference(value: string | null): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto'
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'auto') {
    return prefersDark ? 'dark' : 'light'
  }
  return preference
}

export function applyTheme(documentElement: HTMLElement, theme: ResolvedTheme): void {
  documentElement.dataset.theme = theme
  documentElement.ownerDocument.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeBarColor[theme])
}
