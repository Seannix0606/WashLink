import type { ReactElement } from 'react'
import type { FormFieldErrors } from '../../../../application/validation/formFieldSchemas'
import type { TrainingProgramDraft } from '../../../../application/validation/trainingProgramDraft'
import { trainingProgramLimits as limits } from '../../../../domain/models/TrainingProgram'
import type { Shop } from '../../../../domain/models/Shop'
import { Input, Select } from '../../../design/ui'
import type { TrainingProgramDraftFieldChange } from '../../../hooks/useTrainingProgramEditor'
import { WorkerProfileTagListInput } from '../../workerProfile/WorkerProfileTagListInput'
import { WorkerProfileTextArea } from '../../workerProfile/WorkerProfileTextArea'

export interface TrainingProgramSectionProps {
  readonly draft: TrainingProgramDraft
  readonly fieldErrors: FormFieldErrors
  readonly onFieldChange: TrainingProgramDraftFieldChange
}

interface TrainingProgramBasicsSectionProps extends TrainingProgramSectionProps {
  readonly ownerShopList: readonly Shop[]
  /** The shop cannot change after the program is created. */
  readonly isShopSelectable: boolean
}

const neededToOpenSuffix = ' (needed to open)'

export function TrainingProgramBasicsSection({
  draft,
  fieldErrors,
  onFieldChange,
  ownerShopList,
  isShopSelectable,
}: TrainingProgramBasicsSectionProps): ReactElement {
  const selectedShop = ownerShopList.find((ownerShop) => ownerShop.id === draft.shopId) ?? null
  return (
    <fieldset className="space-y-4">
      <legend className="mb-2 text-sm font-semibold text-[var(--color-ink-900)]">Program</legend>
      {isShopSelectable ? (
        <Select
          id="training-program-shop"
          label="Shop"
          required
          value={draft.shopId}
          errorText={fieldErrors.shopId}
          options={[
            { value: '', label: 'Choose a shop' },
            ...ownerShopList.map((ownerShop) => ({ value: ownerShop.id, label: ownerShop.name })),
          ]}
          onChange={(changeEvent): void => {
            onFieldChange('shopId', changeEvent.target.value)
          }}
        />
      ) : (
        <p className="text-sm text-[var(--color-ink-700)]">
          <span className="font-medium text-[var(--color-ink-900)]">Shop: </span>
          {selectedShop?.name ?? 'Unknown shop'}
        </p>
      )}
      <Input
        id="training-program-title"
        label="Program title"
        required
        value={draft.title}
        maxLength={limits.titleMaxLength}
        errorText={fieldErrors.title}
        helperText={`${String(limits.titleMinLength)} to ${String(limits.titleMaxLength)} characters.`}
        onChange={(changeEvent): void => {
          onFieldChange('title', changeEvent.target.value)
        }}
      />
      <WorkerProfileTextArea
        fieldName="training-program-objectives"
        label={`Objectives${neededToOpenSuffix}`}
        value={draft.objectives}
        maximumLength={limits.objectivesMaxLength}
        errorText={fieldErrors.objectives}
        rows={4}
        onValueChange={(nextValue): void => {
          onFieldChange('objectives', nextValue)
        }}
      />
      <WorkerProfileTagListInput
        fieldName="training-program-skills"
        label="Skills the worker will learn"
        helperText="Add one skill at a time."
        placeholder="Type a skill and press Enter"
        tags={draft.skillsToLearn}
        maximumTagCount={limits.skillsMaxCount}
        maximumTagLength={limits.skillMaxLength}
        errorText={fieldErrors.skillsToLearn}
        onTagsChange={(nextSkills): void => {
          onFieldChange('skillsToLearn', nextSkills)
        }}
      />
      <Input
        id="training-program-days"
        label="Required training days"
        required
        inputMode="numeric"
        value={draft.minTrainingDaysText}
        errorText={fieldErrors.minTrainingDays}
        helperText="At least 3 distinct days of supervised training (3 to 30)."
        onChange={(changeEvent): void => {
          onFieldChange('minTrainingDaysText', changeEvent.target.value)
        }}
      />
      <WorkerProfileTagListInput
        fieldName="training-program-checklist"
        label={`Assessment checklist${neededToOpenSuffix}`}
        helperText="What the trainee must show in the competency assessment. 3 to 200 characters each."
        placeholder="Type a checklist item and press Enter"
        tags={draft.assessmentChecklist}
        maximumTagCount={limits.checklistMaxCount}
        maximumTagLength={limits.checklistItemMaxLength}
        errorText={fieldErrors.assessmentChecklist}
        onTagsChange={(nextChecklist): void => {
          onFieldChange('assessmentChecklist', nextChecklist)
        }}
      />
    </fieldset>
  )
}
