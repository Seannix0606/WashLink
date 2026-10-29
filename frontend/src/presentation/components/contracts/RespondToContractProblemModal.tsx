import type { ReactElement } from 'react'
import { disputeStatementSchema } from '../../../application/validation/oversightSchemas'
import { contractDisputeLimits, type MyContractDispute } from '../../../domain/models/ContractDispute'
import {
  contractDisputeCategoryLabel,
  problemStatementGuidance,
  respondProblemButtonLabel,
  respondProblemIntro,
  respondProblemTitle,
  respondStatementLabel,
  washLinkCannotChangeContractText,
} from '../../utilities/contractDisputeCopy'
import { CertificationTextConfirmModal } from '../certifications/CertificationTextConfirmModal'

interface RespondToContractProblemModalProps {
  readonly dispute: MyContractDispute | null
  readonly isSubmitting: boolean
  readonly onSubmit: (dispute: MyContractDispute, statement: string) => Promise<boolean>
  readonly onClose: () => void
}

/** D-47: the other party adds its side once (20 to 1000 characters). */
export function RespondToContractProblemModal({ dispute, isSubmitting, onSubmit, onClose }: RespondToContractProblemModalProps): ReactElement {
  return (
    <CertificationTextConfirmModal
      isOpen={dispute !== null}
      title={respondProblemTitle}
      subjectText={dispute === null ? '' : `${contractDisputeCategoryLabel[dispute.category]}: ${dispute.statement}`}
      message={
        <div className="space-y-2">
          <p>{respondProblemIntro}</p>
          <p className="text-xs">{washLinkCannotChangeContractText}</p>
        </div>
      }
      textLabel={respondStatementLabel}
      guidanceText={problemStatementGuidance}
      textSchema={disputeStatementSchema}
      maximumLength={contractDisputeLimits.statementMaxLength}
      confirmButtonLabel={respondProblemButtonLabel}
      isDestructive={false}
      isSubmitting={isSubmitting}
      onConfirm={async (validStatement): Promise<boolean> => (dispute === null ? false : onSubmit(dispute, validStatement))}
      onCancel={onClose}
    />
  )
}
