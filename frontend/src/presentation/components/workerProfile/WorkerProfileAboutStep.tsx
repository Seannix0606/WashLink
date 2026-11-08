import type { ReactElement } from 'react'
import { workerProfileLimits } from '../../../domain/models/WorkerProfile'
import { Input } from '../../design/ui'
import type { WorkerProfileStepProps } from './workerProfileStepProps'
import { WorkerProfileTextArea } from './WorkerProfileTextArea'

export function WorkerProfileAboutStep({
  draft,
  fieldErrors,
  onDraftChange,
}: WorkerProfileStepProps): ReactElement {
  return (
    <div className="space-y-4">
      <Input
        name="headline"
        label="Headline"
        required
        placeholder="Car wash attendant with detailing experience"
        maxLength={workerProfileLimits.headlineMaxLength}
        value={draft.headline}
        errorText={fieldErrors.headline}
        helperText="A short line that describes the work you do."
        onChange={(changeEvent): void => {
          onDraftChange({ headline: changeEvent.target.value })
        }}
      />
      <WorkerProfileTextArea
        fieldName="experienceSummary"
        label="Experience summary (optional)"
        placeholder="Where you have worked and what you are good at."
        maximumLength={workerProfileLimits.experienceSummaryMaxLength}
        value={draft.experienceSummary}
        errorText={fieldErrors.experienceSummary}
        onValueChange={(nextValue): void => {
          onDraftChange({ experienceSummary: nextValue })
        }}
      />
      <Input
        name="yearsOfExperience"
        label="Years of experience (optional)"
        type="number"
        inputMode="numeric"
        min={workerProfileLimits.yearsOfExperienceMinimum}
        max={workerProfileLimits.yearsOfExperienceMaximum}
        step={1}
        value={draft.yearsOfExperienceText}
        errorText={fieldErrors.yearsOfExperience}
        onChange={(changeEvent): void => {
          onDraftChange({ yearsOfExperienceText: changeEvent.target.value })
        }}
      />
    </div>
  )
}
