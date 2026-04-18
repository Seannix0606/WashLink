import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, MessageSquare, XCircle } from 'lucide-react'
import type { ShopVerificationService } from '../../../application/services/ShopVerificationService'
import type { Shop } from '../../../domain/models/Shop'
import { Badge, Button, Drawer } from '../../design/ui'
import { useShopVerificationDecisionActions } from '../../hooks/useShopVerificationDecisionActions'
import { useShopVerificationDocuments } from '../../hooks/useShopVerificationDocuments'
import { describeShopVerificationStatus } from '../../utilities/shopVerificationDisplay'
import { ShopReviewDocumentList } from './ShopReviewDocumentList'

interface ShopVerificationReviewDrawerProps {
  readonly isOpen: boolean
  readonly shopUnderReview: Shop | null
  readonly reviewerIdentifier: string
  readonly shopVerificationService: ShopVerificationService
  readonly onClose: () => void
  readonly onShopReviewDecisionApplied: (updatedShop: Shop) => void
}

const decisionNotesCharacterLimit = 500

export function ShopVerificationReviewDrawer({
  isOpen,
  shopUnderReview,
  reviewerIdentifier,
  shopVerificationService,
  onClose,
  onShopReviewDecisionApplied,
}: ShopVerificationReviewDrawerProps): ReactElement {
  const [draftDecisionNotes, setDraftDecisionNotes] = useState<string>('')

  useEffect(() => {
    if (!isOpen) {
      return
    }
    setDraftDecisionNotes(shopUnderReview?.verificationNotes ?? '')
  }, [isOpen, shopUnderReview?.id, shopUnderReview?.verificationNotes])

  const {
    verificationDocuments,
    isLoadingVerificationDocuments,
  } = useShopVerificationDocuments({
    shopVerificationService,
    shopIdentifier: shopUnderReview?.id ?? null,
  })

  const { activeDecisionKind, approveShop, rejectShop, requestShopChanges } =
    useShopVerificationDecisionActions({
      shopVerificationService,
      reviewerIdentifier,
    })

  const trimmedDecisionNotes = draftDecisionNotes.trim()
  const isAnyDecisionInFlight = activeDecisionKind !== null
  const resolvedDecisionNotes =
    trimmedDecisionNotes.length > 0 ? trimmedDecisionNotes : null

  const verificationStatusDisplay = useMemo(() => {
    if (shopUnderReview === null) {
      return null
    }
    return describeShopVerificationStatus(shopUnderReview.verificationStatus)
  }, [shopUnderReview])

  const areNotesRequiredForRejectionOrChanges =
    trimmedDecisionNotes.length === 0

  const handleApproveClicked = async (): Promise<void> => {
    if (shopUnderReview === null) {
      return
    }
    const approvedShop = await approveShop(
      shopUnderReview.id,
      resolvedDecisionNotes,
    )
    if (approvedShop !== null) {
      onShopReviewDecisionApplied(approvedShop)
      onClose()
    }
  }

  const handleRejectClicked = async (): Promise<void> => {
    if (shopUnderReview === null) {
      return
    }
    if (areNotesRequiredForRejectionOrChanges) {
      return
    }
    const rejectedShop = await rejectShop(
      shopUnderReview.id,
      resolvedDecisionNotes,
    )
    if (rejectedShop !== null) {
      onShopReviewDecisionApplied(rejectedShop)
      onClose()
    }
  }

  const handleRequestChangesClicked = async (): Promise<void> => {
    if (shopUnderReview === null) {
      return
    }
    if (areNotesRequiredForRejectionOrChanges) {
      return
    }
    const updatedShop = await requestShopChanges(
      shopUnderReview.id,
      resolvedDecisionNotes,
    )
    if (updatedShop !== null) {
      onShopReviewDecisionApplied(updatedShop)
      onClose()
    }
  }

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={shopUnderReview?.name ?? 'Shop review'}
      description={shopUnderReview?.address ?? undefined}
      footer={
        shopUnderReview !== null ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                isFullWidth
                leadingIcon={<MessageSquare className="h-4 w-4" />}
                isLoading={activeDecisionKind === 'request_changes'}
                disabled={
                  isAnyDecisionInFlight ||
                  areNotesRequiredForRejectionOrChanges
                }
                onClick={() => void handleRequestChangesClicked()}
              >
                Request changes
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                isFullWidth
                leadingIcon={<XCircle className="h-4 w-4" />}
                isLoading={activeDecisionKind === 'reject'}
                disabled={
                  isAnyDecisionInFlight ||
                  areNotesRequiredForRejectionOrChanges
                }
                onClick={() => void handleRejectClicked()}
              >
                Reject
              </Button>
            </div>
            <Button
              type="button"
              variant="primary"
              isFullWidth
              leadingIcon={<CheckCircle2 className="h-4 w-4" />}
              isLoading={activeDecisionKind === 'approve'}
              disabled={isAnyDecisionInFlight}
              onClick={() => void handleApproveClicked()}
            >
              Approve shop
            </Button>
            {areNotesRequiredForRejectionOrChanges ? (
              <p className="text-[11px] text-[var(--color-ink-500)]">
                Add reviewer notes to reject or request changes.
              </p>
            ) : null}
          </div>
        ) : null
      }
    >
      {shopUnderReview === null || verificationStatusDisplay === null ? (
        <p className="text-sm text-[var(--color-ink-500)]">
          Select a shop to review.
        </p>
      ) : (
        <div className="space-y-5">
          <div className="rounded-[var(--radius-control)] border border-[var(--color-ink-200)] bg-[var(--color-surface-muted)] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-700)]">
                Status
              </p>
              <Badge tone={verificationStatusDisplay.badgeTone}>
                {verificationStatusDisplay.displayLabel}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-[var(--color-ink-700)]">
              {verificationStatusDisplay.helperText}
            </p>
            {shopUnderReview.verificationSubmittedAt ? (
              <p className="mt-1 text-[11px] text-[var(--color-ink-500)]">
                Submitted{' '}
                {new Date(
                  shopUnderReview.verificationSubmittedAt,
                ).toLocaleString()}
              </p>
            ) : null}
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--color-ink-900)]">
              Documents
            </h3>
            <ShopReviewDocumentList
              verificationDocuments={verificationDocuments}
              shopVerificationService={shopVerificationService}
              isLoadingVerificationDocuments={isLoadingVerificationDocuments}
            />
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--color-ink-900)]">
              Reviewer notes
            </h3>
            <textarea
              rows={4}
              maxLength={decisionNotesCharacterLimit}
              value={draftDecisionNotes}
              onChange={(changeEvent) =>
                setDraftDecisionNotes(changeEvent.target.value)
              }
              placeholder="Add notes visible to the owner (required for rejection or requesting changes)."
              className="w-full rounded-[var(--radius-control)] border border-[var(--color-ink-200)] bg-white px-3 py-2 text-sm text-[var(--color-ink-900)] placeholder:text-[var(--color-ink-400)] focus:border-[var(--color-brand-500)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-200)]"
            />
            <p className="text-right text-[11px] text-[var(--color-ink-500)]">
              {draftDecisionNotes.length}/{decisionNotesCharacterLimit}
            </p>
          </section>
        </div>
      )}
    </Drawer>
  )
}
