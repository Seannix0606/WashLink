import { describe, expect, it } from 'vitest'
import { problemStatementGuidance, reportProblemIntro, reportProblemWindowText, respondProblemIntro } from './contractDisputeCopy'
import {
  askWashLinkReviewExplanation,
  platformReviewBasisText,
  platformReviewCopyConstants,
  platformReviewStatementGuidance,
} from './platformReviewCopy'
import { platformReviewBases } from '../../domain/models/CertificationPlatformReview'
import { strandedSuspensionHelpText, workforceDashboardCopyConstants } from './workforceDashboardCopy'
import { contractDisputeCopyConstants } from './contractDisputeCopy'
import { workerCountGroups } from './workforceDashboardDisplay'
import { buildWorkerSummary } from '../../test/oversightFixtures'

/** W11 fix cycle 1 (REVIEW.md C1-C5): copy states only what the system enforces. */
describe('W11 oversight copy (fix cycle 1)', () => {
  it('c1_review_copy_does_not_promise_administrator_independence', () => {
    expect(askWashLinkReviewExplanation).toContain('A WashLink administrator decides, not the shop.')
    for (const copyText of platformReviewCopyConstants) {
      expect(copyText).not.toMatch(/does not work for the shop|independent|impartial|neutral/i)
    }
  })

  it('c2_statement_forms_say_who_sees_the_statement', () => {
    expect(platformReviewStatementGuidance).toContain('Your statement is shown to the shop and to WashLink.')
    expect(reportProblemIntro).toContain('is shown to the other party and to WashLink.')
    expect(problemStatementGuidance).toContain('What you write here is shown to the other party and to WashLink.')
    expect(respondProblemIntro).toContain('It is shown to the other party and to WashLink.')
  })

  it('c3_ninety_day_window_is_a_washlink_limit_only', () => {
    expect(reportProblemWindowText).toContain('This is a WashLink limit only.')
    expect(reportProblemWindowText).toContain('It does not affect any deadline for raising the matter with a government office.')
    // No legal period is stated anywhere in the W11 copy beyond WashLink's own limits.
    for (const copyText of [...contractDisputeCopyConstants, ...platformReviewCopyConstants, ...workforceDashboardCopyConstants]) {
      expect(copyText).not.toMatch(/\b(statute|limitation period|prescriptive period|prescription)\b/i)
      expect(copyText).not.toMatch(/\blegal (deadline|period)\b/i)
    }
  })

  it('c4_c5_dashboard_wording_matches_count_definitions', () => {
    expect(strandedSuspensionHelpText).toContain('no WashLink decision on the current suspension')
    expect(strandedSuspensionHelpText).not.toContain('The worker can ask for one.')
    // Certificates at the 3-review limit stay in the count, so the text must not promise a request is always possible.
    expect(strandedSuspensionHelpText).toContain('at most 3 times per suspension')
    const workGroup = workerCountGroups(buildWorkerSummary()).find((group) => group.key === 'work')
    expect(workGroup?.items.find((item) => item.key === 'open_openings')?.label).toBe('Openings you can apply to')
  })

  it('every_review_basis_has_display_text', () => {
    expect(platformReviewBases).toContain('resuspended_after_shop_resolution')
    expect(platformReviewBasisText.resuspended_after_shop_resolution).toBe(
      'The shop suspended or revoked the certificate again within 30 days after reinstating it during an earlier WashLink review.',
    )
    for (const basis of platformReviewBases) {
      expect(platformReviewBasisText[basis].length).toBeGreaterThan(0)
    }
  })
})
