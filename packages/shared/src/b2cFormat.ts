/** Date and link helpers for B2C screens. Platform-neutral. */
/** Directions to the assigned job, opened in the phone's or browser's own maps app. */
export function directionsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${String(latitude)},${String(longitude)}`
}

/** Today in Manila as YYYY-MM-DD plus the next days, for the date picker. */
export function upcomingManilaDates(count: number, now: Date = new Date()): readonly string[] {
  const manila = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth(), manila.getUTCDate() + index))
    return day.toISOString().slice(0, 10)
  })
}

export function formatManilaDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export function formatManilaTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })
}

/**
 * A booked time and when the wash should be done: "Fri, Nov 14, 10:00 AM – about 11:45 AM". The booked time is when
 * the washer arrives and starts; the end is that plus the wash length, "about" because a job can run over.
 */
export function formatManilaVisit(startIso: string, durationMinutes: number): string {
  // Without a usable wash length, show the start time alone rather than a wrong or broken end time.
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return formatManilaDateTime(startIso)
  }
  const end = new Date(Date.parse(startIso) + durationMinutes * 60_000).toISOString()
  return `${formatManilaDateTime(startIso)} – about ${formatManilaTime(end)}`
}

/* ---- Month calendar (Asia/Manila is UTC+8 all year, with no daylight saving) ---- */

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000

/** A calendar month in Manila; `month` is 1–12. */
export interface ManilaMonth {
  readonly year: number
  readonly month: number
}

export interface ManilaCalendarDay {
  /** YYYY-MM-DD in Manila. */
  readonly dayKey: string
  readonly dayOfMonth: number
  /** False for the leading and trailing days from the months around it. */
  readonly isInMonth: boolean
}

/** The Manila calendar day (YYYY-MM-DD) of an instant. */
export function manilaDayKey(iso: string): string {
  return new Date(Date.parse(iso) + MANILA_OFFSET_MS).toISOString().slice(0, 10)
}

export function manilaMonthOf(dayKey: string): ManilaMonth {
  return { year: Number(dayKey.slice(0, 4)), month: Number(dayKey.slice(5, 7)) }
}

export function shiftManilaMonth(month: ManilaMonth, delta: number): ManilaMonth {
  const date = new Date(Date.UTC(month.year, month.month - 1 + delta, 1))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 }
}

/** Monday-first weeks covering the whole month, with the days before and after it filling the first and last week. */
export function manilaMonthGrid(month: ManilaMonth): readonly (readonly ManilaCalendarDay[])[] {
  const first = new Date(Date.UTC(month.year, month.month - 1, 1))
  const leading = (first.getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate()
  const weekCount = Math.ceil((leading + daysInMonth) / 7)
  return Array.from({ length: weekCount }, (_week, weekIndex) =>
    Array.from({ length: 7 }, (_day, dayIndex) => {
      const date = new Date(Date.UTC(month.year, month.month - 1, 1 - leading + weekIndex * 7 + dayIndex))
      return { dayKey: date.toISOString().slice(0, 10), dayOfMonth: date.getUTCDate(), isInMonth: date.getUTCMonth() === month.month - 1 }
    }))
}

/** "November 2026". */
export function formatManilaMonth(month: ManilaMonth): string {
  return new Date(Date.UTC(month.year, month.month - 1, 1)).toLocaleDateString('en-PH', { timeZone: 'UTC', month: 'long', year: 'numeric' })
}

/** "Tuesday, November 17" for a Manila day key. */
export function formatManilaDayKey(dayKey: string): string {
  return new Date(`${dayKey}T00:00:00Z`).toLocaleDateString('en-PH', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' })
}
