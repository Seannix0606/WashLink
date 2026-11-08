import type { ReactElement } from 'react'
import type { OwnerJobApplicationTransition } from '../../../../domain/utilities/jobApplicationLifecycle'
import { Button, Modal } from '../../../design/ui'
import { ownerTransitionCopy } from '../../../utilities/jobApplicationDisplay'

interface ApplicantTransitionConfirmModalProps {
  readonly toStatus: OwnerJobApplicationTransition | null
  readonly applicantName: string
  readonly isSubmitting: boolean
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

/** Nothing is sent until the owner confirms here. */
export function ApplicantTransitionConfirmModal({
  toStatus,
  applicantName,
  isSubmitting,
  onConfirm,
  onCancel,
}: ApplicantTransitionConfirmModalProps): ReactElement {
  const transitionCopy = toStatus === null ? null : ownerTransitionCopy[toStatus]

  return (
    <Modal
      isOpen={transitionCopy !== null}
      onClose={onCancel}
      title={transitionCopy?.confirmTitle ?? ''}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant={transitionCopy?.isDestructive === true ? 'danger' : 'primary'}
            isLoading={isSubmitting}
            onClick={onConfirm}
          >
            {transitionCopy?.confirmButtonLabel ?? ''}
          </Button>
        </div>
      }
    >
      <div className="space-y-2 text-sm">
        <p className="font-medium break-words text-[var(--color-ink-900)]">{applicantName}</p>
        <p className="text-[var(--color-ink-700)]">{transitionCopy?.confirmMessage ?? ''}</p>
      </div>
    </Modal>
  )
}
