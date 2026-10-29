import { describe, expect, it } from 'vitest'
import { jobOpeningModerationCopyConstants } from '../../presentation/utilities/jobOpeningModerationCopy'
import { adminOversightCopyConstants } from '../../presentation/utilities/adminOversightCopy'
import { workforceActivityCopyConstants } from '../../presentation/utilities/workforceActivityCopy'
import { toUserFacingErrorMessage } from './supabaseErrorMessages'

// Every message the W14 migrations raise on purpose (loop/workforce/increments/W14/LOG.md, BUILD (DB)).
const w14DatabaseMessages: readonly [string, string][] = [
  ['42501', 'Job opening not found.'],
  ['42501', 'Report not found.'],
  ['42501', 'Moderation case not found.'],
  ['42501', 'Shop not found.'],
  ['42501', 'Only a platform administrator can moderate job openings.'],
  ['42501', 'Only a platform administrator can read moderation cases.'],
  ['42501', 'Only a platform administrator can review shops.'],
  ['42501', 'Only a platform administrator can look up relationships.'],
  ['42501', 'Only a platform administrator can read the audit log.'],
  ['42501', 'This job opening change is not allowed.'],
  ['42501', 'Moderation records cannot be edited.'],
  ['42501', 'Moderation records change only through the WashLink moderation actions.'],
  ['42501', 'Access records are append-only.'],
  ['42501', 'Access records are written only by the WashLink lookup actions.'],
  ['22023', 'Choose a report reason.'],
  ['22023', 'Choose a moderation action.'],
  ['22023', 'Choose a reason for this action.'],
  ['22023', 'Choose a case status.'],
  ['22023', 'Choose confirm approval, request changes or reject.'],
  ['22023', 'Choose a purpose for this lookup.'],
  ['22023', 'Choose a person to look up.'],
  ['22023', 'Choose a page size between 1 and 100.'],
  ['22023', 'Choose a page size between 1 and 200.'],
  ['22023', 'Use only lowercase letters, dots and underscores in the action filter.'],
  ['22023', 'Use only lowercase letters and underscores in the subject type filter.'],
  ['22023', 'The start of the range must be before the end.'],
  ['23505', 'You already reported this job opening.'],
  ['23514', 'Write 20 to 1000 characters.'],
  ['23514', 'You have reached the report limit. Wait for WashLink to review your reports.'],
  ['23514', 'This report is no longer open.'],
  ['23514', 'This action is not available for this case.'],
  ['23514', 'This job opening no longer exists.'],
  ['23514', 'Write a message to the owner of 20 to 500 characters.'],
  ['23514', 'Write an internal note of 20 to 1000 characters.'],
  ['23514', 'Only a published or paused job opening can be paused or closed.'],
  ['23514', 'This job opening is not waiting for your changes.'],
  ['23514', 'Edit the job opening before asking WashLink to check it.'],
  ['23514', 'Write at most 500 characters.'],
  ['23514', 'WashLink paused this job opening. Edit it and ask WashLink to check it before publishing again.'],
  ['23514', 'This shop already has a recorded review.'],
  ['23514', 'Write notes of 20 to 1000 characters.'],
  ['23514', 'Write a note of 20 to 300 characters.'],
  ['55000', 'This case changed. Refresh and try again.'],
]

describe('W14 error messages', () => {
  it('w14_error_messages_mapped', () => {
    for (const [errorCode, databaseMessage] of w14DatabaseMessages) {
      expect(toUserFacingErrorMessage({ code: errorCode, message: databaseMessage }, 'fallback')).toBe(databaseMessage)
    }
    // Preflight / drift texts and raw SQL are never passed through.
    expect(
      toUserFacingErrorMessage({ code: 'P0001', message: 'W14c: unexpected BEFORE UPDATE triggers on job_openings: x (D-10, R1)' }, 'Could not save.'),
    ).toBe('Could not save.')
    expect(toUserFacingErrorMessage({ code: '42501', message: 'permission denied for table admin_access_records' }, 'fallback')).toBe(
      'Your account is not allowed to do this.',
    )
    // The W14 copy never claims a legal finding, legal validity, or that WashLink employs anyone.
    for (const copyText of [...jobOpeningModerationCopyConstants, ...adminOversightCopyConstants, ...workforceActivityCopyConstants]) {
      expect(copyText).not.toMatch(/\b(is (unlawful|illegal|lawful)|legally (valid|binding)|enforceable|compliant|vetted)\b|WashLink is the employer|Suspended/i)
    }
  })
})
