import type { ReactElement } from 'react'
import { jobOpeningLimits as limits } from '../../../../domain/models/JobOpening'
import { Input } from '../../../design/ui'
import { WorkerProfileTextArea } from '../../workerProfile/WorkerProfileTextArea'
import type { JobOpeningSectionProps } from './jobOpeningSectionProps'

export function JobOpeningApplicationSection({
  draft,
  fieldErrors,
  onFieldChange,
}: JobOpeningSectionProps): ReactElement {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-2 text-sm font-semibold text-[var(--color-ink-900)]">Applications</legend>

      <Input
        id="job-opening-application-deadline"
        type="date"
        label="Application deadline"
        value={draft.applicationDeadline}
        errorText={fieldErrors.applicationDeadline}
        helperText="Applications are accepted through this date (Philippine time). Optional."
        onChange={(changeEvent): void => {
          onFieldChange('applicationDeadline', changeEvent.target.value)
        }}
      />

      <WorkerProfileTextArea
        fieldName="job-opening-application-instructions"
        label="Application instructions"
        value={draft.applicationInstructions}
        maximumLength={limits.applicationInstructionsMaxLength}
        errorText={fieldErrors.applicationInstructions}
        rows={3}
        onValueChange={(nextValue): void => {
          onFieldChange('applicationInstructions', nextValue)
        }}
      />
    </fieldset>
  )
}
