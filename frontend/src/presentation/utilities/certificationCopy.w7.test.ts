import { describe, expect, it } from 'vitest'
import { parseValidityMonthsInput, validityMonthsSchema } from '../../application/validation/certificationSchemas'
import { toUserFacingErrorMessage } from '../../infrastructure/supabase/supabaseErrorMessages'
import { buildMyCertification, testCurrentInstant } from '../../test/certificationFixtures'
import { certificationCopyConstants } from './certificationCopy'
import { describeCertificationStatus, statusChangeCopy } from './certificationDisplay'
import { certificationRequiredApplyBlockedText } from './certificationCopy'

const w7DatabaseMessages: readonly [string, string][] = [
  ['42501', 'Only the shop owner can issue certifications.'],
  ['42501', 'Certification not found.'],
  ['42501', 'Review request not found.'],
  ['42501', 'This certification status change is not allowed.'],
  ['23514', 'Only a verified shop can issue certifications.'],
  ['23514', 'Only a verified shop can reinstate certifications.'],
  ['23514', 'Confirm the certification statement before issuing.'],
  ['23514', 'This training is not completed. A certification needs at least 3 attended training days and a passed assessment.'],
  ['23514', 'Validity must be 1 to 36 months.'],
  ['23514', 'This certification cannot be renewed.'],
  ['23514', 'Re-assessment opens 60 days before expiry and closes 90 days after it.'],
  ['23514', 'A pass needs every checklist item met.'],
  ['23514', 'Give a reason for the fail of 10 to 300 characters.'],
  ['23514', 'Record a passed re-assessment first.'],
  ['23514', 'The training record no longer shows completion.'],
  ['23514', 'Give a reason of 20 to 500 characters.'],
  ['23514', 'Only a suspended or revoked certification can be reviewed.'],
  ['23514', 'The review period for this decision has ended.'],
  ['23514', 'A certification can be reviewed at most 3 times.'],
  ['23514', 'Write a statement of 20 to 1000 characters.'],
  ['23514', 'This review request is no longer open.'],
  ['23514', 'This certification is no longer suspended or revoked.'],
  ['23514', 'This opening needs a current shop-issued certification recorded on WashLink.'],
  ['23505', 'A certification was already issued for this training.'],
  ['23505', 'This worker already holds a current certification from this program.'],
  ['23505', 'A review request is already open for this certification.'],
  ['55000', 'The training record changed. Review it again.'],
  ['55000', 'This certification changed. Refresh and try again.'],
  ['22023', 'Mark every checklist item as met or not met.'],
  ['22023', 'Choose passed or failed.'],
  ['22023', 'Choose reinstate or uphold.'],
]

describe('Certification copy and display (W7)', () => {
  it('w7_certification_copy_says_shop_issued_never_government_recognized', () => {
    const everyCopy = [
      ...certificationCopyConstants,
      certificationRequiredApplyBlockedText,
      ...Object.values(statusChangeCopy).flatMap((copy) => [copy.title, copy.message, copy.successMessage]),
    ]
    for (const copyText of everyCopy) {
      for (const governmentMention of copyText.matchAll(/government/gi)) {
        const precedingText = copyText.slice(0, governmentMention.index).toLowerCase()
        expect(precedingText.endsWith('not a ')).toBe(true)
      }
      expect(copyText).not.toMatch(/TESDA|accredit|licensed|compliant|government-issued/i)
    }
    expect(certificationCopyConstants.some((copyText) => copyText.includes('Shop-issued'))).toBe(true)
  })

  it('w7_expired_and_expiring_labels_from_server_status', () => {
    const labelOf = (overrides: Parameters<typeof buildMyCertification>[0]): string =>
      describeCertificationStatus(buildMyCertification(overrides), testCurrentInstant).displayLabel
    expect(labelOf({})).toBe('Active')
    expect(labelOf({ expiresAt: '2026-11-10T00:00:00Z' })).toBe('Expires soon')
    // Expired comes from the server effective status, never from an app-side date check.
    expect(labelOf({ expiresAt: '2026-10-01T00:00:00Z', effectiveStatus: 'expired' })).toBe('Expired')
    expect(labelOf({ status: 'suspended', effectiveStatus: 'suspended', expiresAt: '2026-11-10T00:00:00Z' })).toBe('Suspended')
    expect(labelOf({ status: 'revoked', effectiveStatus: 'revoked' })).toBe('Revoked')
    expect(labelOf({ status: 'superseded', effectiveStatus: 'superseded' })).toBe('Renewed')
  })

  it('w7_shop_validity_setting_validates_1_to_36', () => {
    expect(parseValidityMonthsInput('1')).toBe(1)
    expect(parseValidityMonthsInput(' 36 ')).toBe(36)
    expect(parseValidityMonthsInput('0')).toBeNull()
    expect(parseValidityMonthsInput('37')).toBeNull()
    expect(parseValidityMonthsInput('12.5')).toBeNull()
    expect(parseValidityMonthsInput('')).toBeNull()
    expect(validityMonthsSchema.safeParse(2.5).success).toBe(false)
  })

  it('w7_certification_error_messages_mapped', () => {
    for (const [errorCode, databaseMessage] of w7DatabaseMessages) {
      expect(toUserFacingErrorMessage({ code: errorCode, message: databaseMessage }, 'fallback')).toBe(databaseMessage)
    }
    // Raw SQL text is never passed through.
    expect(toUserFacingErrorMessage({ code: '55000', message: 'lock not available on relation certifications' }, 'Try again.')).toBe(
      'Try again.',
    )
  })
})
