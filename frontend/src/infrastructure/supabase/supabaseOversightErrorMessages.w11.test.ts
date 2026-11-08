import { describe, expect, it } from 'vitest'
import { toUserFacingErrorMessage } from './supabaseErrorMessages'

// Every message the W11 migrations raise on purpose (loop/workforce/increments/W11/LOG.md, BUILD (DB)).
const w11DatabaseMessages: readonly [string, string][] = [
  ['42501', 'Certification not found.'],
  ['55000', 'This certification changed. Refresh and try again.'],
  ['23514', 'Only a suspended or revoked certification can be reviewed.'],
  ['23505', 'WashLink is already reviewing this certification.'],
  ['23514', 'WashLink already reviewed this decision.'],
  ['23514', 'You can ask WashLink to review this decision at most 3 times.'],
  [
    '23514',
    'Ask the shop to review this decision first. You can ask WashLink when the shop keeps its decision, has not decided within 14 days, or can no longer decide.',
  ],
  ['23514', 'Write a statement of 20 to 1000 characters.'],
  ['42501', 'WashLink review not found.'],
  ['23514', 'This review is no longer open.'],
  ['42501', 'Only a platform administrator can decide WashLink reviews.'],
  ['55000', 'This review changed. Refresh and try again.'],
  ['22023', 'Choose reinstate or uphold.'],
  ['23514', 'Give a reason of 20 to 500 characters.'],
  ['23514', 'This certification is no longer suspended or revoked.'],
  ['23514', 'WashLink is reviewing this certification. Wait for its decision.'],
  ['22023', 'Choose a review status.'],
  ['42501', 'Only a platform administrator can read WashLink reviews.'],
  ['42501', 'Contract not found.'],
  ['23514', 'Only a contract that was sent can be reported.'],
  ['23514', 'Problems can be reported up to 90 days after a contract ends.'],
  ['22023', 'Choose a problem category.'],
  ['23514', 'This category does not match the contract.'],
  ['23505', 'You already reported a problem with this contract.'],
  ['23514', 'You can report at most 3 problems with this contract.'],
  ['42501', 'Reported problem not found.'],
  ['42501', 'Only the other party can add a response.'],
  ['23514', 'This reported problem is no longer open.'],
  ['23505', 'A response was already recorded.'],
  ['42501', 'Only a platform administrator can close disputes.'],
  ['55000', 'This reported problem changed. Refresh and try again.'],
  ['22023', 'Choose how the problem was closed.'],
  ['23514', 'Write a note of 20 to 1000 characters.'],
  ['22023', 'Choose a dispute status.'],
  ['42501', 'Only a platform administrator can read reported contract problems.'],
  ['42501', 'Certification records cannot be edited.'],
  ['42501', 'WashLink reviews change only through the WashLink review actions.'],
  ['42501', 'Reported contract problems cannot be edited.'],
  ['42501', 'Reported contract problems change only through WashLink.'],
]

describe('W11 error messages', () => {
  it('w11_error_messages_mapped', () => {
    for (const [errorCode, databaseMessage] of w11DatabaseMessages) {
      expect(toUserFacingErrorMessage({ code: errorCode, message: databaseMessage }, 'fallback')).toBe(databaseMessage)
    }
    // Raw SQL and internal preflight texts are never passed through.
    expect(toUserFacingErrorMessage({ code: '55000', message: 'could not obtain lock on row in relation "worker_contract_disputes"' }, 'Try again.')).toBe('Try again.')
    expect(
      toUserFacingErrorMessage({ code: 'P0001', message: 'W11i: missing W11 function public.admin_dashboard_summary()' }, 'Could not load the overview.'),
    ).toBe('Could not load the overview.')
    expect(toUserFacingErrorMessage({ code: '42501', message: 'permission denied for table certification_platform_reviews' }, 'fallback')).toBe(
      'Your account is not allowed to do this.',
    )
  })
})
