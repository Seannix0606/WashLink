import type {
  AdminNextActionKey,
  OwnerNextActionKey,
  WorkerNextActionKey,
} from '../../domain/utilities/workforceNextActions'

/**
 * W11 dashboard wording (D-42, D-43, W11-L9). Counts are shown as the database returns them.
 * Nothing here ranks, recommends or pressures; the overview only points to where things are.
 */

function plural(count: number, singular: string, pluralForm: string): string {
  return `${String(count)} ${count === 1 ? singular : pluralForm}`
}

export const workerNextActionText: Readonly<Record<WorkerNextActionKey, (count: number) => string>> = {
  dispute_response_needed: (count) => `${plural(count, 'reported contract problem', 'reported contract problems')} where you can add your side`,
  contract_offer: (count) => `${plural(count, 'contract offer', 'contract offers')} waiting for your answer`,
  amendment_offer: (count) => `${plural(count, 'proposed contract change', 'proposed contract changes')} waiting for your answer`,
  training_invitation: (count) => `${plural(count, 'free training invitation', 'free training invitations')} to answer`,
  platform_review_available: (count) =>
    `${plural(count, 'certification', 'certifications')} you can ask WashLink to review`,
  complete_profile: () => 'Complete your worker profile so shops can see what you do',
  draft_application: (count) => `${plural(count, 'application draft', 'application drafts')} not sent yet`,
}

export const ownerNextActionText: Readonly<Record<OwnerNextActionKey, (count: number) => string>> = {
  dispute_response_needed: (count) => `${plural(count, 'reported contract problem', 'reported contract problems')} where you can add your side`,
  new_application: (count) => `${plural(count, 'new application', 'new applications')} to review`,
  open_shop_review_request: (count) => `${plural(count, 'certification review request', 'certification review requests')} to decide`,
  open_platform_review: (count) => `${plural(count, 'certification decision', 'certification decisions')} under WashLink review`,
  ready_to_certify: (count) => `${plural(count, 'trainee', 'trainees')} who completed training and can be certified by your shop`,
  shops_needing_verification: (count) => `${plural(count, 'shop', 'shops')} without an approved verification`,
  relationship_needs_attention: (count) => `${plural(count, 'worker relationship', 'worker relationships')} ${count === 1 ? 'needs' : 'need'} attention`,
  record_changed_certification: (count) =>
    `${plural(count, 'certificate', 'certificates')} whose training record changed after issue`,
  expiring_certification: (count) => `${plural(count, 'certificate', 'certificates')} expiring within 30 days`,
  contract_draft: (count) => `${plural(count, 'contract draft', 'contract drafts')} not sent yet`,
  newer_standard_template: () => 'A newer standard contract template is available',
}

export const adminNextActionText: Readonly<Record<AdminNextActionKey, (count: number) => string>> = {
  unviewed_dispute: (count) => `${plural(count, 'reported contract problem', 'reported contract problems')} not opened yet`,
  open_platform_review: (count) => `${plural(count, 'WashLink review', 'WashLink reviews')} waiting for a decision`,
  shops_pending_review: (count) => `${plural(count, 'shop', 'shops')} waiting for verification review`,
  open_dispute: (count) => `${plural(count, 'open reported contract problem', 'open reported contract problems')} in total`,
}

export const nextActionsHeading = 'Next actions'
export const nextActionsEmptyTitle = 'Nothing is waiting for you'
export const workerNextActionsEmptyText = 'New offers, invitations and answers will show here.'
export const ownerNextActionsHeading = 'Next actions'
export const adminNextActionsEmptyText = 'No reviews, reported problems or shop verifications are waiting.'

export const workerOverviewTabLabel = 'Overview'
export const workerOverviewHeading = 'Your overview'
export const workerOverviewIntroText = 'What is waiting for you on WashLink. Open a section to act.'
export const overviewCountsHeading = 'At a glance'
export const overviewUnavailableTitle = 'No overview for this account'
export const overviewUnavailableText = 'The overview is shown to worker accounts only.'
export const ownerWorkforceUnavailableText = 'The workforce overview is shown to owner accounts only.'
export const adminOverviewUnavailableText = 'The overview is shown to platform administrator accounts only.'

export const latestOpeningsHeading = 'Latest openings'
export const latestOpeningsNote =
  'The newest published openings, newest first. They are not ranked or matched to you, and listing does not mean WashLink vouches for them. Read each opening before you apply.'
export const latestOpeningsEmptyTitle = 'No open job openings right now'
export const latestOpeningsEmptyText = 'Published openings from verified shops appear here.'
export const latestOpeningsBrowseLabel = 'Browse all openings'

export const ownerWorkforceTabLabel = 'Workforce'
export const ownerWorkforceHeading = 'Workforce overview'
export const ownerWorkforceIntroText = 'Counts for your own shops only, refreshed while this page is open.'

export const adminOverviewHeading = 'Overview'
export const adminOverviewIntroText =
  'Counts across WashLink. WashLink reviews and reported contract problems are decided here; shop certificates and contracts stay with the shops and workers.'
export const overdueShopReviewHelpText =
  'Shop review requests not decided within 14 days. The worker can ask WashLink to review them; WashLink does not take them over on its own.'
export const strandedSuspensionHelpText =
  'Suspended certificates whose issuing shop can no longer decide, with no open WashLink review and no WashLink decision on the current suspension. Only the worker can ask WashLink to review one, at most 3 times per suspension, so some may have no request left. WashLink does not start a review on its own.'

export const countedAsOfPrefix = 'Counted'

/** Every fixed string above, for the wording checks. */
export const workforceDashboardCopyConstants: readonly string[] = [
  nextActionsHeading,
  nextActionsEmptyTitle,
  workerNextActionsEmptyText,
  adminNextActionsEmptyText,
  workerOverviewHeading,
  workerOverviewIntroText,
  overviewCountsHeading,
  overviewUnavailableTitle,
  overviewUnavailableText,
  ownerWorkforceUnavailableText,
  adminOverviewUnavailableText,
  latestOpeningsHeading,
  latestOpeningsNote,
  latestOpeningsEmptyTitle,
  latestOpeningsEmptyText,
  latestOpeningsBrowseLabel,
  ownerWorkforceHeading,
  ownerWorkforceIntroText,
  adminOverviewHeading,
  adminOverviewIntroText,
  overdueShopReviewHelpText,
  strandedSuspensionHelpText,
]
