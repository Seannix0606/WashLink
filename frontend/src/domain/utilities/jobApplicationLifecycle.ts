import type { JobApplication, JobApplicationStatus } from '../models/JobApplication'
import type { JobOpeningStatus } from '../models/JobOpening'

/**
 * Mirrors the per-actor matrix of transition_job_application (W5c). The database is the
 * authority; these rules only decide which actions the UI offers. Nobody sets `closed`:
 * the system does that when the opening closes.
 */
export type WorkerJobApplicationAction = 'submit_draft' | 'delete_draft' | 'withdraw'

const workerActionsByStatus: Readonly<Record<JobApplicationStatus, readonly WorkerJobApplicationAction[]>> = {
  draft: ['submit_draft', 'delete_draft'],
  submitted: ['withdraw'],
  under_review: ['withdraw'],
  shortlisted: ['withdraw'],
  accepted: ['withdraw'],
  rejected: [],
  withdrawn: [],
  closed: [],
}

export function workerJobApplicationActions(
  status: JobApplicationStatus,
): readonly WorkerJobApplicationAction[] {
  return workerActionsByStatus[status]
}

/**
 * A "closed draft": the opening closed while the worker's draft was never sent (status
 * `closed`, submitted_at null, no snapshot). Only the worker sees it; it can only be deleted.
 */
export function isClosedDraft(application: Pick<JobApplication, 'status' | 'submittedAt'>): boolean {
  return application.status === 'closed' && application.submittedAt === null
}

/** Worker actions for one row; a closed draft can be deleted but never sent. */
export function workerActionsForApplication(
  application: Pick<JobApplication, 'status' | 'submittedAt'>,
): readonly WorkerJobApplicationAction[] {
  return isClosedDraft(application) ? ['delete_draft'] : workerJobApplicationActions(application.status)
}

/** Rows deleted (not withdrawn) by the worker: drafts, including closed drafts. */
export function isWorkerDeletableDraft(application: Pick<JobApplication, 'status' | 'submittedAt'>): boolean {
  return application.status === 'draft' || isClosedDraft(application)
}

const ownerTransitionsByStatus: Readonly<Record<JobApplicationStatus, readonly JobApplicationStatus[]>> = {
  draft: [],
  submitted: ['under_review', 'rejected'],
  under_review: ['shortlisted', 'accepted', 'rejected'],
  shortlisted: ['accepted', 'rejected'],
  accepted: [],
  rejected: [],
  withdrawn: [],
  closed: [],
}

export type OwnerJobApplicationTransition = 'under_review' | 'shortlisted' | 'accepted' | 'rejected'

/** Owner decisions are allowed only while the opening is published or paused. */
export function ownerJobApplicationTransitions(
  status: JobApplicationStatus,
  openingStatus: JobOpeningStatus,
): readonly OwnerJobApplicationTransition[] {
  if (openingStatus !== 'published' && openingStatus !== 'paused') {
    return []
  }
  return ownerTransitionsByStatus[status] as readonly OwnerJobApplicationTransition[]
}

export function isOwnerJobApplicationTransitionAllowed(
  fromStatus: JobApplicationStatus,
  toStatus: JobApplicationStatus,
  openingStatus: JobOpeningStatus,
): boolean {
  return (ownerJobApplicationTransitions(fromStatus, openingStatus) as readonly string[]).includes(
    toStatus,
  )
}

/** Submitted, under review or shortlisted: still waiting for a decision (counts toward the 50 limit). */
export function isJobApplicationOpen(status: JobApplicationStatus): boolean {
  return status === 'submitted' || status === 'under_review' || status === 'shortlisted'
}

/** While these hold, the owner sees the applicant profile (D-13). */
export const applicantProfileSharingStatuses: readonly JobApplicationStatus[] = [
  'submitted',
  'under_review',
  'shortlisted',
  'accepted',
]

export function isApplicantProfileShared(status: JobApplicationStatus): boolean {
  return applicantProfileSharingStatuses.includes(status)
}

const fractionalSecondsPattern = /\.(\d+)/

/** Microseconds since the epoch, keeping the full precision Postgres sends; NaN if unparseable. */
function toEpochMicroseconds(timestamp: string): number {
  const fractionMatch = fractionalSecondsPattern.exec(timestamp)
  const wholeSecondsTimestamp = timestamp.replace(fractionalSecondsPattern, '')
  const fractionMicroseconds =
    fractionMatch === null ? 0 : Number(fractionMatch[1].padEnd(6, '0').slice(0, 6))
  return Date.parse(wholeSecondsTimestamp) * 1000 + fractionMicroseconds
}

/** True when the opening's current updated_at is later than the one frozen in the snapshot. */
export function isOpeningEditedAfterApplying(
  snapshotJobOpeningUpdatedAt: string,
  currentJobOpeningUpdatedAt: string,
): boolean {
  const snapshotMicroseconds = toEpochMicroseconds(snapshotJobOpeningUpdatedAt)
  const currentMicroseconds = toEpochMicroseconds(currentJobOpeningUpdatedAt)
  if (Number.isNaN(snapshotMicroseconds) || Number.isNaN(currentMicroseconds)) {
    return snapshotJobOpeningUpdatedAt !== currentJobOpeningUpdatedAt
  }
  return currentMicroseconds > snapshotMicroseconds
}
