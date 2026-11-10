import { describe, expect, it } from 'vitest'
import { formatManilaDayKey, formatManilaMonth, manilaDayKey, manilaMonthGrid, manilaMonthOf, shiftManilaMonth } from '@washlink/shared'

describe('Manila month calendar helpers', () => {
  it('puts an instant on its Manila day, across midnight', () => {
    expect(manilaDayKey('2026-11-16T15:59:00Z')).toBe('2026-11-16') // 11:59 PM in Manila
    expect(manilaDayKey('2026-11-16T16:00:00Z')).toBe('2026-11-17') // midnight in Manila
    expect(manilaDayKey('2026-12-31T16:30:00Z')).toBe('2027-01-01')
  })

  it('moves between months and years', () => {
    expect(shiftManilaMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftManilaMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
    expect(manilaMonthOf('2026-11-17')).toEqual({ year: 2026, month: 11 })
  })

  it('lays a month out in Monday-first weeks with the neighbouring days filled in', () => {
    // November 2026 starts on a Sunday and has 30 days.
    const weeks = manilaMonthGrid({ year: 2026, month: 11 })
    expect(weeks).toHaveLength(6)
    expect(weeks[0]?.map((day) => day.dayKey)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'])
    expect(weeks[0]?.[6]).toEqual({ dayKey: '2026-11-01', dayOfMonth: 1, isInMonth: true })
    expect(weeks[0]?.[0]?.isInMonth).toBe(false)
    expect(weeks.at(-1)?.at(-1)?.dayKey).toBe('2026-12-06')
    expect(weeks.flat().filter((day) => day.isInMonth)).toHaveLength(30)
    // February 2021 starts on a Monday and fills exactly four weeks.
    expect(manilaMonthGrid({ year: 2021, month: 2 })).toHaveLength(4)
  })

  it('names months and days', () => {
    expect(formatManilaMonth({ year: 2026, month: 11 })).toBe('November 2026')
    expect(formatManilaDayKey('2026-11-17')).toBe('Tuesday, November 17')
  })
})
