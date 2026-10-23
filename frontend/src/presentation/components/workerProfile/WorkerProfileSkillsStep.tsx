import type { ReactElement } from 'react'
import { workerProfileLimits } from '../../../domain/models/WorkerProfile'
import type { WorkerProfileStepProps } from './workerProfileStepProps'
import { WorkerProfileTagListInput } from './WorkerProfileTagListInput'

export function WorkerProfileSkillsStep({
  draft,
  fieldErrors,
  onDraftChange,
}: WorkerProfileStepProps): ReactElement {
  return (
    <div className="space-y-5">
      <WorkerProfileTagListInput
        fieldName="skills"
        label="Skills"
        helperText="For example: hand wash, interior cleaning, waxing. Press Enter to add."
        placeholder="Add a skill"
        tags={draft.skills}
        maximumTagCount={workerProfileLimits.skillsMaxCount}
        maximumTagLength={workerProfileLimits.skillMaxLength}
        errorText={fieldErrors.skills}
        onTagsChange={(nextSkills): void => {
          onDraftChange({ skills: nextSkills })
        }}
      />
      <WorkerProfileTagListInput
        fieldName="preferredLocations"
        label="Preferred work locations"
        helperText="Cities or areas where you would like to work."
        placeholder="Add a city or area"
        tags={draft.preferredLocations}
        maximumTagCount={workerProfileLimits.preferredLocationsMaxCount}
        maximumTagLength={workerProfileLimits.preferredLocationMaxLength}
        errorText={fieldErrors.preferredLocations}
        onTagsChange={(nextLocations): void => {
          onDraftChange({ preferredLocations: nextLocations })
        }}
      />
    </div>
  )
}
