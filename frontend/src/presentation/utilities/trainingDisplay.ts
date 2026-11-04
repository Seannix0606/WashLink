import type { TrainingProgressStatus } from '../../domain/models/TrainingEnrollment'
import type { TrainingAttendanceStatus } from '../../domain/models/TrainingEvidence'
import type {
  TrainingPayPeriod,
  TrainingProgramContent,
  TrainingProgramStatus,
} from '../../domain/models/TrainingProgram'
import type { TrainingSessionKind } from '../../domain/models/TrainingSession'
import type { TrainingProgramOpenReadiness } from '../../domain/utilities/trainingProgramLifecycle'
import type { BadgeTone } from '../design/ui/Badge'
import { notSpecifiedByShopText } from './jobOpeningDisplay'
import { failedAfterShopRemovedExplanation, leaveTrainingLocationText } from './trainingNoticeCopy'

export interface TrainingStatusDisplay {
  readonly displayLabel: string
  readonly badgeTone: BadgeTone
}

const progressDisplayByStatus: Readonly<Record<TrainingProgressStatus, TrainingStatusDisplay>> = {
  invited: { displayLabel: 'Invited', badgeTone: 'info' },
  scheduled: { displayLabel: 'Scheduled', badgeTone: 'brand' },
  in_progress: { displayLabel: 'In progress', badgeTone: 'brand' },
  awaiting_assessment: { displayLabel: 'Awaiting assessment', badgeTone: 'warning' },
  completed: { displayLabel: 'Completed', badgeTone: 'success' },
  failed: { displayLabel: 'Not passed', badgeTone: 'danger' },
  declined: { displayLabel: 'Declined', badgeTone: 'neutral' },
  withdrawn: { displayLabel: 'Left', badgeTone: 'neutral' },
  cancelled: { displayLabel: 'Cancelled', badgeTone: 'neutral' },
  shop_removed: { displayLabel: 'Shop no longer on WashLink', badgeTone: 'neutral' },
}

/** Labels for the server progress status; the app never derives it from dates. */
export function describeTrainingProgress(progressStatus: TrainingProgressStatus): TrainingStatusDisplay {
  return progressDisplayByStatus[progressStatus]
}

const programDisplayByStatus: Readonly<Record<TrainingProgramStatus, TrainingStatusDisplay & { readonly helperText: string }>> = {
  draft: { displayLabel: 'Draft', badgeTone: 'neutral', helperText: 'Only you can see this draft.' },
  open: { displayLabel: 'Open', badgeTone: 'success', helperText: 'You can invite accepted applicants.' },
  closed: { displayLabel: 'Closed', badgeTone: 'warning', helperText: 'No new invitations. Enrolled workers continue.' },
  archived: { displayLabel: 'Archived', badgeTone: 'info', helperText: 'Kept for your records only.' },
}

export function describeTrainingProgramStatus(
  status: TrainingProgramStatus,
): TrainingStatusDisplay & { readonly helperText: string } {
  return programDisplayByStatus[status]
}

/** Both kinds are supervised learning; neither is work for customers. */
export const trainingSessionKindLabels: Readonly<Record<TrainingSessionKind, string>> = {
  supervised_training: 'Supervised training',
  competency_assessment: 'Competency assessment',
}

export const trainingAttendanceLabels: Readonly<Record<TrainingAttendanceStatus, string>> = {
  present: 'Present',
  absent: 'Absent',
}

export const trainingPayPeriodLabels: Readonly<Record<TrainingPayPeriod, string>> = {
  day: 'per training day',
  session: 'per session',
  program: 'for the whole program',
}

/** Always shown: required initial training is free; there is no fee field anywhere. */
export const trainingFeeLine = 'Training fee: none. Required initial training is free for you.'

export const trainingPayDisclaimer = 'As entered by the shop. WashLink does not verify pay.'

const amountFormatter = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
})

type TrainingPayContent = Pick<
  TrainingProgramContent,
  'trainingPayAmount' | 'trainingPayCurrency' | 'trainingPayPeriod' | 'trainingPayDetails'
>

/** Training pay exactly as entered: the stored amount line and the owner's own words. */
export function formatTrainingPayAsEntered(payContent: TrainingPayContent): readonly string[] {
  const { trainingPayAmount, trainingPayCurrency, trainingPayPeriod } = payContent
  const amountLine =
    trainingPayAmount !== null && trainingPayCurrency !== null && trainingPayPeriod !== null
      ? `${trainingPayCurrency} ${amountFormatter.format(trainingPayAmount)} ${trainingPayPeriodLabels[trainingPayPeriod]}`
      : null
  const payLines = [amountLine, payContent.trainingPayDetails].filter(
    (payLine): payLine is string => payLine !== null,
  )
  return payLines.length > 0 ? payLines : [notSpecifiedByShopText]
}

export function formatReimbursementAsEntered(reimbursementDetails: string | null): string {
  return reimbursementDetails ?? notSpecifiedByShopText
}

/** "2 of 3 training days attended", from the server counts. */
export function formatAttendedDays(attendedTrainingDays: number, requiredTrainingDays: number): string {
  return `${String(attendedTrainingDays)} of ${String(requiredTrainingDays)} training days attended`
}

export function describeAssessmentStatus(
  progressStatus: TrainingProgressStatus,
  currentAssessmentResult: 'passed' | 'failed' | null,
): string {
  if (currentAssessmentResult === 'passed') {
    return 'Assessment: passed'
  }
  if (currentAssessmentResult === 'failed') {
    return 'Assessment: not passed'
  }
  return progressStatus === 'awaiting_assessment'
    ? 'Assessment: not recorded yet'
    : 'Assessment: after the required training days'
}

/** "HH:MM" from a stored time, or null. */
function shortTime(storedTime: string | null): string | null {
  return storedTime === null ? null : storedTime.slice(0, 5)
}

export function formatSessionTimeRange(startTime: string | null, endTime: string | null): string | null {
  const start = shortTime(startTime)
  const end = shortTime(endTime)
  if (start !== null && end !== null) {
    return `${start} - ${end}`
  }
  if (start !== null) {
    return `From ${start}`
  }
  return end === null ? null : `Until ${end}`
}

export function describeOpenReadiness(readiness: TrainingProgramOpenReadiness): string | null {
  switch (readiness.kind) {
    case 'ready':
      return null
    case 'shop_not_verified':
      return 'Opening needs an approved shop verification.'
    case 'missing_content':
      return 'Add objectives, terms and at least one checklist item before opening.'
    case 'past_sessions':
      return 'Cancel or delete sessions dated before today before opening.'
    case 'not_enough_days':
      return `Schedule at least ${String(readiness.requiredDays)} upcoming supervised training days (now ${String(readiness.scheduledDays)}).`
  }
}

export const shopRemovedExplanation = `This shop is no longer on WashLink. Your training records are kept for you; nobody can add new records. This training stays open until you leave it. While it stays open, WashLink refuses this owner's requests to assign you to their customer bookings through a linked roster entry. ${leaveTrainingLocationText}`

/** W16 D-85: shown to the worker when the server reports progress `failed`. */
export const failedTrainingExplanation = `Your assessment is recorded as not passed. This training stays open until the shop records a passing correction or cancels it, or you leave it. While it stays open, WashLink refuses this owner's requests to assign you to their customer bookings through a linked roster entry. ${leaveTrainingLocationText}`

/** The explanation the worker sees for a progress status that keeps the booking gate on with no next step (D-84). */
export function describeTrainingHoldForWorker(
  progressStatus: TrainingProgressStatus | null,
  enrollmentShopId: string | null,
): string | null {
  if (progressStatus === 'failed') {
    return enrollmentShopId === null ? failedAfterShopRemovedExplanation : failedTrainingExplanation
  }
  return progressStatus === 'shop_removed' ? shopRemovedExplanation : null
}
