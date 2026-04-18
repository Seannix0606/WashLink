import type { ShopVerificationStatus } from '../../domain/models/Shop'
import type { BadgeTone } from '../design/ui/Badge'

export interface ShopVerificationStatusDisplay {
  readonly displayLabel: string
  readonly badgeTone: BadgeTone
  readonly headlineText: string
  readonly helperText: string
}

const shopVerificationStatusDisplayByStatus: Record<
  ShopVerificationStatus,
  ShopVerificationStatusDisplay
> = {
  pending: {
    displayLabel: 'Pending review',
    badgeTone: 'warning',
    headlineText: 'Verification in progress',
    helperText:
      'Your documents are being reviewed. Your shop is hidden from customers until it\u2019s approved.',
  },
  changes_requested: {
    displayLabel: 'Changes requested',
    badgeTone: 'warning',
    headlineText: 'Action needed',
    helperText:
      'Our team requested changes. Update the documents below and resubmit for review.',
  },
  approved: {
    displayLabel: 'Verified',
    badgeTone: 'success',
    headlineText: 'Shop verified',
    helperText:
      'Your shop is visible to customers. Keep your documents up to date for future audits.',
  },
  rejected: {
    displayLabel: 'Rejected',
    badgeTone: 'danger',
    headlineText: 'Verification rejected',
    helperText:
      'Your shop is hidden from customers. Review the notes, replace the affected documents, and resubmit for review.',
  },
}

export function describeShopVerificationStatus(
  verificationStatus: ShopVerificationStatus,
): ShopVerificationStatusDisplay {
  return shopVerificationStatusDisplayByStatus[verificationStatus]
}
