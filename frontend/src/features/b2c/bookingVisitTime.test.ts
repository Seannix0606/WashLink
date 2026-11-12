import { describe, expect, it } from 'vitest'
import { formatManilaVisit } from '@washlink/shared'

describe('booking visit time', () => {
  it('shows the booked arrival time and when the wash should be done, in Manila time', () => {
    // 10:00 AM Manila is 02:00 UTC; a 105-minute wash is done about 11:45 AM.
    const text = formatManilaVisit('2026-11-14T02:00:00.000Z', 105)
    expect(text).toMatch(/Nov 14/)
    expect(text).toMatch(/10:00\s?AM – about 11:45\s?AM$/i)
  })

  it('shows the start time alone when the wash length is missing', () => {
    expect(formatManilaVisit('2026-11-14T02:00:00.000Z', Number.NaN)).not.toMatch(/about/)
    expect(formatManilaVisit('2026-11-14T02:00:00.000Z', 0)).not.toMatch(/about/)
  })

  it('crosses noon and midnight correctly', () => {
    expect(formatManilaVisit('2026-11-14T03:30:00.000Z', 60)).toMatch(/11:30\s?AM – about 12:30\s?PM$/i)
    expect(formatManilaVisit('2026-11-14T15:30:00.000Z', 45)).toMatch(/11:30\s?PM – about 12:15\s?AM$/i)
  })
})
