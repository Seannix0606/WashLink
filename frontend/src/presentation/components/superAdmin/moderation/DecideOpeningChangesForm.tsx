import type { ReactElement } from 'react'
import type { ModerationDecisionRequest } from '../../../../application/services/JobOpeningModerationService'
import type { ModerationActionKind } from '../../../../domain/models/JobOpeningModeration'
import { decideChangesFormTitle } from '../../../utilities/jobOpeningModerationCopy'
import { ModerateOpeningForm } from './ModerateOpeningForm'

interface DecideOpeningChangesFormProps {
  /** The owner's optional note about what changed, exactly as written. */
  readonly ownerChangeNote: string | null
  readonly availableActions: readonly ModerationActionKind[]
  readonly isSubmitting: boolean
  readonly onDecide: (request: ModerationDecisionRequest) => Promise<boolean>
}

/** D-52: the owner edited a held opening and asked for a check: lift, keep the pause, or close. */
export function DecideOpeningChangesForm({ ownerChangeNote, availableActions, isSubmitting, onDecide }: DecideOpeningChangesFormProps): ReactElement {
  return (
    <div className="space-y-2">
      <p className="text-xs whitespace-pre-line break-words text-[var(--color-ink-700)]">
        {ownerChangeNote === null || ownerChangeNote.trim().length === 0 ? 'The owner added no note.' : `Owner’s note: ${ownerChangeNote}`}
      </p>
      <ModerateOpeningForm title={decideChangesFormTitle} availableActions={availableActions} isSubmitting={isSubmitting} onDecide={onDecide} />
    </div>
  )
}
