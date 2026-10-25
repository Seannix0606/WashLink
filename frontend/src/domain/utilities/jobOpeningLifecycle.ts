import type { JobOpening, JobOpeningContent, JobOpeningStatus } from '../models/JobOpening'

/**
 * Mirrors transition_job_opening (W4d). The database is the authority; this only
 * decides which actions the owner UI offers.
 */
const allowedTransitionsByStatus: Readonly<Record<JobOpeningStatus, readonly JobOpeningStatus[]>> = {
  draft: ['published'],
  published: ['paused', 'closed'],
  paused: ['published', 'closed'],
  closed: ['archived'],
  archived: [],
}

export function allowedJobOpeningTransitions(
  currentStatus: JobOpeningStatus,
): readonly JobOpeningStatus[] {
  return allowedTransitionsByStatus[currentStatus]
}

export function isJobOpeningTransitionAllowed(
  fromStatus: JobOpeningStatus,
  toStatus: JobOpeningStatus,
): boolean {
  return allowedTransitionsByStatus[fromStatus].includes(toStatus)
}

/** Closed and archived openings are read-only (guard: "Closed or archived job openings cannot be edited."). */
export function isJobOpeningContentEditable(status: JobOpeningStatus): boolean {
  return status === 'draft' || status === 'published' || status === 'paused'
}

/** Only drafts can be deleted (RLS jo_delete_owner_draft). */
export function isJobOpeningDeletable(status: JobOpeningStatus): boolean {
  return status === 'draft'
}

export type JobOpeningPublishField =
  | 'title'
  | 'description'
  | 'work_location'
  | 'openings_count'
  | 'job_type'
  | 'applicant_requirement'

/** Same names and order as job_opening_missing_publish_fields (W4c). */
export const jobOpeningPublishRequiredFields: readonly JobOpeningPublishField[] = [
  'title',
  'description',
  'work_location',
  'openings_count',
  'job_type',
  'applicant_requirement',
]

function isBlankText(value: string | null): boolean {
  return value === null || value.trim().length === 0
}

export function listMissingPublishFields(
  jobOpeningContent: JobOpeningContent,
): JobOpeningPublishField[] {
  const isMissingByField: Readonly<Record<JobOpeningPublishField, boolean>> = {
    title: isBlankText(jobOpeningContent.title),
    description: isBlankText(jobOpeningContent.description),
    work_location: isBlankText(jobOpeningContent.workLocation),
    openings_count: jobOpeningContent.openingsCount === null,
    job_type: jobOpeningContent.jobType === null,
    applicant_requirement: jobOpeningContent.applicantRequirement === null,
  }
  return jobOpeningPublishRequiredFields.filter((fieldName) => isMissingByField[fieldName])
}

const manilaCalendarDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today's calendar date in Asia/Manila as YYYY-MM-DD. */
export function toManilaCalendarDate(currentInstant: Date): string {
  return manilaCalendarDateFormatter.format(currentInstant)
}

/** Applications are accepted through the deadline day (Asia/Manila). */
export function isApplicationDeadlinePassed(
  applicationDeadline: string | null,
  currentInstant: Date,
): boolean {
  return applicationDeadline !== null && applicationDeadline < toManilaCalendarDate(currentInstant)
}

export type JobOpeningPublishReadiness =
  | { readonly kind: 'ready' }
  | { readonly kind: 'shop_not_verified' }
  | { readonly kind: 'missing_fields'; readonly missingFields: readonly JobOpeningPublishField[] }
  | { readonly kind: 'deadline_passed' }

/** Same checks, in the same order, as publishing or resuming in transition_job_opening. */
export function evaluateJobOpeningPublishReadiness(
  jobOpening: JobOpening,
  isShopVerifiedForPublishing: boolean,
  currentInstant: Date,
): JobOpeningPublishReadiness {
  if (!isShopVerifiedForPublishing) {
    return { kind: 'shop_not_verified' }
  }
  const missingFields = listMissingPublishFields(jobOpening)
  if (missingFields.length > 0) {
    return { kind: 'missing_fields', missingFields }
  }
  if (isApplicationDeadlinePassed(jobOpening.applicationDeadline, currentInstant)) {
    return { kind: 'deadline_passed' }
  }
  return { kind: 'ready' }
}
