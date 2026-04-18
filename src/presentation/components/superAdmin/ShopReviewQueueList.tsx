import type { ReactElement } from 'react'
import { motion } from 'framer-motion'
import { ShieldCheck } from 'lucide-react'
import type { Shop } from '../../../domain/models/Shop'
import { Badge, Card, EmptyState } from '../../design/ui'
import { describeShopVerificationStatus } from '../../utilities/shopVerificationDisplay'

interface ShopReviewQueueListProps {
  readonly shopsInReviewQueue: readonly Shop[]
  readonly isLoadingShopsInReviewQueue: boolean
  readonly shopsInReviewQueueLoadErrorMessage: string | null
  readonly onShopSelectedForReview: (shopToReview: Shop) => void
}

export function ShopReviewQueueList({
  shopsInReviewQueue,
  isLoadingShopsInReviewQueue,
  shopsInReviewQueueLoadErrorMessage,
  onShopSelectedForReview,
}: ShopReviewQueueListProps): ReactElement {
  if (isLoadingShopsInReviewQueue) {
    return (
      <Card elevation="flat" className="py-6 text-center text-sm text-[var(--color-ink-500)]">
        Loading review queue…
      </Card>
    )
  }

  if (shopsInReviewQueueLoadErrorMessage !== null) {
    return (
      <Card
        elevation="flat"
        className="border-[var(--color-danger-500)] bg-[var(--color-danger-50)] p-4 text-sm text-[var(--color-danger-600)]"
      >
        {shopsInReviewQueueLoadErrorMessage}
      </Card>
    )
  }

  if (shopsInReviewQueue.length === 0) {
    return (
      <Card elevation="flat">
        <EmptyState
          icon={<ShieldCheck className="h-5 w-5" />}
          title="No shops awaiting review"
          description="When an owner submits a shop for verification, it will appear here."
        />
      </Card>
    )
  }

  return (
    <motion.ul
      className="space-y-2"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.03 } },
      }}
    >
      {shopsInReviewQueue.map((shopInReviewQueue) => {
        const verificationStatusDisplay = describeShopVerificationStatus(
          shopInReviewQueue.verificationStatus,
        )
        return (
          <motion.li
            key={shopInReviewQueue.id}
            variants={{
              hidden: { opacity: 0, y: 6 },
              visible: { opacity: 1, y: 0 },
            }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <button
              type="button"
              onClick={() => onShopSelectedForReview(shopInReviewQueue)}
              className="w-full rounded-[var(--radius-surface)] border border-[var(--color-ink-200)] bg-white p-4 text-left transition-all hover:border-[var(--color-brand-400)] hover:shadow-[var(--shadow-card)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--color-ink-900)]">
                    {shopInReviewQueue.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-[var(--color-ink-500)]">
                    {shopInReviewQueue.address}
                  </p>
                  {shopInReviewQueue.verificationSubmittedAt ? (
                    <p className="mt-1 text-[11px] text-[var(--color-ink-500)]">
                      Submitted{' '}
                      {new Date(
                        shopInReviewQueue.verificationSubmittedAt,
                      ).toLocaleString()}
                    </p>
                  ) : null}
                </div>
                <Badge tone={verificationStatusDisplay.badgeTone}>
                  {verificationStatusDisplay.displayLabel}
                </Badge>
              </div>
            </button>
          </motion.li>
        )
      })}
    </motion.ul>
  )
}
