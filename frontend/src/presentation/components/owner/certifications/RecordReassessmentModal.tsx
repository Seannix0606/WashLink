import type { ReactElement } from 'react'
import type { CertificationService } from '../../../../application/services/CertificationService'
import type { OwnerCertification, RecordCertificationReassessmentInput } from '../../../../domain/models/Certification'
import { Modal, Skeleton } from '../../../design/ui'
import { useReassessmentChecklist } from '../../../hooks/useCertificationSupportData'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { AssessmentSignOffModal } from '../../training/AssessmentSignOffModal'

interface RecordReassessmentModalProps {
  readonly certificationService: CertificationService
  readonly certification: OwnerCertification
  readonly isSubmitting: boolean
  readonly onSubmit: (reassessmentInput: RecordCertificationReassessmentInput) => Promise<boolean>
  readonly onClose: () => void
}

/** D-22 re-assessment against the original program checklist (owner or designated trainer). */
export function RecordReassessmentModal({
  certificationService,
  certification,
  isSubmitting,
  onSubmit,
  onClose,
}: RecordReassessmentModalProps): ReactElement {
  const { checklist, isLoadingChecklist, checklistErrorMessage, reloadChecklist } = useReassessmentChecklist(
    certificationService,
    certification.programId,
  )

  if (isLoadingChecklist || checklistErrorMessage !== null || checklist.length === 0) {
    return (
      <Modal isOpen onClose={onClose} title="Record re-assessment">
        {isLoadingChecklist ? (
          <div aria-busy="true" aria-label="Loading the assessment checklist">
            <Skeleton heightClassName="h-24" />
          </div>
        ) : (
          <LoadErrorNotice
            title="The checklist could not be loaded"
            errorMessage={checklistErrorMessage ?? 'This program has no assessment checklist.'}
            onRetry={(): void => {
              void reloadChecklist()
            }}
          />
        )}
      </Modal>
    )
  }

  return (
    <AssessmentSignOffModal
      isOpen
      dialogTitle="Record re-assessment"
      traineeName={`${certification.workerDisplayName} (${certification.certificationTitle})`}
      checklist={checklist}
      isCorrection={false}
      isSubmitting={isSubmitting}
      onSubmit={async (decision): Promise<boolean> =>
        onSubmit({
          certificationId: certification.certificationId,
          itemsMet: decision.itemsMet,
          result: decision.result,
          assessorComment: decision.assessorComment,
          failureReason: decision.failureReason,
        })
      }
      onClose={onClose}
    />
  )
}
