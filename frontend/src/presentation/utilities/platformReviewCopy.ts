import type { PlatformReviewBasis, PlatformReviewStatus } from '../../domain/models/CertificationPlatformReview'

/**
 * W11 WashLink review wording (D-44, D-45, W11-L1). The shop that issued a certificate stays its
 * issuer; WashLink only reviews the shop's suspension or revocation and can reinstate or keep it.
 * The deciding administrator is never named: decisions read "WashLink review".
 */

export const washLinkReviewLabel = 'WashLink review'

export const askWashLinkReviewButtonLabel = 'Ask WashLink to review'

export const askWashLinkReviewTitle = 'Ask WashLink to review the shop decision'

export const askWashLinkReviewExplanation =
  'A WashLink administrator decides, not the shop. The administrator reads the record and either reinstates the certificate or keeps the shop decision. WashLink does not issue, renew or change certificates; the shop stays the issuer. The decision is final within WashLink.'

export const askWashLinkReviewHoldText =
  'While WashLink reviews it, the shop cannot revoke the certificate and you cannot send the shop a new review request. The shop can still reinstate it.'

export const askWashLinkReviewWithdrawsShopRequestText = 'If you have an open review request with the shop, it is withdrawn when you ask WashLink.'

export const platformReviewStatementLabel = 'Your statement (required, 20 to 1000 characters)'

export const platformReviewStatementGuidance =
  'Your statement is shown to the shop and to WashLink. Explain why the shop decision should be looked at again. Write facts only; do not include phone numbers, addresses or other private details.'

export const sendPlatformReviewButtonLabel = 'Send to WashLink'

export const withdrawPlatformReviewButtonLabel = 'Withdraw WashLink review'

export const withdrawPlatformReviewTitle = 'Withdraw the WashLink review?'

export const withdrawPlatformReviewMessage = 'WashLink will not decide on it. The shop decision stays as it is.'

export const platformReviewOpenText = 'WashLink is reviewing the shop decision. You will get a notification when it is decided.'

export const platformReviewBasisText: Readonly<Record<PlatformReviewBasis, string>> = {
  upheld_by_shop: 'The shop kept its decision after your review request.',
  shop_decision_overdue: 'The shop has not decided your review request within 14 days.',
  issuer_unavailable: 'The issuing shop can no longer decide (it was removed, changed owner or is not verified).',
  resuspended_after_shop_resolution:
    'The shop suspended or revoked the certificate again within 30 days after reinstating it during an earlier WashLink review.',
}

export const platformReviewStatusLabel: Readonly<Record<PlatformReviewStatus, string>> = {
  open: 'WashLink review open',
  reinstated: 'WashLink review: reinstated',
  upheld: 'WashLink review: shop decision kept',
  withdrawn: 'WashLink review withdrawn',
  resolved_by_shop: 'Shop reinstated it during the WashLink review',
}

export const ownerPlatformReviewOpenText =
  'The worker asked WashLink to review this decision. While it is open you cannot revoke this certificate; you can still reinstate it, which closes the review.'

export const ownerPlatformReviewWorkerStatementLabel = 'Worker statement'

export const platformReviewDecisionReasonLabel = 'WashLink review reason'

export const adminPlatformReviewQueueHeading = 'Certification reviews'

export const adminPlatformReviewQueueIntro =
  'Workers ask for these after the shop kept its decision, did not decide within 14 days, or can no longer decide. Reinstate or keep the shop decision; WashLink never suspends, revokes, issues or renews.'

export const adminPlatformReviewEmptyTitle = 'No WashLink reviews here'

export const adminPlatformReviewEmptyText = 'Reviews workers ask for appear here, oldest first.'

export const adminCaseAuditedText = 'Opening this review is recorded in the audit log.'

export const decideReasonLabel = 'Reason shown to the worker and the shop (required, 20 to 500 characters)'

export const decideReasonGuidance = 'State what you checked. Do not include private details.'

export const decideReinstateLabel = 'Reinstate the certificate'

export const decideUpholdLabel = 'Keep the shop decision'

export const decideNoIssuerCheckText =
  'Reinstating does not need the shop to be verified now: the certificate rests on its record at issue. Expiry, evidence and snapshots do not change.'

export const decideButtonLabel = 'Record decision'

export const platformReviewStatusFilterLabels: Readonly<Record<PlatformReviewStatus, string>> = {
  open: 'Open',
  reinstated: 'Reinstated',
  upheld: 'Kept',
  withdrawn: 'Withdrawn',
  resolved_by_shop: 'Resolved by shop',
}

/** Every fixed string above, for the wording checks. */
export const platformReviewCopyConstants: readonly string[] = [
  washLinkReviewLabel,
  askWashLinkReviewButtonLabel,
  askWashLinkReviewTitle,
  askWashLinkReviewExplanation,
  askWashLinkReviewHoldText,
  askWashLinkReviewWithdrawsShopRequestText,
  platformReviewStatementLabel,
  platformReviewStatementGuidance,
  withdrawPlatformReviewMessage,
  platformReviewOpenText,
  ...Object.values(platformReviewBasisText),
  ...Object.values(platformReviewStatusLabel),
  ownerPlatformReviewOpenText,
  adminPlatformReviewQueueIntro,
  adminCaseAuditedText,
  decideReasonLabel,
  decideNoIssuerCheckText,
]
