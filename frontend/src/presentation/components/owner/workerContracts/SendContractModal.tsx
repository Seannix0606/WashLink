import type { ReactElement } from 'react'
import { useState } from 'react'
import { Send } from 'lucide-react'
import type { SendConfirmations } from '../../../../application/services/WorkerContractService'
import type { ContractDraftPreview, ContractFlagNotices, WorkerClassificationOption } from '../../../../domain/models/WorkerContract'
import { Button, Modal } from '../../../design/ui'
import { acceptanceExplanationText, sendIntroText } from '../../../utilities/workerContractCopy'
import { describeFlagCount, describeUnfilledItem } from '../../../utilities/workerContractDisplay'
import { ContractProblemTermFlags } from '../../contracts/ContractProblemTermFlags'

interface SendContractModalProps {
  readonly preview: ContractDraftPreview
  readonly classification: WorkerClassificationOption | undefined
  /** w9_owner_send_v1 as stored; null when it could not be read (sending is then not offered). */
  readonly offerStatementText: string | null
  readonly contractorStatementText: string | null
  readonly flagNotices: ContractFlagNotices | null
  readonly isSubmitting: boolean
  readonly onConfirm: (confirmations: SendConfirmations) => void
  readonly onCancel: () => void
}

interface CheckboxRowProps {
  readonly label: string
  readonly isChecked: boolean
  readonly onChange: (isChecked: boolean) => void
}

function CheckboxRow({ label, isChecked, onChange }: CheckboxRowProps): ReactElement {
  return (
    <label className="flex items-start gap-2 text-sm text-[var(--color-ink-900)]">
      <input
        type="checkbox"
        className="mt-1"
        checked={isChecked}
        onChange={(changeEvent): void => {
          onChange(changeEvent.target.checked)
        }}
      />
      <span>{label}</span>
    </label>
  )
}

/**
 * Send = seal the saved draft and record the owner's acceptance. The owner reviews the keyword
 * check (and confirms its current count), confirms the offer statement and, for independent
 * contractor, the extra acknowledgement. Flags never block sending.
 */
export function SendContractModal({
  preview,
  classification,
  offerStatementText,
  contractorStatementText,
  flagNotices,
  isSubmitting,
  onConfirm,
  onCancel,
}: SendContractModalProps): ReactElement {
  const [isFlagReviewConfirmed, setIsFlagReviewConfirmed] = useState<boolean>(false)
  const [isOfferStatementConfirmed, setIsOfferStatementConfirmed] = useState<boolean>(false)
  const [isContractorAcknowledged, setIsContractorAcknowledged] = useState<boolean>(false)
  const isContractorAcknowledgementNeeded = classification?.needsExtraAcknowledgement === true
  const hasUnfilled = preview.unfilled.length > 0
  const isReady =
    !hasUnfilled &&
    offerStatementText !== null &&
    isFlagReviewConfirmed &&
    isOfferStatementConfirmed &&
    (!isContractorAcknowledgementNeeded || (contractorStatementText !== null && isContractorAcknowledged))

  return (
    <Modal isOpen onClose={onCancel} title={`Send version ${String(preview.versionNumber)} to the worker`} maxWidthClassName="max-w-2xl">
      <div className="max-h-[70vh] space-y-4 overflow-y-auto text-sm">
        <p className="text-[var(--color-ink-700)]">{sendIntroText}</p>
        <p className="text-xs text-[var(--color-ink-500)]">{acceptanceExplanationText}</p>
        {hasUnfilled ? (
          <div role="alert" className="space-y-1 rounded-[var(--radius-control)] bg-[var(--color-danger-50)] p-3">
            <p className="font-medium text-[var(--color-danger-600)]">Fill in these items and save before sending:</p>
            <ul className="list-disc pl-5 text-[var(--color-ink-700)]">
              {preview.unfilled.map((unfilledItem) => (
                <li key={unfilledItem}>{describeUnfilledItem(unfilledItem, preview.clauses)}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <ContractProblemTermFlags flags={preview.flags} notices={flagNotices} />
        <fieldset className="space-y-2 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] p-3">
          <legend className="px-1 font-medium text-[var(--color-ink-900)]">Confirm before sending</legend>
          <CheckboxRow
            label={`I reviewed the keyword check (${describeFlagCount(preview.flagCount)}).`}
            isChecked={isFlagReviewConfirmed}
            onChange={setIsFlagReviewConfirmed}
          />
          {offerStatementText === null ? (
            <p role="alert" className="text-[var(--color-danger-600)]">The offer statement could not be loaded. Try again later.</p>
          ) : (
            <CheckboxRow label={offerStatementText} isChecked={isOfferStatementConfirmed} onChange={setIsOfferStatementConfirmed} />
          )}
          {isContractorAcknowledgementNeeded ? (
            contractorStatementText === null ? (
              <p role="alert" className="text-[var(--color-danger-600)]">The relationship-type acknowledgement could not be loaded.</p>
            ) : (
              <CheckboxRow label={contractorStatementText} isChecked={isContractorAcknowledged} onChange={setIsContractorAcknowledged} />
            )
          ) : null}
        </fieldset>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            leadingIcon={<Send className="h-4 w-4" aria-hidden="true" />}
            isLoading={isSubmitting}
            disabled={!isReady || isSubmitting}
            onClick={(): void => {
              onConfirm({ isFlagReviewConfirmed, isOfferStatementConfirmed, isContractorAcknowledged })
            }}
          >
            Send to the worker
          </Button>
        </div>
      </div>
    </Modal>
  )
}
