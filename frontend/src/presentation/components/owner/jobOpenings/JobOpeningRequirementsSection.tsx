import type { ReactElement } from 'react'
import {
  jobOpeningApplicantRequirements,
  jobOpeningLimits as limits,
} from '../../../../domain/models/JobOpening'
import { Input, Select } from '../../../design/ui'
import {
  applicantRequirementLabels,
  requirementsFairnessHelperText,
} from '../../../utilities/jobOpeningDisplay'
import { WorkerProfileTagListInput } from '../../workerProfile/WorkerProfileTagListInput'
import { WorkerProfileTextArea } from '../../workerProfile/WorkerProfileTextArea'
import {
  neededToPublishSuffix,
  notSelectedOption,
  type JobOpeningSectionProps,
} from './jobOpeningSectionProps'

export function JobOpeningRequirementsSection({
  draft,
  fieldErrors,
  onFieldChange,
}: JobOpeningSectionProps): ReactElement {
  return (
    <fieldset className="space-y-4" aria-describedby="job-opening-requirements-guidance">
      <legend className="mb-2 text-sm font-semibold text-[var(--color-ink-900)]">Requirements</legend>
      <p id="job-opening-requirements-guidance" className="text-xs text-[var(--color-ink-500)]">
        {requirementsFairnessHelperText}
      </p>

      <Select
        id="job-opening-applicant-requirement"
        label={`Who can apply${neededToPublishSuffix}`}
        value={draft.applicantRequirement}
        errorText={fieldErrors.applicantRequirement}
        helperText="Certifications here are shop-issued, not government-recognized."
        options={[
          notSelectedOption,
          ...jobOpeningApplicantRequirements.map((applicantRequirement) => ({
            value: applicantRequirement,
            label: applicantRequirementLabels[applicantRequirement],
          })),
        ]}
        onChange={(changeEvent): void => {
          const selectedRequirement = jobOpeningApplicantRequirements.find(
            (applicantRequirement) => applicantRequirement === changeEvent.target.value,
          )
          onFieldChange('applicantRequirement', selectedRequirement ?? '')
        }}
      />

      <WorkerProfileTextArea
        fieldName="job-opening-certification-expectations"
        label="Certification expectations"
        value={draft.certificationExpectations}
        maximumLength={limits.certificationExpectationsMaxLength}
        errorText={fieldErrors.certificationExpectations}
        rows={2}
        onValueChange={(nextValue): void => {
          onFieldChange('certificationExpectations', nextValue)
        }}
      />

      <WorkerProfileTagListInput
        fieldName="job-opening-required-skills"
        label="Required skills"
        helperText="Skills the work needs. Add one at a time."
        placeholder="Type a skill and press Enter"
        tags={draft.requiredSkills}
        maximumTagCount={limits.requiredSkillsMaxCount}
        maximumTagLength={limits.requiredSkillMaxLength}
        errorText={fieldErrors.requiredSkills}
        onTagsChange={(nextSkills): void => {
          onFieldChange('requiredSkills', nextSkills)
        }}
      />

      <Input
        id="job-opening-minimum-years"
        label="Minimum years of experience"
        inputMode="numeric"
        value={draft.minimumYearsExperienceText}
        errorText={fieldErrors.minimumYearsExperience}
        helperText="Leave empty if experience is not required."
        onChange={(changeEvent): void => {
          onFieldChange('minimumYearsExperienceText', changeEvent.target.value)
        }}
      />

      <WorkerProfileTextArea
        fieldName="job-opening-experience-requirement"
        label="Experience requirement"
        value={draft.experienceRequirement}
        maximumLength={limits.experienceRequirementMaxLength}
        errorText={fieldErrors.experienceRequirement}
        rows={2}
        onValueChange={(nextValue): void => {
          onFieldChange('experienceRequirement', nextValue)
        }}
      />

      <WorkerProfileTextArea
        fieldName="job-opening-availability-requirement"
        label="Availability requirement"
        value={draft.availabilityRequirement}
        maximumLength={limits.availabilityRequirementMaxLength}
        errorText={fieldErrors.availabilityRequirement}
        rows={2}
        onValueChange={(nextValue): void => {
          onFieldChange('availabilityRequirement', nextValue)
        }}
      />

      <WorkerProfileTagListInput
        fieldName="job-opening-minimum-qualifications"
        label="Minimum qualifications"
        helperText="Work-related qualifications only. Add one at a time."
        placeholder="Type a qualification and press Enter"
        tags={draft.minimumQualifications}
        maximumTagCount={limits.qualificationsMaxCount}
        maximumTagLength={limits.qualificationMaxLength}
        errorText={fieldErrors.minimumQualifications}
        onTagsChange={(nextQualifications): void => {
          onFieldChange('minimumQualifications', nextQualifications)
        }}
      />

      <WorkerProfileTagListInput
        fieldName="job-opening-preferred-qualifications"
        label="Preferred qualifications"
        helperText="Work-related qualifications only. Add one at a time."
        placeholder="Type a qualification and press Enter"
        tags={draft.preferredQualifications}
        maximumTagCount={limits.qualificationsMaxCount}
        maximumTagLength={limits.qualificationMaxLength}
        errorText={fieldErrors.preferredQualifications}
        onTagsChange={(nextQualifications): void => {
          onFieldChange('preferredQualifications', nextQualifications)
        }}
      />

      <WorkerProfileTextArea
        fieldName="job-opening-required-training"
        label="Required training"
        value={draft.requiredTraining}
        maximumLength={limits.requiredTrainingMaxLength}
        errorText={fieldErrors.requiredTraining}
        rows={3}
        onValueChange={(nextValue): void => {
          onFieldChange('requiredTraining', nextValue)
        }}
      />
    </fieldset>
  )
}
