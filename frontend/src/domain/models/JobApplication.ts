import type {
  JobOpeningApplicantRequirement,
  JobOpeningContent,
  JobOpeningStatus,
} from './JobOpening'

export type JobApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'shortlisted'
  | 'accepted'
  | 'rejected'
  | 'withdrawn'
  | 'closed'

export const jobApplicationStatuses: readonly JobApplicationStatus[] = [
  'draft',
  'submitted',
  'under_review',
  'shortlisted',
  'accepted',
  'rejected',
  'withdrawn',
  'closed',
]

/**
 * The training and work notice the worker acknowledges when applying. Sent as
 * p_notice_version; the database refuses any other value ("Review the training and
 * work notice before applying."). Change it only together with the notice text.
 */
export const jobApplicationNoticeVersion = 'w5_v1'

/** Mirrors the CHECK constraints and apply limits of public.job_applications (W5b, W5c). */
export const jobApplicationLimits = {
  coverNoteMaxLength: 1000,
  /** Rows per (opening, worker), withdrawn ones included. */
  applicationsPerOpeningMaximum: 3,
  /** Submitted, under review or shortlisted applications per worker. */
  openApplicationsMaximum: 50,
  /** Worker "My applications" page size, most recently changed first. */
  ownListMaximum: 200,
} as const

/** Database message (55000) when the expected status or draft version is out of date. */
export const staleJobApplicationMessage = 'This application changed. Refresh and try again.'

/** In-app notification categories written by the W5 triggers (rendered generically). */
export const jobApplicationNotificationCategories = [
  'job_application.submitted',
  'job_application.status_changed',
  'job_application.withdrawn',
  'job_application.closed',
  'job_application.removed',
  'job_opening.paused',
] as const

/**
 * The opening exactly as it was when the worker submitted (write-once, P20).
 * Content keys match the W4 opening; the shop name and address are those of that moment.
 */
export interface JobApplicationOpeningSnapshot extends JobOpeningContent {
  readonly snapshotVersion: number
  /** updated_at of the opening when the snapshot was taken. */
  readonly jobOpeningUpdatedAt: string
  readonly shopName: string | null
  readonly shopAddress: string | null
}

export interface JobApplication {
  readonly id: string
  readonly jobOpeningId: string
  readonly shopId: string
  readonly status: JobApplicationStatus
  /** The worker's own words, plain text; never sent to notifications or audit. */
  readonly coverNote: string | null
  readonly noticeVersion: string | null
  readonly noticeAcknowledgedAt: string | null
  readonly submittedAt: string | null
  readonly decidedAt: string | null
  readonly withdrawnAt: string | null
  readonly closedAt: string | null
  readonly statusChangedAt: string | null
  /** Null for drafts. */
  readonly openingSnapshot: JobApplicationOpeningSnapshot | null
  readonly openingSnapshotTakenAt: string | null
  readonly createdAt: string
  /** Sent back unchanged as p_expected_updated_at when a draft is edited. */
  readonly updatedAt: string
}

/** The current version of an opening the worker applied to (readable after pause or close). */
export interface CurrentJobOpeningVersion {
  readonly jobOpeningId: string
  readonly status: JobOpeningStatus
  readonly title: string
  readonly applicantRequirement: JobOpeningApplicantRequirement | null
  readonly updatedAt: string
}

/** A worker's application with the current version of its opening, if still readable. */
export interface MyJobApplication {
  readonly application: JobApplication
  readonly currentOpening: CurrentJobOpeningVersion | null
}
