import type { ReactElement } from 'react'
import { MapPin } from 'lucide-react'
import { jobOpeningJobTypes, jobOpeningLimits as limits } from '../../../../domain/models/JobOpening'
import type { Shop } from '../../../../domain/models/Shop'
import { Button, Input, Select } from '../../../design/ui'
import { jobTypeLabels } from '../../../utilities/jobOpeningDisplay'
import { WorkerProfileTagListInput } from '../../workerProfile/WorkerProfileTagListInput'
import { WorkerProfileTextArea } from '../../workerProfile/WorkerProfileTextArea'
import {
  neededToPublishSuffix,
  notSelectedOption,
  type JobOpeningSectionProps,
} from './jobOpeningSectionProps'

interface JobOpeningBasicsSectionProps extends JobOpeningSectionProps {
  readonly ownerShopList: readonly Shop[]
  /** The shop cannot change after the opening is created. */
  readonly isShopSelectable: boolean
}

export function JobOpeningBasicsSection({
  draft,
  fieldErrors,
  onFieldChange,
  ownerShopList,
  isShopSelectable,
}: JobOpeningBasicsSectionProps): ReactElement {
  const selectedShop = ownerShopList.find((ownerShop) => ownerShop.id === draft.shopId) ?? null

  return (
    <fieldset className="space-y-4">
      <legend className="mb-2 text-sm font-semibold text-[var(--color-ink-900)]">Basics</legend>

      {isShopSelectable ? (
        <Select
          id="job-opening-shop"
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
        id="job-opening-title"
        label="Job title"
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
        fieldName="job-opening-description"
        label={`Description${neededToPublishSuffix}`}
        value={draft.description}
        maximumLength={limits.descriptionMaxLength}
        errorText={fieldErrors.description}
        rows={5}
        onValueChange={(nextValue): void => {
          onFieldChange('description', nextValue)
        }}
      />

      <WorkerProfileTagListInput
        fieldName="job-opening-duties"
        label="Duties"
        helperText="Add one duty at a time."
        placeholder="Type a duty and press Enter"
        tags={draft.duties}
        maximumTagCount={limits.dutiesMaxCount}
        maximumTagLength={limits.dutyMaxLength}
        errorText={fieldErrors.duties}
        onTagsChange={(nextDuties): void => {
          onFieldChange('duties', nextDuties)
        }}
      />

      <div className="space-y-2">
        <Input
          id="job-opening-work-location"
          label={`Work location${neededToPublishSuffix}`}
          value={draft.workLocation}
          maxLength={limits.workLocationMaxLength}
          errorText={fieldErrors.workLocation}
          onChange={(changeEvent): void => {
            onFieldChange('workLocation', changeEvent.target.value)
          }}
        />
        {selectedShop !== null ? (
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<MapPin className="h-4 w-4" />}
            onClick={(): void => {
              onFieldChange('workLocation', selectedShop.address.slice(0, limits.workLocationMaxLength))
            }}
          >
            Use shop address
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          id="job-opening-openings-count"
          label={`Number of openings${neededToPublishSuffix}`}
          inputMode="numeric"
          value={draft.openingsCountText}
          errorText={fieldErrors.openingsCount}
          helperText={`${String(limits.openingsCountMinimum)} to ${String(limits.openingsCountMaximum)}.`}
          onChange={(changeEvent): void => {
            onFieldChange('openingsCountText', changeEvent.target.value)
          }}
        />
        <Select
          id="job-opening-job-type"
          label={`Job type${neededToPublishSuffix}`}
          value={draft.jobType}
          errorText={fieldErrors.jobType}
          helperText="A schedule category, not an employment classification."
          options={[
            notSelectedOption,
            ...jobOpeningJobTypes.map((jobType) => ({ value: jobType, label: jobTypeLabels[jobType] })),
          ]}
          onChange={(changeEvent): void => {
            const selectedJobType = jobOpeningJobTypes.find((jobType) => jobType === changeEvent.target.value)
            onFieldChange('jobType', selectedJobType ?? '')
          }}
        />
      </div>
    </fieldset>
  )
}
