import type { ReactElement } from 'react'
import { CalendarCheck2, ClipboardCheck } from 'lucide-react'
import type { TrainingAssessmentResult, TrainingProgressStatus } from '../../../domain/models/TrainingEnrollment'
import { Badge } from '../../design/ui'
import {
  describeAssessmentStatus,
  describeTrainingProgress,
  formatAttendedDays,
} from '../../utilities/trainingDisplay'

interface TrainingProgressBadgeProps {
  readonly progressStatus: TrainingProgressStatus
}

export function TrainingProgressBadge({ progressStatus }: TrainingProgressBadgeProps): ReactElement {
  const progressDisplay = describeTrainingProgress(progressStatus)
  return <Badge tone={progressDisplay.badgeTone}>{progressDisplay.displayLabel}</Badge>
}

interface TrainingProgressSummaryProps {
  readonly progressStatus: TrainingProgressStatus
  readonly attendedTrainingDays: number
  readonly requiredTrainingDays: number
  readonly currentAssessmentResult: TrainingAssessmentResult | null
}

/** Progress exactly as the server view reports it (distinct attended days, assessment). */
export function TrainingProgressSummary({
  progressStatus,
  attendedTrainingDays,
  requiredTrainingDays,
  currentAssessmentResult,
}: TrainingProgressSummaryProps): ReactElement {
  const isEnded = progressStatus === 'declined' || progressStatus === 'withdrawn' || progressStatus === 'cancelled'
  return (
    <div className="space-y-1.5" aria-label="Training progress">
      <TrainingProgressBadge progressStatus={progressStatus} />
      {progressStatus === 'invited' || isEnded ? null : (
        <ul className="space-y-1 text-sm text-[var(--color-ink-700)]">
          <li className="flex items-center gap-2">
            <CalendarCheck2 className="h-4 w-4 shrink-0 text-[var(--color-brand-700)]" aria-hidden="true" />
            {formatAttendedDays(attendedTrainingDays, requiredTrainingDays)}
          </li>
          <li className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 shrink-0 text-[var(--color-brand-700)]" aria-hidden="true" />
            {describeAssessmentStatus(progressStatus, currentAssessmentResult)}
          </li>
        </ul>
      )}
    </div>
  )
}
