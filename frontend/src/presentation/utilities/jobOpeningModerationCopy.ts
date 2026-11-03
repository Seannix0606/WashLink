import type {
  JobOpeningReportCategory,
  JobOpeningReportOutcome,
  JobOpeningReportStatus,
  ModerationActionKind,
  ModerationCaseStatus,
  ModerationHistoryAction,
  ModerationQueueFilter,
} from '../../domain/models/JobOpeningModeration'

/**
 * W14 posting report and moderation wording (P72, P73, D-50..D-53, W14-L1..L6). A WashLink pause
 * or close is a platform action on a listing, never a legal finding; an opening that is not taken
 * down is never described as lawful or vetted. Owners never read who reported or what was written.
 */

export const reportCategoryLabel: Readonly<Record<JobOpeningReportCategory, string>> = {
  age_requirement: 'Age requirement',
  other_discriminatory_requirement: 'Other requirement that may be discriminatory',
  worker_fee_or_deposit: 'Asks workers for a fee or deposit',
  unpaid_trial_or_training: 'Unpaid work presented as a trial or training',
  misleading_terms: 'Misleading pay or terms',
  other: 'Something else',
}

export const reportStatusLabel: Readonly<Record<JobOpeningReportStatus, string>> = {
  open: 'Waiting for WashLink',
  closed: 'Reviewed',
  withdrawn: 'Withdrawn',
}

/** What the reporter learns: the outcome kind only (D-53). */
export const reportOutcomeLabel: Readonly<Record<JobOpeningReportOutcome, string>> = {
  no_action: 'WashLink reviewed it and took no action on the listing.',
  opening_paused: 'WashLink paused the listing.',
  opening_closed: 'The listing was closed.',
  pause_lifted_after_changes: 'The shop changed the listing and WashLink lifted the pause.',
}

export const moderationStatusLabel: Readonly<Record<ModerationCaseStatus, string>> = {
  open: 'New report',
  dismissed: 'Dismissed',
  paused_by_washlink: 'Paused by WashLink',
  changes_submitted: 'Owner asked for a check',
  lifted: 'Pause lifted',
  closed_by_washlink: 'Closed by WashLink',
  resolved_owner_closed: 'Owner closed the opening',
}

export const moderationQueueFilterLabel: Readonly<Record<ModerationQueueFilter, string>> = {
  active: 'Needs attention',
  ...moderationStatusLabel,
}

export const moderationActionLabel: Readonly<Record<ModerationActionKind, string>> = {
  dismiss: 'Dismiss (no action on the listing)',
  pause: 'Pause the opening',
  close: 'Close the opening',
  keep_paused: 'Keep the pause',
  lift: 'Lift the pause',
}

export const moderationActionSuccessText: Readonly<Record<ModerationActionKind, string>> = {
  dismiss: 'The case was dismissed. Reporters see that it was reviewed.',
  pause: 'The opening was paused. The owner can read why.',
  close: 'The opening was closed. The owner can read why.',
  keep_paused: 'The pause was kept. The owner can read why.',
  lift: 'The pause was lifted. The owner can publish the opening again.',
}

/** Owner-facing history entries (never "Suspended"; never who reported). */
export const ownerHistoryActionLabel: Readonly<Record<ModerationHistoryAction, string>> = {
  paused: 'WashLink paused this opening',
  closed: 'WashLink closed this opening',
  dismissed: 'WashLink reviewed this opening',
  changes_submitted: 'You asked WashLink to check your changes',
  pause_kept: 'WashLink kept the pause',
  lifted: 'WashLink lifted the pause',
  owner_closed: 'You closed this opening',
}

export const ownerNoticeTitleByStatus: Readonly<Partial<Record<ModerationCaseStatus, string>>> = {
  paused_by_washlink: 'WashLink paused this opening',
  changes_submitted: 'WashLink is checking your changes',
  lifted: 'WashLink lifted its pause',
  closed_by_washlink: 'WashLink closed this opening',
  resolved_owner_closed: 'You closed this opening',
}

export const notLegalFindingText =
  'WashLink paused this opening because it may not follow the WashLink posting rules. This is not a legal finding.'
export const closedNotLegalFindingText =
  'WashLink closed this opening because it may not follow the WashLink posting rules. This is not a legal finding.'
export const ownerHoldText =
  'While WashLink holds the pause you cannot publish it again. Edit the opening, then ask WashLink to check it. You can also close it at any time.'
export const ownerEditFirstText =
  'Change the opening first. Saving it without changing what it says is not enough. Then you can ask WashLink to check it.'
export const ownerChangesSubmittedText = 'WashLink will lift the pause, keep it, or close the opening. You can still close it yourself.'
export const ownerLiftedText = 'You can publish this opening again. Publishing still needs an approved shop verification.'
export const ownerReasonLabel = 'Reason'
export const ownerMessageLabel = 'Message from WashLink'
export const ownerHistoryHeading = 'History'
export const askWashLinkButtonLabel = 'Ask WashLink to check it'
export const askWashLinkTitle = 'Ask WashLink to check your changes'
export const askWashLinkIntro =
  'WashLink will read the opening as it is now. It must differ from the version WashLink paused; saving it without a real change is not enough. You can add a short note about what you changed (optional).'
export const changeNoteLabel = 'What you changed (optional)'
export const askWashLinkSentText = 'WashLink will check your changes.'

export const reportButtonLabel = 'Report this opening'
export const reportModalTitle = 'Report this job opening'
export const reportIntroText =
  'Tell WashLink if this opening may break the WashLink posting rules. The shop does not see your report, what you write or who reported.'
export const reportNotLegalAdviceText =
  'WashLink can pause or close a listing. It cannot decide legal rights or pay. For those, contact DOLE or a lawyer.'
export const reportCategoryFieldLabel = 'Reason'
export const reportStatementFieldLabel = 'What is wrong (20 to 1000 characters)'
export const reportSubmitLabel = 'Send report'
export const reportSentText = 'Report sent. WashLink will review it.'
export const reportWithdrawnText = 'Report withdrawn.'

export const myReportsHeading = 'Your reports'
export const myReportsShowLabel = 'Show your reports'
export const myReportsHideLabel = 'Hide your reports'
export const myReportsEmptyTitle = 'No reports'
export const myReportsEmptyText = 'Openings you report appear here with the outcome.'
export const withdrawReportLabel = 'Withdraw'

export const adminQueueHeading = 'Posting reports'
export const adminQueueIntro =
  'Job openings workers reported, oldest first. Pausing or closing a listing is a platform action, not a legal finding.'
export const adminQueueEmptyTitle = 'No posting reports here'
export const adminQueueEmptyText = 'Reports from workers appear here.'
// W13 paged queue (D-71): 50 cases per page, oldest first.
export const adminQueueLoadMoreLabel = 'Load more'
export const adminQueueLoadMoreFailedTitle = 'More posting reports could not be loaded'
export function adminQueueShowingText(shownCount: number, totalCount: number): string {
  return `Showing ${String(shownCount)} of ${String(totalCount)}`
}
export const adminCaseAuditedText = 'Opening this case is recorded in the audit log.'
export const adminCaseReporterProtectionText =
  'Reporters are shown as Reporter 1, 2 and so on. The owner never sees reports, statements or who reported.'
export const adminOpeningGoneText = 'The job opening no longer exists. Only dismiss is available.'
export const moderateFormTitle = 'Decide this case'
export const decideChangesFormTitle = 'Decide the owner’s changes'
export const moderationActionFieldLabel = 'Action'
export const moderationReasonFieldLabel = 'Reason shown to the owner'
export const ownerMessageFieldLabel = 'Message to the owner (20 to 500 characters)'
export const adminNoteFieldLabel = 'Internal note (20 to 1000 characters; required to dismiss)'
export const moderateSubmitLabel = 'Record decision'
export const moderationActionHelpText =
  'WashLink never edits, archives or deletes an opening. Closing it also closes its live applications; applicants are not told the reason.'

/** Every fixed string above, for the wording checks. */
export const jobOpeningModerationCopyConstants: readonly string[] = [
  notLegalFindingText,
  closedNotLegalFindingText,
  ownerHoldText,
  ownerEditFirstText,
  ownerChangesSubmittedText,
  ownerLiftedText,
  askWashLinkIntro,
  reportIntroText,
  reportNotLegalAdviceText,
  myReportsEmptyText,
  adminQueueIntro,
  adminCaseReporterProtectionText,
  moderationActionHelpText,
  ...Object.values(reportOutcomeLabel),
  ...Object.values(ownerHistoryActionLabel),
  ...Object.values(moderationActionSuccessText),
]
