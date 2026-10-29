import type { RelationshipLookupPurpose, ShopRereviewDecision, ShopReviewerState } from '../../domain/models/AdminOversight'
import type { AdminModerationNextActionKey } from '../../domain/utilities/workforceNextActions'

/**
 * W14 super_admin oversight wording (D-54..D-57, W14-L7..L10, L12). Lookups and log searches are
 * recorded; counts are shown as the database returns them.
 */

export const reviewerStateLabel: Readonly<Record<ShopReviewerState, string>> = {
  reviewer_missing: 'No reviewer recorded (the reviewer account is gone or was never stored)',
  review_time_missing: 'No review time recorded',
  reviewer_not_super_admin: 'Reviewer was not a platform administrator',
}

export const rereviewDecisionLabel: Readonly<Record<ShopRereviewDecision, string>> = {
  confirm_approval: 'Confirm the approval',
  request_changes: 'Request changes',
  reject: 'Reject',
}

export const rereviewSuccessText: Readonly<Record<ShopRereviewDecision, string>> = {
  confirm_approval: 'The approval was confirmed and your review is recorded. The owner is told.',
  request_changes: 'Changes were requested. The owner is told.',
  reject: 'The verification was rejected. The owner is told.',
}

export const lookupPurposeLabel: Readonly<Record<RelationshipLookupPurpose, string>> = {
  party_support_request: 'The worker or owner asked for help',
  reported_problem_follow_up: 'Follow-up on a reported problem',
  moderation_follow_up: 'Follow-up on a posting report',
  policy_monitoring: 'Workforce policy monitoring',
  legal_or_regulatory_request: 'Legal or regulatory request',
}

export const shopViewToggleLabel = 'Shop verification view'
export const shopReviewQueueViewLabel = 'Verification review'
export const unreviewedShopsViewLabel = 'Approved without a recorded review'
export const unreviewedShopsHeading = 'Approved without a recorded review'
export const unreviewedShopsIntro =
  'Approved shops with no recorded platform administrator review (for example rows from before verification was recorded). Confirm, request changes or reject. Earlier certificates, contracts and relationships stay as they are.'
export const unreviewedShopsEmptyTitle = 'Every approved shop has a recorded review'
export const unreviewedShopsEmptyText = 'Shops approved without a recorded review appear here.'
export const rereviewDrawerTitle = 'Review an approved shop'
export const rereviewDecisionFieldLabel = 'Decision'
export const rereviewNotesFieldLabel = 'Notes to the owner (20 to 1000 characters; not used to confirm)'
export const rereviewSubmitLabel = 'Record review'
export const rereviewConfirmHelpText =
  'Confirming records you as the reviewer and keeps the shop approved. It does not need new documents.'

export const relationshipsHeading = 'Relationship lookups'
export const relationshipsIntro =
  'Look up one worker’s or one owner’s workforce relationships. Every lookup is recorded with its purpose and note. Only the person you look up sees an entry in their activity, with a general purpose (not the one you choose or your note). Other people in the results see nothing.'
export const lookupKindFieldLabel = 'Look up'
export const lookupPersonFieldLabel = 'Account id'
export const lookupPurposeFieldLabel = 'Purpose'
export const lookupNoteFieldLabel = 'Note (20 to 300 characters)'
export const lookupSubmitLabel = 'Look up and record'
export const lookupNotFoundText = 'No account of this kind was found. The lookup was still recorded.'
export const lookupNoRelationshipsText = 'No relationships recorded.'
export const lookupMinimumText = (minimum: number): string =>
  `Current informational minimum: ${String(minimum)} distinct owners. It is a goal shown to workers, not a requirement.`
export const lookupMinimumUnavailableText = 'The current informational minimum could not be read.'

export const auditLogHeading = 'Audit log'
export const auditLogIntro = 'Search recorded workforce events, newest first. Every search is itself recorded.'
export const auditLogNotStartedText = 'Choose filters and search. Nothing is read until you search.'
export const auditLogEmptyTitle = 'No events match'
export const auditLogEmptyText = 'Try fewer filters or a wider date range.'
export const auditSearchLabel = 'Search the audit log'
export const auditLoadOlderLabel = 'Show older events'
export const accessFlagsHeading = 'Long-open disputes read often'
export const accessFlagsIntro = (openDays: number, readCount: number): string =>
  `Open contract disputes older than ${String(openDays)} days whose case was opened ${String(readCount)} or more times. Check that the reads are still needed.`
export const accessFlagsEmptyTitle = 'No flagged disputes'
export const accessFlagsEmptyText = 'Long-open disputes with many case reads appear here.'

export const moderationCountsHeading = 'Moderation and oversight'

function plural(count: number, singular: string, pluralForm: string): string {
  return `${String(count)} ${count === 1 ? singular : pluralForm}`
}

export const adminModerationNextActionText: Readonly<Record<AdminModerationNextActionKey, (count: number) => string>> = {
  changes_submitted: (count) => `${plural(count, 'paused opening', 'paused openings')} where the owner asked WashLink to check changes`,
  open_report_case: (count) => `${plural(count, 'new posting report case', 'new posting report cases')} to review`,
  unreviewed_approved_shop: (count) => `${plural(count, 'approved shop', 'approved shops')} without a recorded review`,
  oversight_flag: (count) => `${plural(count, 'long-open dispute', 'long-open disputes')} read often`,
}

export const adminOversightCopyConstants: readonly string[] = [
  unreviewedShopsIntro,
  rereviewConfirmHelpText,
  relationshipsIntro,
  lookupNotFoundText,
  auditLogIntro,
  ...Object.values(rereviewSuccessText),
]
