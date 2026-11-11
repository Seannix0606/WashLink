/** "10:00 AM", "8:00 PM"; the end of the day (24:00) is "12:00 AM", which only the To list offers. */
export function hourLabel(hour: number): string {
  if (hour === 24) return '12:00 AM'
  const suffix = hour < 12 ? 'AM' : 'PM'
  return `${String(hour % 12 === 0 ? 12 : hour % 12)}:00 ${suffix}`
}
