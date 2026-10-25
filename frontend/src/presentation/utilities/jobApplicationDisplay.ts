import type { JobApplication, JobApplicationStatus, MyJobApplication } from '../../domain/models/JobApplication'
import {
  isClosedDraft,
  type OwnerJobApplicationTransition,
} from '../../domain/utilities/jobApplicationLifecycle'
import type { BadgeTone } from '../design/ui/Badge'

export interface JobApplicationStatusDisplay {
  readonly displayLabel: string
  readonly badgeTone: BadgeTone
  /** What the status means for the worker. */
  readonly workerHelperText: string
}

/** `accepted` is a pipeline decision only, never a contract or an offer of employment. */
export const acceptedApplicationCopy =
  'The shop wants to move forward. This is not a contract or a job guarantee.'

const statusDisplayByStatus: Readonly<Record<JobApplicationStatus, JobApplicationStatusDisplay>> = {
  draft: {
    displayLabel: 'Draft',
    badgeTone: 'neutral',
    workerHelperText: 'Not sent yet. Only you can see this draft.',
  },
  submitted: {
    displayLabel: 'Submitted',
    badgeTone: 'brand',
    workerHelperText: 'Sent to the shop. It has not been reviewed yet.',
  },
  under_review: {
    displayLabel: 'Under review',
    badgeTone: 'info',
    workerHelperText: 'The shop is reviewing your application.',
  },
  shortlisted: {
    displayLabel: 'Shortlisted',
    badgeTone: 'info',
    workerHelperText: 'The shop shortlisted your application.',
  },
  accepted: { displayLabel: 'Accepted', badgeTone: 'success', workerHelperText: acceptedApplicationCopy },
  rejected: {
    displayLabel: 'Not selected',
    badgeTone: 'danger',
    workerHelperText: 'The shop did not select this application.',
  },
  withdrawn: {
    displayLabel: 'Withdrawn',
    badgeTone: 'neutral',
    workerHelperText: 'You withdrew this application.',
  },
  closed: {
    displayLabel: 'Closed',
    badgeTone: 'neutral',
    workerHelperText: 'The job opening closed, so this application was closed.',
  },
}

export function describeJobApplicationStatus(status: JobApplicationStatus): JobApplicationStatusDisplay {
  return statusDisplayByStatus[status]
}

const closedDraftDisplay: JobApplicationStatusDisplay = {
  displayLabel: 'Closed (never sent)',
  badgeTone: 'neutral',
  workerHelperText:
    'The job opening closed before you sent this draft. The shop never received it. Only you can see it.',
}

/** The worker's view of one row; a closed draft is labelled as never sent. */
export function describeWorkerApplicationStatus(
  application: Pick<JobApplication, 'status' | 'submittedAt'>,
): JobApplicationStatusDisplay {
  return isClosedDraft(application) ? closedDraftDisplay : describeJobApplicationStatus(application.status)
}

export interface OwnerTransitionCopy {
  readonly buttonLabel: string
  readonly confirmTitle: string
  readonly confirmMessage: string
  readonly confirmButtonLabel: string
  readonly successMessage: string
  readonly isDestructive: boolean
}

export const ownerTransitionCopy: Readonly<Record<OwnerJobApplicationTransition, OwnerTransitionCopy>> = {
  under_review: {
    buttonLabel: 'Start review',
    confirmTitle: 'Start reviewing this application?',
    confirmMessage: 'The worker will see Under review.',
    confirmButtonLabel: 'Start review',
    successMessage: 'Application moved to Under review.',
    isDestructive: false,
  },
  shortlisted: {
    buttonLabel: 'Shortlist',
    confirmTitle: 'Shortlist this applicant?',
    confirmMessage: 'The worker will see Shortlisted.',
    confirmButtonLabel: 'Shortlist',
    successMessage: 'Applicant shortlisted.',
    isDestructive: false,
  },
  accepted: {
    buttonLabel: 'Accept',
    confirmTitle: 'Accept this application?',
    confirmMessage:
      'This records your decision; it is not a contract. The worker will see Accepted and that it is not a contract or a job guarantee.',
    confirmButtonLabel: 'Record acceptance',
    successMessage: 'Acceptance recorded. This is not a contract.',
    isDestructive: false,
  },
  rejected: {
    buttonLabel: 'Not selected',
    confirmTitle: 'Mark as not selected?',
    confirmMessage: 'The worker will see Not selected. This cannot be undone.',
    confirmButtonLabel: 'Mark not selected',
    successMessage: 'Application marked Not selected.',
    isDestructive: true,
  },
}

export interface WithdrawCopy {
  readonly buttonLabel: string
  readonly confirmTitle: string
  readonly confirmMessage: string
  readonly confirmButtonLabel: string
  readonly successMessage: string
}

const withdrawConsequenceText =
  'The shop will be told you withdrew. This cannot be undone. While the opening is open you can apply again, up to 3 applications per opening.'

/**
 * An accepted application is "declined"; any other open one is "withdrawn" (both final).
 * A draft is deleted instead, since the shop never saw it.
 */
export function describeWithdrawAction(status: JobApplicationStatus): WithdrawCopy {
  if (status === 'draft') {
    return {
      buttonLabel: 'Delete draft',
      confirmTitle: 'Delete this draft?',
      confirmMessage: 'The draft was never sent to the shop. It is removed permanently.',
      confirmButtonLabel: 'Delete draft',
      successMessage: 'Draft deleted.',
    }
  }
  if (status === 'accepted') {
    return {
      buttonLabel: 'Decline',
      confirmTitle: 'Decline this acceptance?',
      confirmMessage:
        withdrawConsequenceText,
      confirmButtonLabel: 'Decline',
      successMessage: 'You declined. The shop has been told.',
    }
  }
  return {
    buttonLabel: 'Withdraw',
    confirmTitle: 'Withdraw this application?',
    confirmMessage:
      withdrawConsequenceText,
    confirmButtonLabel: 'Withdraw application',
    successMessage: 'Application withdrawn.',
  }
}

/** Withdraw copy for one row; a closed draft uses the "Delete draft" copy. */
export function describeWorkerWithdrawAction(
  application: Pick<JobApplication, 'status' | 'submittedAt'>,
): WithdrawCopy {
  return describeWithdrawAction(isClosedDraft(application) ? 'draft' : application.status)
}

export const openingEditedAfterApplyingText = 'The shop edited this opening after you applied.'

export const acceptRequiresVerifiedShopReason = 'Only a verified shop can accept applications.'

export const selfReportedProfileHeading = 'Self-reported by the worker, not verified by WashLink'

export const verifiedCertificationsNoneYetText = 'Verified certifications: none yet'

export const verifiedCertificationsNotAvailableYetText = 'Verified certifications: not available yet'

export interface VerifiedCertificationsEmptyCopy {
  readonly title: string
  readonly detail: string
}

/** Owner-side copy when an applicant has no verified certification; mirrors the worker side. */
export function describeNoVerifiedCertifications(isWorkflowAvailable: boolean): VerifiedCertificationsEmptyCopy {
  if (!isWorkflowAvailable) {
    return {
      title: verifiedCertificationsNotAvailableYetText,
      detail:
        'WashLink certifications are not available yet, so no applicant has a verified certification. Skills above are self-reported.',
    }
  }
  return {
    title: verifiedCertificationsNoneYetText,
    detail:
      'Shop-issued certifications appear here only after the WashLink certification workflow records them. Skills above are self-reported.',
  }
}

export function formatApplicantCountLabel(applicationCount: number | undefined): string {
  return applicationCount === undefined ? 'Applicants' : `Applicants (${String(applicationCount)})`
}

/** The title the worker applied to (snapshot), else the current one, else a generic label. */
export function describeApplicationOpeningTitle(myApplication: MyJobApplication): string {
  return (
    myApplication.application.openingSnapshot?.title ??
    myApplication.currentOpening?.title ??
    'Job opening'
  )
}
