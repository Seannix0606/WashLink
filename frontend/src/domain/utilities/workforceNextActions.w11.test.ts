import { describe, expect, it } from 'vitest'
import { defaultWorkerWorkspaceTab, workerWorkspaceTabDefinitions } from '../../features/worker/workerWorkspaceView'
import { buildAdminSummary, buildOwnerSummary, buildWorkerSummary } from '../../test/oversightFixtures'
import { adminNextActions, ownerNextActions, workerNextActions } from './workforceNextActions'

describe('W11 next actions and worker navigation', () => {
  it('w11_worker_overview_orders_next_actions_by_priority', () => {
    const summary = buildWorkerSummary({
      draftApplicationCount: 2,
      platformReviewAvailableCount: 1,
      trainingInvitationCount: 3,
      contractOfferCount: 1,
      disputeResponseNeededCount: 1,
      amendmentOfferCount: 1,
      profileMissingFields: ['skills'],
    })
    expect(workerNextActions(summary).map((nextAction) => [nextAction.key, nextAction.count, nextAction.target])).toEqual([
      ['dispute_response_needed', 1, 'contracts'],
      ['contract_offer', 1, 'contracts'],
      ['amendment_offer', 1, 'contracts'],
      ['training_invitation', 3, 'training'],
      ['platform_review_available', 1, 'certifications'],
      ['complete_profile', 1, 'profile'],
      ['draft_application', 2, 'applications'],
    ])
    // Zero counts are left out; a missing profile is one "complete your profile" action.
    expect(workerNextActions(buildWorkerSummary())).toEqual([])
    expect(workerNextActions(buildWorkerSummary({ hasWorkerProfile: false })).map((nextAction) => nextAction.key)).toEqual(['complete_profile'])

    expect(
      ownerNextActions(buildOwnerSummary({ contractDraftCount: 1, newApplicationCount: 4, disputeResponseNeededCount: 2, isNewerStandardTemplateAvailable: true })).map(
        (nextAction) => nextAction.key,
      ),
    ).toEqual(['dispute_response_needed', 'new_application', 'contract_draft', 'newer_standard_template'])
    expect(
      adminNextActions(buildAdminSummary({ openDisputeCount: 3, unviewedDisputeCount: 1, openPlatformReviewCount: 2 })).map((nextAction) => [
        nextAction.key,
        nextAction.count,
      ]),
    ).toEqual([
      ['unviewed_dispute', 1],
      ['open_platform_review', 2],
      ['open_dispute', 3],
    ])
  })

  it('w11_worker_default_tab_overview_unless_roster_linked', () => {
    expect(defaultWorkerWorkspaceTab(false)).toBe('overview')
    // J18: roster-linked workers keep landing on their assigned bookings.
    expect(defaultWorkerWorkspaceTab(true)).toBe('bookings')
    const tabValues = workerWorkspaceTabDefinitions(false).map((tabItem) => tabItem.value)
    expect(tabValues[0]).toBe('overview')
    expect(tabValues).toContain('bookings')
    expect(workerWorkspaceTabDefinitions(false)[0]?.label).toBe('Overview')
  })
})
