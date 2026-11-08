import type { ReactElement } from 'react'
import { useState } from 'react'
import type { TrainingProgram } from '../../../../domain/models/TrainingProgram'
import { Button, Modal } from '../../../design/ui'
import {
  ownerAttestationCheckboxLabel,
  ownerAttestationFootnote,
  ownerAttestationText,
  ownerAttestationTitle,
} from '../../../utilities/trainingNoticeCopy'

interface OpenTrainingProgramConfirmModalProps {
  /** The draft to open; null closes the modal. */
  readonly program: TrainingProgram | null
  readonly isSubmitting: boolean
  readonly onConfirm: (program: TrainingProgram, hasConfirmedFreeTraining: boolean) => void
  readonly onCancel: () => void
}

interface OpenFormProps extends Omit<OpenTrainingProgramConfirmModalProps, 'program'> {
  readonly program: TrainingProgram
}

function OpenProgramForm({ program, isSubmitting, onConfirm, onCancel }: OpenFormProps): ReactElement {
  // Unchecked every time the modal opens; nothing is sent until the owner confirms.
  const [hasConfirmedFreeTraining, setHasConfirmedFreeTraining] = useState<boolean>(false)
  return (
    <div className="space-y-4 text-sm">
      <p className="font-medium break-words text-[var(--color-ink-900)]">{program.title}</p>
      <p className="text-[var(--color-ink-700)]">
        Opening freezes the program content. You can then invite applicants you accepted. Sessions can still be added or
        cancelled.
      </p>
      <section aria-label={ownerAttestationTitle} className="space-y-2 rounded-[var(--radius-control)] border border-[var(--color-brand-100)] bg-[var(--color-brand-50)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--color-brand-800)]">{ownerAttestationTitle}</h3>
        <p className="text-[var(--color-ink-700)]">{ownerAttestationText}</p>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={hasConfirmedFreeTraining}
            onChange={(changeEvent): void => {
              setHasConfirmedFreeTraining(changeEvent.target.checked)
            }}
          />
          <span>{ownerAttestationCheckboxLabel}</span>
        </label>
        <p className="text-xs text-[var(--color-ink-500)]">{ownerAttestationFootnote}</p>
      </section>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          disabled={!hasConfirmedFreeTraining}
          isLoading={isSubmitting}
          onClick={(): void => {
            onConfirm(program, hasConfirmedFreeTraining)
          }}
        >
          Open program
        </Button>
      </div>
    </div>
  )
}

/** Opening needs the owner's own free-training statement (w6_owner_v1). */
export function OpenTrainingProgramConfirmModal({ program, ...formProps }: OpenTrainingProgramConfirmModalProps): ReactElement {
  return (
    <Modal isOpen={program !== null} onClose={formProps.onCancel} title="Open this training program?" maxWidthClassName="max-w-lg">
      {program === null ? null : <OpenProgramForm key={program.id} program={program} {...formProps} />}
    </Modal>
  )
}
