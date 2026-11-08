import type { ReactElement } from 'react'
import type { JobApplication } from '../../../../domain/models/JobApplication'
import { Button, Modal } from '../../../design/ui'
import { describeWorkerWithdrawAction } from '../../../utilities/jobApplicationDisplay'

interface WithdrawApplicationConfirmModalProps {
  readonly application: JobApplication | null
  readonly openingTitle: string
  readonly isSubmitting: boolean
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

/** Nothing is sent until the worker confirms ("Decline" for an accepted application). */
export function WithdrawApplicationConfirmModal({
  application,
  openingTitle,
  isSubmitting,
  onConfirm,
  onCancel,
}: WithdrawApplicationConfirmModalProps): ReactElement {
  const withdrawCopy = application === null ? null : describeWorkerWithdrawAction(application)

  return (
    <Modal
      isOpen={withdrawCopy !== null}
      onClose={onCancel}
      title={withdrawCopy?.confirmTitle ?? ''}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="danger" isLoading={isSubmitting} onClick={onConfirm}>
            {withdrawCopy?.confirmButtonLabel ?? ''}
          </Button>
        </div>
      }
    >
      <div className="space-y-2 text-sm">
        <p className="font-medium break-words text-[var(--color-ink-900)]">{openingTitle}</p>
        <p className="text-[var(--color-ink-700)]">{withdrawCopy?.confirmMessage ?? ''}</p>
      </div>
    </Modal>
  )
}
