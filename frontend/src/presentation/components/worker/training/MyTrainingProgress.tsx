import type { ReactElement } from 'react'
import { useCallback } from 'react'
import { Info } from 'lucide-react'
import type { TrainingEvidenceService } from '../../../../application/services/TrainingEvidenceService'
import type { MyTraining } from '../../../../domain/models/TrainingEnrollment'
import { Skeleton } from '../../../design/ui'
import { useTrainingEvidence } from '../../../hooks/useTrainingEvidence'
import { formatShortDateTime } from '../../../utilities/datetimeFormatting'
import { describeTrainingHoldForWorker } from '../../../utilities/trainingDisplay'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { TrainingEvidenceHistory } from '../../training/TrainingEvidenceHistory'
import { TrainingVersusPaidWorkNote } from '../../training/TrainingNotices'
import { TrainingProgramDetailsView } from '../../training/TrainingProgramDetailsView'
import { TrainingProgressSummary } from '../../training/TrainingProgressSummary'
import { TrainingSessionList } from '../../training/TrainingSessionList'

interface MyTrainingProgressProps {
  readonly trainingEvidenceService: TrainingEvidenceService
  readonly myTraining: MyTraining
}

/** The worker's own progress (server view), agreed terms and records. Read only. */
export function MyTrainingProgress({ trainingEvidenceService, myTraining }: MyTrainingProgressProps): ReactElement {
  const { enrollment, progress } = myTraining
  const noOpRefresh = useCallback((): void => undefined, [])
  const { evidence, isLoadingEvidence, evidenceErrorMessage, reloadEvidence } = useTrainingEvidence(
    trainingEvidenceService,
    enrollment.id,
    noOpRefresh,
  )
  const agreedTerms = enrollment.termsSnapshot
  const holdExplanation = describeTrainingHoldForWorker(progress?.progressStatus ?? null, enrollment.shopId)

  return (
    <div className="space-y-5">
      {progress === null ? (
        <p className="text-sm text-[var(--color-ink-500)]">Progress is not available right now.</p>
      ) : (
        <TrainingProgressSummary
          progressStatus={progress.progressStatus}
          attendedTrainingDays={progress.attendedTrainingDays}
          requiredTrainingDays={progress.requiredTrainingDays}
          currentAssessmentResult={progress.currentAssessmentResult}
        />
      )}
      {holdExplanation === null ? null : (
        <p role="status" className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-ink-700)]">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {holdExplanation}
        </p>
      )}
      {enrollment.cancelReason === null ? null : (
        <p className="text-sm break-words text-[var(--color-ink-700)]">Reason given by the shop: {enrollment.cancelReason}</p>
      )}

      {agreedTerms === null ? null : (
        <details className="rounded-[var(--radius-control)] border border-[var(--color-ink-200)] p-3" open>
          <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink-900)]">
            Agreed training terms
            {enrollment.termsSnapshotTakenAt === null ? '' : ` (recorded ${formatShortDateTime(enrollment.termsSnapshotTakenAt)})`}
          </summary>
          <div className="mt-3 space-y-4">
            <TrainingProgramDetailsView content={agreedTerms} shopName={agreedTerms.shopName ?? enrollment.shopNameSnapshot} />
            <TrainingSessionList
              sessions={agreedTerms.sessions.map((snapshotSession) => ({ ...snapshotSession, id: snapshotSession.sessionId }))}
              accessibleLabel="Training dates when you accepted"
              emptyText="No dates were scheduled when you accepted."
            />
          </div>
        </details>
      )}
      {agreedTerms === null ? <TrainingVersusPaidWorkNote /> : null}

      {isLoadingEvidence ? (
        <Skeleton heightClassName="h-16" />
      ) : evidenceErrorMessage !== null ? (
        <LoadErrorNotice title="Your training records could not be loaded" errorMessage={evidenceErrorMessage} onRetry={(): void => { void reloadEvidence() }} />
      ) : (
        <TrainingEvidenceHistory evidence={evidence} />
      )}
    </div>
  )
}
