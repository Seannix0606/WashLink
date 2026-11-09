/**
 * localStorage that never throws. Private windows, blocked site data and some embedded browsers make every access
 * throw, so callers get null or a silent no-op and the app behaves as if nothing was stored.
 * Only for per-device conveniences (theme, a remembered view). Never for anything that must persist reliably.
 */
export function readStoredValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStoredValue(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage unavailable: the choice lasts until the page closes.
  }
}
