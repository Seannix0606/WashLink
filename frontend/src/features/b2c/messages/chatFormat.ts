import { formatManilaDayKey, formatManilaTime, manilaDayKey } from '@washlink/shared'

/** For the conversation list: "2:34 PM" today, "Yesterday", else "Nov 12". */
export function chatListTime(iso: string, now: Date = new Date()): string {
  const day = manilaDayKey(iso)
  const today = manilaDayKey(now.toISOString())
  if (day === today) return formatManilaTime(iso)
  const yesterday = manilaDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
  if (day === yesterday) return 'Yesterday'
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-PH', { timeZone: 'UTC', month: 'short', day: 'numeric' })
}

/** Separator between days in a conversation: "Today", "Yesterday", or "Tuesday, November 17". */
export function chatDayLabel(dayKey: string, now: Date = new Date()): string {
  const today = manilaDayKey(now.toISOString())
  if (dayKey === today) return 'Today'
  if (dayKey === manilaDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())) return 'Yesterday'
  return formatManilaDayKey(dayKey)
}
