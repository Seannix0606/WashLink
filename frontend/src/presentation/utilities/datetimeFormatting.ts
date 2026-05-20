export function formatScheduledDateTime(rawScheduledDateTime: string): string {
  const parsedDate = new Date(rawScheduledDateTime)
  if (Number.isNaN(parsedDate.getTime())) {
    return rawScheduledDateTime
  }
  return parsedDate.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatShortDateTime(rawDateTime: string): string {
  const parsedDate = new Date(rawDateTime)
  if (Number.isNaN(parsedDate.getTime())) {
    return rawDateTime
  }
  return parsedDate.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatRelativeTimeFromNow(rawTimestamp: string): string {
  const parsedDate = new Date(rawTimestamp)
  if (Number.isNaN(parsedDate.getTime())) {
    return 'recently'
  }
  const deltaMilliseconds = Date.now() - parsedDate.getTime()
  const deltaMinutes = Math.round(deltaMilliseconds / 60_000)
  if (deltaMinutes < 1) {
    return 'just now'
  }
  if (deltaMinutes < 60) {
    return `${deltaMinutes} min ago`
  }
  const deltaHours = Math.round(deltaMinutes / 60)
  if (deltaHours < 24) {
    return `${deltaHours} h ago`
  }
  const deltaDays = Math.round(deltaHours / 24)
  return `${deltaDays} d ago`
}
