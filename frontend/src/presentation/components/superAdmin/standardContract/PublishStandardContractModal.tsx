import type { ReactElement } from 'react'
import { Scale } from 'lucide-react'
import { Button, Modal } from '../../../design/ui'
import { draftTemplateLabel } from '../../../utilities/contractTemplateCopy'
import {
  publishConfirmLabel,
  publishEffectText,
  publishModalTitle,
  standardChangeCountText,
  stillDraftForLegalReviewText,
} from '../../../utilities/standardContractCopy'

interface PublishStandardContractModalProps {
  readonly isOpen: boolean
  readonly baseVersionNumber: number
  readonly changedClauseCount: number
  readonly isPublishing: boolean
  readonly onConfirm: () => void
  readonly onClose: () => void
}

/** Confirms a new standard version: it stays a draft for legal review (D-28, W14-L11). */
export function PublishStandardContractModal({
  isOpen,
  baseVersionNumber,
  changedClauseCount,
  isPublishing,
  onConfirm,
  onClose,
}: PublishStandardContractModalProps): ReactElement {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={publishModalTitle}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={isPublishing} onClick={onConfirm}>
            {publishConfirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm text-[var(--color-ink-700)]">
        <p>{`Version ${String(baseVersionNumber + 1)} replaces version ${String(baseVersionNumber)} as the standard. ${standardChangeCountText(changedClauseCount)}.`}</p>
        <div role="note" aria-label={draftTemplateLabel} className="flex items-start gap-2 rounded-[var(--radius-control)] border border-[var(--color-warning-500)] bg-[var(--color-warning-50)] px-3 py-2">
          <Scale className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning-600)]" aria-hidden="true" />
          <span className="space-y-1">
            <span className="block font-semibold text-[var(--color-ink-900)]">{draftTemplateLabel}</span>
            <span className="block">{stillDraftForLegalReviewText}</span>
          </span>
        </div>
        <p>{publishEffectText}</p>
      </div>
    </Modal>
  )
}
