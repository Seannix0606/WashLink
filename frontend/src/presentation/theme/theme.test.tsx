import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_STORAGE_KEY, parseThemePreference, resolveTheme, themeBarColor } from '../../application/theme/themePreference'
import { readStoredValue, writeStoredValue } from '../../infrastructure/storage/safeStorage'
import { ThemeProvider } from './ThemeContext'
import { ThemeSwitch } from './ThemeSwitch'

// A controllable prefers-color-scheme, since jsdom has no matchMedia.
interface FakeMediaQuery {
  readonly matches: boolean
  readonly media: string
  readonly addEventListener: (type: string, listener: (event: MediaQueryListEvent) => void) => void
  readonly removeEventListener: (type: string, listener: (event: MediaQueryListEvent) => void) => void
}
let isDark = false
let listeners: ((event: MediaQueryListEvent) => void)[] = []
function setDeviceDark(next: boolean): void {
  isDark = next
  listeners.forEach((listener) => { listener({ matches: next } as MediaQueryListEvent) })
}

beforeEach(() => {
  isDark = false
  listeners = []
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.head.innerHTML = '<meta name="theme-color" content="#0F766E" />'
  vi.stubGlobal('matchMedia', (query: string): FakeMediaQuery => ({
    get matches(): boolean { return query.includes('dark') && isDark },
    media: query,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void): void => { listeners.push(listener) },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void): void => { listeners = listeners.filter((item) => item !== listener) },
  }))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('theme preference rules', () => {
  it('treats anything unknown as Auto, and Auto follows the device', () => {
    expect(parseThemePreference(null)).toBe('auto')
    expect(parseThemePreference('purple')).toBe('auto')
    expect(parseThemePreference('dark')).toBe('dark')
    expect(resolveTheme('auto', true)).toBe('dark')
    expect(resolveTheme('auto', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('keeps the pre-paint script in step with the app', () => {
    const script = readFileSync('public/theme-init.js', 'utf8')
    expect(script).toContain(`'${THEME_STORAGE_KEY}'`)
    expect(script).toContain(themeBarColor.dark)
    expect(script).toContain(themeBarColor.light)
    expect(readFileSync('index.html', 'utf8')).toMatch(/<script src="\/theme-init\.js"><\/script>[\s\S]*<\/head>/)
  })

  it('defines every color token again for the dark theme', () => {
    const css = readFileSync('src/index.css', 'utf8')
    const light = css.slice(css.indexOf('@theme'), css.indexOf('}', css.indexOf('@theme')))
    const dark = css.slice(css.indexOf(":root[data-theme='dark']"))
    const themed = [...light.matchAll(/(--color-(?:brand|surface|ink|success|warning|danger|info|card)[\w-]*):/g)].map((match) => match[1])
      // Solid button fills (*-solid) deliberately stay the same in both themes.
      .filter((token) => !token.includes('-solid'))
    expect(themed.length).toBeGreaterThan(30)
    for (const token of themed) {
      expect(dark, token).toContain(`${token}:`)
    }
  })
})

describe('safe storage', () => {
  it('returns null and keeps going when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(readStoredValue('x')).toBeNull()
    expect(() => { writeStoredValue('x', 'y') }).not.toThrow()
    vi.restoreAllMocks()
  })
})

describe('ThemeProvider and ThemeSwitch', () => {
  it('starts on Auto, follows the device live, and sets the page and browser bar colors', () => {
    render(<ThemeProvider><ThemeSwitch /></ThemeProvider>)
    expect(screen.getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true')
    expect(document.documentElement.dataset.theme).toBe('light')
    act(() => { setDeviceDark(true) })
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', themeBarColor.dark)
  })

  it('remembers a chosen theme on the device and ignores the device setting', async () => {
    render(<ThemeProvider><ThemeSwitch /></ThemeProvider>)
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    act(() => { setDeviceDark(false) })
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('reads the stored choice on start', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light')
    isDark = true
    render(<ThemeProvider><ThemeSwitch /></ThemeProvider>)
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('moves between options with the arrow keys, with only the chosen one reachable by Tab', async () => {
    render(<ThemeProvider><ThemeSwitch /></ThemeProvider>)
    const auto = screen.getByRole('radio', { name: 'Auto' })
    expect(auto).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('tabindex', '-1')
    auto.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true')
  })
})
