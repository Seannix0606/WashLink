import type { ReactElement, ReactNode } from 'react'
import { useState } from 'react'
import { trainingSessionLimits } from '../../../domain/models/TrainingSession'
import { Button, Modal } from '../../design/ui'
import { WorkerProfileTextArea } from '../workerProfile/WorkerProfileTextArea'

interface TrainingConfirmModalProps {
  readonly isOpen: boolean
  readonly title: string
  readonly subjectText: string
  readonly message: ReactNode
  readonly confirmButtonLabel: string
  readonly isDestructive: boolean
  readonly isSubmitting: boolean
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

/** Nothing is sent until the person confirms here (irreversible training actions). */
export function TrainingConfirmModal({
  isOpen,
  title,
  subjectText,
  message,
  confirmButtonLabel,
  isDestructive,
  isSubmitting,
  onConfirm,
  onCancel,
}: TrainingConfirmModalProps): ReactElement {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant={isDestructive ? 'danger' : 'primary'} isLoading={isSubmitting} onClick={onConfirm}>
            {confirmButtonLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-2 text-sm">
        <p className="font-medium break-words text-[var(--color-ink-900)]">{subjectText}</p>
        <div className="text-[var(--color-ink-700)]">{message}</div>
      </div>
    </Modal>
  )
}

interface ReasonConfirmModalProps extends Omit<TrainingConfirmModalProps, 'onConfirm'> {
  /** When false the reason is optional (for example withdrawing an invitation). */
  readonly isReasonRequired: boolean
  readonly reasonLabel: string
  readonly onConfirm: (reason: string) => void
}

type ReasonFormProps = Omit<ReasonConfirmModalProps, 'isOpen' | 'title'>

function ReasonForm({
  subjectText,
  message,
  confirmButtonLabel,
  isDestructive,
  isSubmitting,
  isReasonRequired,
  reasonLabel,
  onConfirm,
  onCancel,
}: ReasonFormProps): ReactElement {
  const [reason, setReason] = useState<string>('')
  const [reasonError, setReasonError] = useState<string | undefined>(undefined)
  const { reasonMinLength, reasonMaxLength } = trainingSessionLimits

  const confirmWithReason = (): void => {
    const trimmedReason = reason.trim()
    const isReasonGiven = trimmedReason.length > 0
    if ((isReasonRequired || isReasonGiven) && (trimmedReason.length < reasonMinLength || trimmedReason.length > reasonMaxLength)) {
      setReasonError('Give a reason of 10 to 300 characters.')
      return
    }
    setReasonError(undefined)
    onConfirm(trimmedReason)
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="font-medium break-words text-[var(--color-ink-900)]">{subjectText}</p>
      <div className="text-[var(--color-ink-700)]">{message}</div>
      <WorkerProfileTextArea
        fieldName="training-action-reason"
        label={reasonLabel}
        value={reason}
        maximumLength={reasonMaxLength}
        errorText={reasonError}
        rows={3}
        onValueChange={setReason}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Keep it
        </Button>
        <Button variant={isDestructive ? 'danger' : 'primary'} isLoading={isSubmitting} onClick={confirmWithReason}>
          {confirmButtonLabel}
        </Button>
      </div>
    </div>
  )
}

/** A confirmation that also asks for a reason of 10 to 300 characters. */
export function ReasonConfirmModal({ isOpen, title, ...formProps }: ReasonConfirmModalProps): ReactElement {
  return (
    <Modal isOpen={isOpen} onClose={formProps.onCancel} title={title}>
      {isOpen ? <ReasonForm {...formProps} /> : null}
    </Modal>
  )
}
