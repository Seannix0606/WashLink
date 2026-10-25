import type { ReactElement } from 'react'
import { Button, Modal } from '../../../design/ui'
import {
  jobOpeningActionCopy,
  type JobOpeningConfirmableAction,
} from '../../../utilities/jobOpeningActionDisplay'

interface JobOpeningTransitionConfirmModalProps {
  readonly action: JobOpeningConfirmableAction | null
  readonly jobOpeningTitle: string
  readonly isSubmitting: boolean
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

/** Nothing is sent until the owner confirms here. */
export function JobOpeningTransitionConfirmModal({
  action,
  jobOpeningTitle,
  isSubmitting,
  onConfirm,
  onCancel,
}: JobOpeningTransitionConfirmModalProps): ReactElement {
  const actionCopy = action === null ? null : jobOpeningActionCopy[action]

  return (
    <Modal
      isOpen={actionCopy !== null}
      onClose={onCancel}
      title={actionCopy?.confirmTitle ?? ''}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant={actionCopy?.isDestructive === true ? 'danger' : 'primary'}
            isLoading={isSubmitting}
            onClick={onConfirm}
          >
            {actionCopy?.confirmButtonLabel ?? ''}
          </Button>
        </div>
      }
    >
      <div className="space-y-2 text-sm">
        <p className="font-medium break-words text-[var(--color-ink-900)]">{jobOpeningTitle}</p>
        <p className="text-[var(--color-ink-700)]">{actionCopy?.confirmMessage ?? ''}</p>
      </div>
    </Modal>
  )
}
