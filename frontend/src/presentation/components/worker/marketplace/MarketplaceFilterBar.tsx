import type { ReactElement, SyntheticEvent } from 'react'
import { useState } from 'react'
import { Search, X } from 'lucide-react'
import {
  emptyMarketplaceFilterDraft,
  parseMarketplaceFilterDraft,
  type MarketplaceFilterDraft,
} from '../../../../application/validation/marketplaceFilterDraft'
import type { MarketplaceSearchFilters } from '../../../../domain/models/MarketplaceJobOpening'
import { Button, Input, Select, type SelectOption } from '../../../design/ui'
import {
  applicantRequirementLabels,
  compensationPeriodLabels,
  jobTypeLabels,
} from '../../../utilities/jobOpeningDisplay'

function toOptions(anyLabel: string, labels: Readonly<Record<string, string>>): readonly SelectOption[] {
  return [
    { value: '', label: anyLabel },
    ...Object.entries(labels).map(([value, label]) => ({ value, label })),
  ]
}

const jobTypeOptions = toOptions('Any job type', jobTypeLabels)
const applicantRequirementOptions = toOptions('Anyone', applicantRequirementLabels)
const payPeriodOptions = toOptions('Choose a period', compensationPeriodLabels)
const payStatedOptions: readonly SelectOption[] = [
  { value: '', label: 'Pay stated or not' },
  { value: 'stated', label: 'Pay stated' },
  { value: 'not_stated', label: 'No pay stated' },
]

interface MarketplaceFilterBarProps {
  readonly isSearching: boolean
  readonly onSearch: (marketplaceSearchFilters: MarketplaceSearchFilters) => void
}

/** Search and filters. Pay filters compare stated amounts only, in the same period. */
export function MarketplaceFilterBar({ isSearching, onSearch }: MarketplaceFilterBarProps): ReactElement {
  const [filterDraft, setFilterDraft] = useState<MarketplaceFilterDraft>(emptyMarketplaceFilterDraft)
  const [fieldError, setFieldError] = useState<{ fieldName: string; errorMessage: string } | null>(null)

  const updateField = (fieldName: keyof MarketplaceFilterDraft, nextValue: string): void => {
    setFilterDraft((previousDraft) => ({ ...previousDraft, [fieldName]: nextValue }))
    setFieldError(null)
  }
  const errorFor = (fieldName: string): string | undefined =>
    fieldError?.fieldName === fieldName ? fieldError.errorMessage : undefined

  const submitFilters = (submitEvent: SyntheticEvent<HTMLFormElement>): void => {
    submitEvent.preventDefault()
    const parsedDraft = parseMarketplaceFilterDraft(filterDraft)
    if (!parsedDraft.isValid) {
      setFieldError({ fieldName: parsedDraft.fieldName, errorMessage: parsedDraft.errorMessage })
      return
    }
    onSearch(parsedDraft.filters)
  }

  const clearFilters = (): void => {
    setFilterDraft(emptyMarketplaceFilterDraft)
    setFieldError(null)
    const parsedDraft = parseMarketplaceFilterDraft(emptyMarketplaceFilterDraft)
    if (parsedDraft.isValid) {
      onSearch(parsedDraft.filters)
    }
  }

  return (
    <form role="search" aria-label="Search job openings" className="space-y-3" onSubmit={submitFilters} noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          id="marketplace-query"
          name="marketplace-query"
          label="Search"
          placeholder="Job title or keyword"
          value={filterDraft.query}
          errorText={errorFor('query')}
          leadingIcon={<Search className="h-4 w-4" aria-hidden="true" />}
          onChange={(changeEvent): void => {
            updateField('query', changeEvent.target.value)
          }}
        />
        <Input
          id="marketplace-location"
          name="marketplace-location"
          label="Location"
          placeholder="City or area"
          value={filterDraft.location}
          errorText={errorFor('location')}
          onChange={(changeEvent): void => {
            updateField('location', changeEvent.target.value)
          }}
        />
        <Select
          id="marketplace-job-type"
          name="marketplace-job-type"
          label="Job type"
          options={jobTypeOptions}
          value={filterDraft.jobType}
          onChange={(changeEvent): void => {
            updateField('jobType', changeEvent.target.value)
          }}
        />
        <Select
          id="marketplace-applicant-requirement"
          name="marketplace-applicant-requirement"
          label="Who can apply"
          options={applicantRequirementOptions}
          value={filterDraft.applicantRequirement}
          onChange={(changeEvent): void => {
            updateField('applicantRequirement', changeEvent.target.value)
          }}
        />
        <Input
          id="marketplace-skill"
          name="marketplace-skill"
          label="Skill"
          placeholder="For example: buffing"
          value={filterDraft.requiredSkill}
          errorText={errorFor('requiredSkill')}
          onChange={(changeEvent): void => {
            updateField('requiredSkill', changeEvent.target.value)
          }}
        />
        <Select
          id="marketplace-pay-stated"
          name="marketplace-pay-stated"
          label="Pay"
          options={payStatedOptions}
          value={filterDraft.payStated}
          onChange={(changeEvent): void => {
            updateField('payStated', changeEvent.target.value)
          }}
        />
        <Input
          id="marketplace-min-pay"
          name="marketplace-min-pay"
          label="At least (PHP)"
          inputMode="decimal"
          placeholder="Amount"
          value={filterDraft.minPayAmount}
          errorText={errorFor('minPayAmount')}
          helperText="Compares the amount the shop stated. Nothing is converted or estimated."
          onChange={(changeEvent): void => {
            updateField('minPayAmount', changeEvent.target.value)
          }}
        />
        <Select
          id="marketplace-pay-period"
          name="marketplace-pay-period"
          label="Per period"
          options={payPeriodOptions}
          value={filterDraft.payPeriod}
          errorText={errorFor('payPeriod')}
          onChange={(changeEvent): void => {
            updateField('payPeriod', changeEvent.target.value)
          }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" isLoading={isSearching} leadingIcon={<Search className="h-4 w-4" />}>
          Search
        </Button>
        <Button type="button" size="sm" variant="ghost" leadingIcon={<X className="h-4 w-4" />} onClick={clearFilters}>
          Clear filters
        </Button>
      </div>
    </form>
  )
}
