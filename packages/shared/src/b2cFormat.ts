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
