/**
 * Browser preview only (`npm run web-preview`), used to check screens against a local stack. It is never part of a phone build:
 * phones use the keychain or keystore version in secureSessionStorage.ts. Cleared when the tab closes.
 */
export const secureSessionStorage = {
  getItem: (key: string): Promise<string | null> => Promise.resolve(window.sessionStorage.getItem(key)),
  setItem: (key: string, value: string): Promise<void> => {
    window.sessionStorage.setItem(key, value)
    return Promise.resolve()
  },
  removeItem: (key: string): Promise<void> => {
    window.sessionStorage.removeItem(key)
    return Promise.resolve()
  },
}
