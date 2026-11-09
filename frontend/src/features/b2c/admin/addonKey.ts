/** A database key from the add-on name, with a short suffix so two add-ons with the same name never collide. */
export function addonKey(name: string, suffix: string = Date.now().toString(36).slice(-5)): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30)
  return `${base === '' ? 'addon' : base}_${suffix}`
}
