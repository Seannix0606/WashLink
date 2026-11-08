import { describe, expect, it } from 'vitest'
import type { ShopVerificationStatus } from '../../domain/models/Shop'
import { describeShopVerificationStatus } from './shopVerificationDisplay'

const expectedDisplayByStatus: Record<
  ShopVerificationStatus,
  { displayLabel: string; badgeTone: string }
> = {
  pending: { displayLabel: 'Pending review', badgeTone: 'warning' },
  changes_requested: { displayLabel: 'Changes requested', badgeTone: 'warning' },
  approved: { displayLabel: 'Verified', badgeTone: 'success' },
  rejected: { displayLabel: 'Rejected', badgeTone: 'danger' },
}

describe('shop verification display (J18 verification)', () => {
  it('j18_verification_status_display_for_each_status', () => {
    for (const [verificationStatus, expectedDisplay] of Object.entries(
      expectedDisplayByStatus,
    ) as [ShopVerificationStatus, { displayLabel: string; badgeTone: string }][]) {
      const statusDisplay = describeShopVerificationStatus(verificationStatus)

      expect(statusDisplay.displayLabel).toBe(expectedDisplay.displayLabel)
      expect(statusDisplay.badgeTone).toBe(expectedDisplay.badgeTone)
      expect(statusDisplay.headlineText.length).toBeGreaterThan(0)
      expect(statusDisplay.helperText.length).toBeGreaterThan(0)
    }
  })
})
