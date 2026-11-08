import type { ReactElement } from 'react'
import { useId, useState } from 'react'
import type { ShopVerificationService } from '../../../../application/services/ShopVerificationService'
import { firstModerationIssue, rereviewDecisionSchema, rereviewNotesSchema } from '../../../../application/validation/moderationSchemas'
import { adminOversightLimits, shopRereviewDecisions, type UnreviewedApprovedShop } from '../../../../domain/models/AdminOversight'
import { Button, Drawer, Select } from '../../../design/ui'
import { useShopVerificationDocuments } from '../../../hooks/useShopVerificationDocuments'
import {
  rereviewConfirmHelpText,
  rereviewDecisionFieldLabel,
  rereviewDecisionLabel,
  rereviewDrawerTitle,
  rereviewNotesFieldLabel,
  rereviewSubmitLabel,
  reviewerStateLabel,
} from '../../../utilities/adminOversightCopy'
import { WorkerProfileTextArea } from '../../workerProfile/WorkerProfileTextArea'
import { ShopReviewDocumentList } from '../ShopReviewDocumentList'

interface RereviewShopDrawerProps {
  readonly shop: UnreviewedApprovedShop | null
  readonly shopVerificationService: ShopVerificationService
  readonly isSubmitting: boolean
  /** Resolves true when the review was recorded. */
  readonly onRereview: (shopId: string, decision: string, notes: string) => Promise<boolean>
  readonly onClose: () => void
}

interface FieldErrors {
  readonly decision?: string
  readonly notes?: string
}

const decisionOptions = [
  { value: '', label: 'Choose one' },
  ...shopRereviewDecisions.map((decision) => ({ value: decision, label: rereviewDecisionLabel[decision] })),
]

interface RereviewBodyProps {
  readonly shop: UnreviewedApprovedShop
  readonly shopVerificationService: ShopVerificationService
  readonly isSubmitting: boolean
  readonly onRereview: (shopId: string, decision: string, notes: string) => Promise<boolean>
  readonly onClose: () => void
}

function RereviewBody({ shop, shopVerificationService, isSubmitting, onRereview, onClose }: RereviewBodyProps): ReactElement {
  const fieldId = useId()
  const [decisionInput, setDecisionInput] = useState<string>('')
  const [notesInput, setNotesInput] = useState<string>('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const { verificationDocuments, isLoadingVerificationDocuments } = useShopVerificationDocuments({
    shopVerificationService,
    shopIdentifier: shop.shopId,
  })
  const isConfirm = decisionInput === 'confirm_approval'

  const submitReview = async (): Promise<void> => {
    const nextErrors: FieldErrors = {
      decision: firstModerationIssue(rereviewDecisionSchema, decisionInput),
      notes: decisionInput.length > 0 && !isConfirm ? firstModerationIssue(rereviewNotesSchema, notesInput) : undefined,
    }
    setFieldErrors(nextErrors)
    if (nextErrors.decision !== undefined || nextErrors.notes !== undefined) {
      return
    }
    if (await onRereview(shop.shopId, decisionInput, isConfirm ? '' : notesInput)) {
      onClose()
    }
  }

  return (
    <div className="space-y-4 text-xs text-[var(--color-ink-700)]">
      <section aria-label="Shop" className="space-y-1">
        <p className="text-sm font-semibold break-words text-[var(--color-ink-900)]">{shop.shopName}</p>
        <p className="break-words">{`Owner: ${shop.ownerDisplayName}${shop.isActive ? '' : ' · inactive'}`}</p>
        <p>{reviewerStateLabel[shop.reviewerState]}</p>
      </section>
      <section aria-label="Verification documents" className="space-y-2">
        <h3 className="text-xs font-semibold tracking-wide text-[var(--color-ink-500)] uppercase">Verification documents</h3>
        <ShopReviewDocumentList
          verificationDocuments={verificationDocuments}
          shopVerificationService={shopVerificationService}
          isLoadingVerificationDocuments={isLoadingVerificationDocuments}
        />
      </section>
      <form
        aria-label="Review this approved shop"
        noValidate
        className="space-y-3"
        onSubmit={(submitEvent): void => {
          submitEvent.preventDefault()
          void submitReview()
        }}
      >
        <Select
          id={`${fieldId}-decision`}
          name="rereview-decision"
          label={rereviewDecisionFieldLabel}
          required
          options={decisionOptions}
          value={decisionInput}
          errorText={fieldErrors.decision}
          onChange={(changeEvent): void => {
            setDecisionInput(changeEvent.target.value)
          }}
        />
        {isConfirm ? (
          <p>{rereviewConfirmHelpText}</p>
        ) : (
          <WorkerProfileTextArea
            fieldName={`${fieldId}-notes`}
            label={rereviewNotesFieldLabel}
            value={notesInput}
            maximumLength={adminOversightLimits.rereviewNotesMaxLength}
            errorText={fieldErrors.notes}
            rows={4}
            onValueChange={setNotesInput}
          />
        )}
        <Button type="submit" isLoading={isSubmitting}>
          {rereviewSubmitLabel}
        </Button>
      </form>
    </div>
  )
}

/** D-56: confirm (stamps the reviewer, status unchanged), request changes or reject an approved shop. */
export function RereviewShopDrawer({ shop, shopVerificationService, isSubmitting, onRereview, onClose }: RereviewShopDrawerProps): ReactElement {
  return (
    <Drawer isOpen={shop !== null} onClose={onClose} title={rereviewDrawerTitle} description="Approved without a recorded review">
      {shop !== null ? (
        <RereviewBody
          key={shop.shopId}
          shop={shop}
          shopVerificationService={shopVerificationService}
          isSubmitting={isSubmitting}
          onRereview={onRereview}
          onClose={onClose}
        />
      ) : null}
    </Drawer>
  )
}
