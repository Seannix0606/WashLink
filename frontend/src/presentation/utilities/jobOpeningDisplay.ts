import type {
  JobOpeningApplicantRequirement,
  JobOpeningCompensationPeriod,
  JobOpeningContent,
  JobOpeningJobType,
  JobOpeningStatus,
} from '../../domain/models/JobOpening'
import type { JobOpeningPublishField } from '../../domain/utilities/jobOpeningLifecycle'
import type { BadgeTone } from '../design/ui/Badge'

export interface JobOpeningStatusDisplay {
  readonly displayLabel: string
  readonly badgeTone: BadgeTone
  readonly helperText: string
}

const jobOpeningStatusDisplayByStatus: Readonly<Record<JobOpeningStatus, JobOpeningStatusDisplay>> = {
  draft: { displayLabel: 'Draft', badgeTone: 'neutral', helperText: 'Only you can see this draft.' },
  published: { displayLabel: 'Published', badgeTone: 'success', helperText: 'Workers can see this opening.' },
  paused: { displayLabel: 'Paused', badgeTone: 'warning', helperText: 'Hidden from workers until you resume it.' },
  closed: { displayLabel: 'Closed', badgeTone: 'danger', helperText: 'Closed for good. You can archive it.' },
  archived: { displayLabel: 'Archived', badgeTone: 'info', helperText: 'Kept for your records only.' },
}

export function describeJobOpeningStatus(status: JobOpeningStatus): JobOpeningStatusDisplay {
  return jobOpeningStatusDisplayByStatus[status]
}

/** Schedule category only; it does not decide an employment classification (W4-L2). */
export const jobTypeLabels: Readonly<Record<JobOpeningJobType, string>> = {
  full_time: 'Full time',
  part_time: 'Part time',
  temporary: 'Temporary',
  other: 'Other',
}

export const compensationPeriodLabels: Readonly<Record<JobOpeningCompensationPeriod, string>> = {
  hour: 'per hour',
  day: 'per day',
  week: 'per week',
  month: 'per month',
  per_task: 'per task',
}

/** Certifications are shop-issued, never government-recognized (W4-L5). */
export const applicantRequirementLabels: Readonly<Record<JobOpeningApplicantRequirement, string>> = {
  certification_required: 'Shop-issued certification required',
  trainees_welcome: 'Trainees welcome',
}

export const jobOpeningPublishFieldLabels: Readonly<Record<JobOpeningPublishField, string>> = {
  title: 'Title',
  description: 'Description',
  work_location: 'Work location',
  openings_count: 'Number of openings',
  job_type: 'Job type',
  applicant_requirement: 'Who can apply',
}

export const notSpecifiedByShopText = 'Not specified by the shop'

/** Neutral guidance for requirement fields; it makes no compliance claim. */
export const requirementsFairnessHelperText =
  "Describe the skills and experience the job needs. Don't include requirements about age, sex, civil status, religion or other personal characteristics unrelated to the work."

export function formatMinimumYearsExperience(minimumYears: number): string {
  return `At least ${String(minimumYears)} ${minimumYears === 1 ? 'year' : 'years'} of experience`
}

export function formatOwnListTruncationNotice(listMaximum: number): string {
  return `Showing the ${String(listMaximum)} most recently updated openings. Archived openings are not listed.`
}

export const jobOpeningDetailsDisclaimer =
  'Details as entered by the shop. WashLink does not verify pay or employment terms.'

const amountFormatter = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
})

/** Formats a stored numeric(10,2) value; it already has at most 2 decimals, so nothing is rounded. */
function formatStoredAmount(storedAmount: number): string {
  return amountFormatter.format(storedAmount)
}

type CompensationContent = Pick<
  JobOpeningContent,
  | 'compensationMinAmount'
  | 'compensationMaxAmount'
  | 'compensationCurrency'
  | 'compensationPeriod'
  | 'compensationDetails'
>

/** The stated amounts only (no owner wording); null when no amount and period are stored. */
export function formatCompensationAmountLine(compensation: CompensationContent): string | null {
  const { compensationMinAmount: minimumAmount, compensationMaxAmount: maximumAmount } = compensation
  if (compensation.compensationCurrency === null || compensation.compensationPeriod === null) {
    return null
  }
  const currency = compensation.compensationCurrency
  const periodLabel = compensationPeriodLabels[compensation.compensationPeriod]
  if (minimumAmount !== null && maximumAmount !== null) {
    return minimumAmount === maximumAmount
      ? `${currency} ${formatStoredAmount(minimumAmount)} ${periodLabel}`
      : `${currency} ${formatStoredAmount(minimumAmount)} - ${formatStoredAmount(maximumAmount)} ${periodLabel}`
  }
  if (minimumAmount !== null) {
    return `From ${currency} ${formatStoredAmount(minimumAmount)} ${periodLabel}`
  }
  if (maximumAmount !== null) {
    return `Up to ${currency} ${formatStoredAmount(maximumAmount)} ${periodLabel}`
  }
  return null
}

/**
 * Pay exactly as the shop entered it: the amount line (only from stored values, no
 * range invented from one value) and the owner's own words. Nothing entered gives
 * "Not specified by the shop".
 */
export function formatCompensationAsEntered(compensation: CompensationContent): readonly string[] {
  const compensationLines = [
    formatCompensationAmountLine(compensation),
    compensation.compensationDetails,
  ].filter((compensationLine): compensationLine is string => compensationLine !== null)
  return compensationLines.length > 0 ? compensationLines : [notSpecifiedByShopText]
}

const calendarDateFormatter = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

/** A YYYY-MM-DD calendar date shown as that same day, whatever the viewer's time zone. */
export function formatCalendarDate(calendarDate: string): string {
  const parsedDate = new Date(`${calendarDate}T00:00:00Z`)
  return Number.isNaN(parsedDate.getTime()) ? calendarDate : calendarDateFormatter.format(parsedDate)
}
