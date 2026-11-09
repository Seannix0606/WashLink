import { describe, expect, it } from 'vitest'
import { customerVehicleCategories } from '@washlink/shared'
import { addonKey } from './addonKey'

describe('catalog helpers', () => {
  it('makes add-on keys the database accepts', () => {
    expect(addonKey('Car freshener', 'ab12c')).toBe('car_freshener_ab12c')
    expect(addonKey('  Tire & rim shine! ', 'x1')).toBe('tire_rim_shine_x1')
    expect(addonKey('ÑÑ', 'x1')).toBe('addon_x1')
    expect(addonKey('a'.repeat(80), 'zzzzz')).toMatch(/^[a-z0-9_]{2,40}$/)
  })

  it('offers customers no motorcycle option', () => {
    expect(customerVehicleCategories).not.toContain('motorcycle')
    expect(customerVehicleCategories).toContain('sedan')
  })
})
