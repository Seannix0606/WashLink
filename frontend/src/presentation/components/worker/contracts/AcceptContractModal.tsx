import type { ReactElement } from 'react'
import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { AcceptConfirmations } from '../../../../application/services/WorkerContractResponseService'
import type { ContractVersionDocument } from '../../../../domain/models/WorkerContract'
import { Button, Modal } from '../../../design/ui'
import { shortContentHash } from '../../../utilities/contractTemplateDisplay'
import { acceptanceExplanationText, acceptanceRecordLabel } from '../../../utilities/workerContractCopy'
import { describeVersion } from '../../../utilities/workerContractDisplay'

interface AcceptContractModalProps {
  readonly contractDocument: ContractVersionDocument
  readonly shopName: string
  /** w9_worker_accept_v1 as stored; null when it could not be read (accepting is then not offered). */
  readonly acceptanceStatementText: string | null
  /** Shown only when the relationship type needs the extra acknowledgement. */
  readonly contractorStatementText: string | null
  readonly needsContractorAcknowledgement: boolean
  readonly isSubmitting: boolean
  readonly onConfirm: (confirmations: AcceptConfirmations) => void
  readonly onCancel: () => void
}

/** Accept exactly the version shown (its fingerprint goes to the server). A recorded acceptance, not an e-signature. */
export function AcceptContractModal({
  contractDocument,
  shopName,
  acceptanceStatementText,
  contractorStatementText,
  needsContractorAcknowledgement,
  isSubmitting,
  onConfirm,
  onCancel,
}: AcceptContractModalProps): ReactElement {
  const [isAcceptanceStatementConfirmed, setIsAcceptanceStatementConfirmed] = useState<boolean>(false)
  const [isContractorAcknowledged, setIsContractorAcknowledged] = useState<boolean>(false)
  const isReady =
    acceptanceStatementText !== null &&
    isAcceptanceStatementConfirmed &&
    (!needsContractorAcknowledgement || (contractorStatementText !== null && isContractorAcknowledged))
  return (
    <Modal isOpen onClose={onCancel} title={`Accept ${describeVersion(contractDocument.versionNumber, contractDocument.kind).toLowerCase()}`}>
      <div className="space-y-3 text-sm">
        <p className="font-medium text-[var(--color-ink-900)]">{shopName}</p>
        <p className="text-xs font-semibold text-[var(--color-warning-600)]">{acceptanceRecordLabel}</p>
        <p className="text-[var(--color-ink-700)]">{acceptanceExplanationText}</p>
        <p className="text-xs text-[var(--color-ink-500)]">{`You are accepting the text with fingerprint ${shortContentHash(contractDocument.contentHash)}.`}</p>
        {acceptanceStatementText === null ? (
          <p role="alert" className="text-[var(--color-danger-600)]">The acceptance statement could not be loaded. Try again later.</p>
        ) : (
          <label className="flex items-start gap-2 text-[var(--color-ink-900)]">
            <input
              type="checkbox"
              className="mt-1"
              checked={isAcceptanceStatementConfirmed}
              onChange={(changeEvent): void => {
                setIsAcceptanceStatementConfirmed(changeEvent.target.checked)
              }}
            />
            <span>{acceptanceStatementText}</span>
          </label>
        )}
        {needsContractorAcknowledgement ? (
          contractorStatementText === null ? (
            <p role="alert" className="text-[var(--color-danger-600)]">The relationship-type acknowledgement could not be loaded.</p>
          ) : (
            <label className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-warning-50)] p-2 text-[var(--color-ink-900)]">
              <input
                type="checkbox"
                className="mt-1"
                checked={isContractorAcknowledged}
                onChange={(changeEvent): void => {
                  setIsContractorAcknowledged(changeEvent.target.checked)
                }}
              />
              <span>{contractorStatementText}</span>
            </label>
          )
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            leadingIcon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            isLoading={isSubmitting}
            disabled={!isReady || isSubmitting}
            onClick={(): void => {
              onConfirm({ isAcceptanceStatementConfirmed, isContractorAcknowledged })
            }}
          >
            Accept this version
          </Button>
        </div>
      </div>
    </Modal>
  )
}
