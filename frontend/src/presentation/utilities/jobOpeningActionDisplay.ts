import type { JobOpening, JobOpeningStatus } from '../../domain/models/JobOpening'
import {
  allowedJobOpeningTransitions,
  evaluateJobOpeningPublishReadiness,
  type JobOpeningPublishReadiness,
} from '../../domain/utilities/jobOpeningLifecycle'
import { jobOpeningPublishFieldLabels } from './jobOpeningDisplay'

export type JobOpeningTransitionAction = 'publish' | 'resume' | 'pause' | 'close' | 'archive'

/** Every action that needs an explicit confirmation before anything is sent. */
export type JobOpeningConfirmableAction = JobOpeningTransitionAction | 'delete' | 'save_published'

export function toTransitionAction(
  fromStatus: JobOpeningStatus,
  toStatus: JobOpeningStatus,
): JobOpeningTransitionAction {
  switch (toStatus) {
    case 'published':
      return fromStatus === 'paused' ? 'resume' : 'publish'
    case 'paused':
      return 'pause'
    case 'closed':
      return 'close'
    case 'archived':
      return 'archive'
    case 'draft':
      throw new Error('Job openings cannot return to draft.')
  }
}

export const targetStatusByTransitionAction: Readonly<
  Record<JobOpeningTransitionAction, JobOpeningStatus>
> = {
  publish: 'published',
  resume: 'published',
  pause: 'paused',
  close: 'closed',
  archive: 'archived',
}

export interface JobOpeningActionCopy {
  readonly buttonLabel: string
  readonly confirmTitle: string
  readonly confirmMessage: string
  readonly confirmButtonLabel: string
  readonly isDestructive: boolean
  readonly successMessage: string
}

export const jobOpeningActionCopy: Readonly<Record<JobOpeningConfirmableAction, JobOpeningActionCopy>> = {
  publish: {
    buttonLabel: 'Publish',
    confirmTitle: 'Publish this job opening?',
    confirmMessage: 'Workers will be able to see this opening.',
    confirmButtonLabel: 'Publish',
    isDestructive: false,
    successMessage: 'Job opening published.',
  },
  resume: {
    buttonLabel: 'Resume',
    confirmTitle: 'Resume this job opening?',
    confirmMessage: 'Workers will be able to see this opening again.',
    confirmButtonLabel: 'Resume',
    isDestructive: false,
    successMessage: 'Job opening resumed.',
  },
  pause: {
    buttonLabel: 'Pause',
    confirmTitle: 'Pause this job opening?',
    confirmMessage: 'Hidden from workers until you resume it.',
    confirmButtonLabel: 'Pause',
    isDestructive: false,
    successMessage: 'Job opening paused.',
  },
  close: {
    buttonLabel: 'Close',
    confirmTitle: 'Close this job opening?',
    confirmMessage: 'Closing is final. It cannot be reopened; you can archive it later.',
    confirmButtonLabel: 'Close opening',
    isDestructive: true,
    successMessage: 'Job opening closed.',
  },
  archive: {
    buttonLabel: 'Archive',
    confirmTitle: 'Archive this job opening?',
    confirmMessage: 'It leaves this list and cannot be edited or restored.',
    confirmButtonLabel: 'Archive',
    isDestructive: false,
    successMessage: 'Job opening archived.',
  },
  delete: {
    buttonLabel: 'Delete draft',
    confirmTitle: 'Delete this draft?',
    confirmMessage: 'The draft is removed permanently. This cannot be undone.',
    confirmButtonLabel: 'Delete draft',
    isDestructive: true,
    successMessage: 'Draft deleted.',
  },
  save_published: {
    buttonLabel: 'Save changes',
    confirmTitle: 'Save changes to a published opening?',
    confirmMessage: 'Changes are visible to workers immediately.',
    confirmButtonLabel: 'Save changes',
    isDestructive: false,
    successMessage: 'Job opening saved.',
  },
}

/** Plain-language reason why Publish / Resume is unavailable, or null when it is available. */
export function describePublishBlock(publishReadiness: JobOpeningPublishReadiness): string | null {
  switch (publishReadiness.kind) {
    case 'ready':
      return null
    case 'shop_not_verified':
      return 'Publishing needs an approved shop verification.'
    case 'missing_fields':
      return `Complete these fields first: ${publishReadiness.missingFields
        .map((fieldName) => jobOpeningPublishFieldLabels[fieldName])
        .join(', ')}.`
    case 'deadline_passed':
      return 'The application deadline has passed. Change it before publishing.'
  }
}

export interface JobOpeningTransitionOption {
  readonly action: JobOpeningTransitionAction
  readonly toStatus: JobOpeningStatus
  readonly disabledReason: string | null
}

/** The transitions the lifecycle allows from the current status, each with its blocker (if any). */
export function listJobOpeningTransitionOptions(
  jobOpening: JobOpening,
  isShopVerifiedForPublishing: boolean,
  currentInstant: Date,
): JobOpeningTransitionOption[] {
  return allowedJobOpeningTransitions(jobOpening.status).map((toStatus) => ({
    action: toTransitionAction(jobOpening.status, toStatus),
    toStatus,
    disabledReason:
      toStatus === 'published'
        ? describePublishBlock(
            evaluateJobOpeningPublishReadiness(jobOpening, isShopVerifiedForPublishing, currentInstant),
          )
        : null,
  }))
}
