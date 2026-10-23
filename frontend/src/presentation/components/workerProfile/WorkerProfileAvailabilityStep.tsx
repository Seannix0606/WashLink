import type { ReactElement } from 'react'
import {
  workerAvailabilityStatuses,
  workerProfileLimits,
  type WorkerAvailabilityStatus,
} from '../../../domain/models/WorkerProfile'
import { Select } from '../../design/ui'
import { workerAvailabilityStatusOptions } from '../../utilities/workerProfileDisplay'
import type { WorkerProfileStepProps } from './workerProfileStepProps'
import { WorkerProfileTextArea } from './WorkerProfileTextArea'

function toAvailabilityStatus(selectedValue: string): WorkerAvailabilityStatus | '' {
  return workerAvailabilityStatuses.find((status) => status === selectedValue) ?? ''
}

export function WorkerProfileAvailabilityStep({
  draft,
  fieldErrors,
  onDraftChange,
}: WorkerProfileStepProps): ReactElement {
  return (
    <div className="space-y-4">
      <Select
        name="availabilityStatus"
        label="Availability"
        required
        options={workerAvailabilityStatusOptions}
        value={draft.availabilityStatus}
        errorText={fieldErrors.availabilityStatus}
        onChange={(changeEvent): void => {
          onDraftChange({
            availabilityStatus: toAvailabilityStatus(changeEvent.target.value),
          })
        }}
      />
      <WorkerProfileTextArea
        fieldName="availabilityNotes"
        label="Availability notes (optional)"
        placeholder="For example: mornings only on weekdays."
        rows={3}
        maximumLength={workerProfileLimits.availabilityNotesMaxLength}
        value={draft.availabilityNotes}
        errorText={fieldErrors.availabilityNotes}
        onValueChange={(nextValue): void => {
          onDraftChange({ availabilityNotes: nextValue })
        }}
      />
    </div>
  )
}
