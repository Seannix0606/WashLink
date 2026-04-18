import type { ReactElement } from 'react'
import { AlertTriangle, BadgeCheck, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { Shop } from '../../../domain/models/Shop'
import { Button, Card } from '../../design/ui'

interface OwnerVerificationBannerProps {
  readonly ownerShopList: readonly Shop[]
  readonly onReviewVerificationRequested: () => void
}

interface OwnerVerificationBannerCopy {
  readonly iconNode: ReactElement
  readonly containerClassName: string
  readonly titleText: string
  readonly descriptionText: string
}

function resolveOwnerVerificationBannerCopy(
  ownerShopList: readonly Shop[],
): OwnerVerificationBannerCopy | null {
  if (ownerShopList.length === 0) {
    return null
  }

  const rejectedShopCount = ownerShopList.filter(
    (ownerShop) => ownerShop.verificationStatus === 'rejected',
  ).length
  const changesRequestedShopCount = ownerShopList.filter(
    (ownerShop) => ownerShop.verificationStatus === 'changes_requested',
  ).length
  const pendingShopCount = ownerShopList.filter(
    (ownerShop) => ownerShop.verificationStatus === 'pending',
  ).length
  const approvedShopCount = ownerShopList.filter(
    (ownerShop) => ownerShop.verificationStatus === 'approved',
  ).length

  if (rejectedShopCount > 0) {
    return {
      iconNode: <ShieldAlert className="h-5 w-5" />,
      containerClassName:
        'border-[var(--color-danger-500)] bg-[var(--color-danger-50)] text-[var(--color-danger-600)]',
      titleText: `${rejectedShopCount} shop${
        rejectedShopCount === 1 ? '' : 's'
      } rejected`,
      descriptionText:
        'Rejected shops are hidden from customers. Review the notes, update your documents, and resubmit.',
    }
  }
  if (changesRequestedShopCount > 0) {
    return {
      iconNode: <AlertTriangle className="h-5 w-5" />,
      containerClassName:
        'border-[var(--color-warning-500)] bg-[var(--color-warning-50)] text-[var(--color-warning-600)]',
      titleText: `Changes requested for ${changesRequestedShopCount} shop${
        changesRequestedShopCount === 1 ? '' : 's'
      }`,
      descriptionText:
        'Our team needs updated documents. Review the notes, replace what was flagged, and resubmit.',
    }
  }
  if (pendingShopCount > 0) {
    return {
      iconNode: <ShieldCheck className="h-5 w-5" />,
      containerClassName:
        'border-[var(--color-brand-400)] bg-[var(--color-brand-50)] text-[var(--color-brand-800)]',
      titleText: `${pendingShopCount} shop${
        pendingShopCount === 1 ? '' : 's'
      } awaiting review`,
      descriptionText:
        'Your documents are under review. Shops stay hidden from customers until approved.',
    }
  }
  if (approvedShopCount === ownerShopList.length) {
    return {
      iconNode: <BadgeCheck className="h-5 w-5" />,
      containerClassName:
        'border-[var(--color-success-500)] bg-[var(--color-success-50)] text-[var(--color-success-600)]',
      titleText: 'All shops verified',
      descriptionText: 'Every shop you manage is live and visible to customers.',
    }
  }
  return null
}

export function OwnerVerificationBanner({
  ownerShopList,
  onReviewVerificationRequested,
}: OwnerVerificationBannerProps): ReactElement | null {
  const bannerCopy = resolveOwnerVerificationBannerCopy(ownerShopList)
  if (bannerCopy === null) {
    return null
  }

  return (
    <Card
      elevation="flat"
      className={`flex items-start gap-3 border p-4 ${bannerCopy.containerClassName}`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-current">
        {bannerCopy.iconNode}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{bannerCopy.titleText}</p>
        <p className="mt-0.5 text-xs text-[var(--color-ink-700)]">
          {bannerCopy.descriptionText}
        </p>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onReviewVerificationRequested}
      >
        Open verification
      </Button>
    </Card>
  )
}
