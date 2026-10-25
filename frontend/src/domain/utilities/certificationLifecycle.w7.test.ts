import { describe, expect, it } from 'vitest'
import { buildMyCertification, buildOwnerCertification, testCurrentInstant } from '../../test/certificationFixtures'
import {
  canRequestCertificationReview,
  ownerCertificationActions,
  ownerCertificationActionsForShop,
} from './certificationLifecycle'

describe('Certification lifecycle (W7, mirrors w7f)', () => {
  it('w7_review_request_offered_only_within_window', () => {
    const insideWindow = buildMyCertification({
      status: 'revoked', effectiveStatus: 'revoked', statusReason: 'Repeated unsafe chemical handling.',
      reviewWindowEndsAt: '2026-11-10T00:00:00Z',
    })
    expect(canRequestCertificationReview(insideWindow, testCurrentInstant)).toBe(true)
    expect(canRequestCertificationReview({ ...insideWindow, reviewWindowEndsAt: '2026-10-25T00:00:00Z' }, testCurrentInstant)).toBe(false)
    expect(canRequestCertificationReview({ ...insideWindow, reviewRequestsUsed: 3 }, testCurrentInstant)).toBe(false)
    expect(canRequestCertificationReview({ ...insideWindow, openReviewRequestId: 'open-1' }, testCurrentInstant)).toBe(false)
    expect(canRequestCertificationReview(buildMyCertification(), testCurrentInstant)).toBe(false)
  })

  it('w7_owner_actions_match_lifecycle', () => {
    expect(ownerCertificationActions(buildOwnerCertification(), testCurrentInstant)).toEqual(['suspend', 'revoke'])
    // Expired (stored active): revoke only, never suspend.
    expect(ownerCertificationActions(buildOwnerCertification({ effectiveStatus: 'expired' }), testCurrentInstant)).toEqual(['revoke'])
    expect(
      ownerCertificationActions(buildOwnerCertification({ status: 'suspended', effectiveStatus: 'suspended' }), testCurrentInstant),
    ).toEqual(['reinstate', 'revoke'])
    // Revoked: only through an open review; superseded: nothing.
    expect(ownerCertificationActions(buildOwnerCertification({ status: 'revoked', effectiveStatus: 'revoked' }), testCurrentInstant)).toEqual([])
    expect(
      ownerCertificationActions(
        buildOwnerCertification({ status: 'revoked', effectiveStatus: 'revoked', openReviewRequestId: 'review-1' }),
        testCurrentInstant,
      ),
    ).toEqual(['decide_review'])
    expect(
      ownerCertificationActions(buildOwnerCertification({ status: 'superseded', effectiveStatus: 'superseded' }), testCurrentInstant),
    ).toEqual([])
    // An unverified shop is not offered reinstate.
    expect(
      ownerCertificationActionsForShop(buildOwnerCertification({ status: 'suspended', effectiveStatus: 'suspended' }), false, testCurrentInstant),
    ).toEqual(['revoke'])
  })

  it('w7_renew_offered_only_in_window_after_passed_reassessment', () => {
    const inWindow = buildOwnerCertification({ isRenewalWindowOpen: true })
    expect(ownerCertificationActions(inWindow, testCurrentInstant)).toContain('record_reassessment')
    expect(ownerCertificationActions(inWindow, testCurrentInstant)).not.toContain('renew')
    const passed = { ...inWindow, latestReassessmentId: 'reassessment-1', latestReassessmentResult: 'passed' as const, latestReassessmentAssessedOn: '2026-10-20' }
    expect(ownerCertificationActions(passed, testCurrentInstant)).toContain('renew')
    expect(ownerCertificationActions({ ...passed, latestReassessmentResult: 'failed' }, testCurrentInstant)).not.toContain('renew')
    expect(ownerCertificationActions({ ...passed, isLatestReassessmentUsed: true }, testCurrentInstant)).not.toContain('renew')
    expect(ownerCertificationActions({ ...passed, latestReassessmentAssessedOn: '2026-09-01' }, testCurrentInstant)).not.toContain('renew')
    expect(ownerCertificationActions({ ...passed, isRenewalWindowOpen: false }, testCurrentInstant)).not.toContain('renew')
    expect(ownerCertificationActionsForShop(passed, false, testCurrentInstant)).not.toContain('renew')
  })
})
