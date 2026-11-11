/** "Good morning, Bea" in Manila time; without a name, just the greeting. */
export function greeting(fullName: string | undefined, now: Date = new Date()): string {
  const hour = (now.getUTCHours() + 8) % 24
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const firstName = fullName?.trim().split(/\s+/)[0] ?? ''
  return firstName === '' ? part : `${part}, ${firstName}`
}
