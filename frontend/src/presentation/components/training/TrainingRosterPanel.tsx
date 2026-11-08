import type { ReactElement } from 'react'
import { useState } from 'react'
import { ChevronDown, ChevronUp, Users } from 'lucide-react'
import type { TrainingEnrollmentService } from '../../../application/services/TrainingEnrollmentService'
import type { TrainingEvidenceService } from '../../../application/services/TrainingEvidenceService'
import type { TrainingRosterEntry } from '../../../domain/models/TrainingEnrollment'
import type { TrainingProgram } from '../../../domain/models/TrainingProgram'
import type { TrainingSession } from '../../../domain/models/TrainingSession'
import {
  isCancelReasonRequired,
  ownerTrainingEnrollmentActions,
} from '../../../domain/utilities/trainingEnrollmentLifecycle'
import { Button, EmptyState, Skeleton } from '../../design/ui'
import { useTrainingRoster } from '../../hooks/useTrainingRoster'
import { LoadErrorNotice } from '../shared/LoadErrorNotice'
import { ReasonConfirmModal } from './TrainingConfirmModals'
import { TrainingEnrollmentRecordsPanel } from './TrainingEnrollmentRecordsPanel'
import { TrainingProgressBadge } from './TrainingProgressSummary'

interface TrainingRosterPanelProps {
  readonly trainingEnrollmentService: TrainingEnrollmentService
  readonly trainingEvidenceService: TrainingEvidenceService
  readonly program: TrainingProgram
  readonly sessions: readonly TrainingSession[]
  /** Owners see every enrollment and may cancel; trainers see accepted trainees only. */
  readonly isOwnerView: boolean
}

/** Trainees with server progress, attendance and assessment. The UI never edits or deletes records. */
export function TrainingRosterPanel({
  trainingEnrollmentService,
  trainingEvidenceService,
  program,
  sessions,
  isOwnerView,
}: TrainingRosterPanelProps): ReactElement {
  const { rosterEntries, isLoadingRoster, rosterErrorMessage, isRosterEmpty, pendingEnrollmentId, reloadRoster, refreshRoster, cancelEnrollment } =
    useTrainingRoster(trainingEnrollmentService, program.id)
  const [expandedEnrollmentId, setExpandedEnrollmentId] = useState<string | null>(null)
  const [entryToCancel, setEntryToCancel] = useState<TrainingRosterEntry | null>(null)
  const programSessions = sessions.filter((session) => session.programId === program.id)

  return (
    <section aria-label="Trainees" className="space-y-3">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-ink-900)]">
        <Users className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
        Trainees
      </h4>
      {isLoadingRoster ? (
        <div aria-busy="true" aria-label="Loading trainees" className="space-y-2">
          <Skeleton heightClassName="h-14" />
          <Skeleton heightClassName="h-14" />
        </div>
      ) : rosterErrorMessage !== null ? (
        <LoadErrorNotice title="Trainees could not be loaded" errorMessage={rosterErrorMessage} onRetry={(): void => { void reloadRoster() }} />
      ) : isRosterEmpty ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No trainees yet"
          description={
            isOwnerView
              ? 'Invite an applicant you accepted from Job openings, Applicants.'
              : 'Trainees appear here once they accept the shop invitation.'
          }
        />
      ) : (
        <ul aria-label="Trainee list" className="space-y-2">
          {rosterEntries.map((rosterEntry) => {
            const isExpanded = expandedEnrollmentId === rosterEntry.enrollmentId
            const ownerActions = isOwnerView ? ownerTrainingEnrollmentActions(rosterEntry.enrollmentStatus, rosterEntry.progressStatus) : []
            return (
              <li key={rosterEntry.enrollmentId} className="space-y-3 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium break-words text-[var(--color-ink-900)]">{rosterEntry.displayName}</p>
                    <TrainingProgressBadge progressStatus={rosterEntry.progressStatus} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {rosterEntry.enrollmentStatus === 'accepted' ? (
                      <Button size="sm" variant="secondary" aria-expanded={isExpanded}
                        leadingIcon={isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        onClick={(): void => { setExpandedEnrollmentId(isExpanded ? null : rosterEntry.enrollmentId) }}>
                        {isExpanded ? 'Hide records' : 'Attendance and assessment'}
                      </Button>
                    ) : null}
                    {ownerActions.map((ownerAction) => (
                      <Button key={ownerAction} size="sm" variant="ghost" disabled={pendingEnrollmentId === rosterEntry.enrollmentId}
                        onClick={(): void => { setEntryToCancel(rosterEntry) }}>
                        {ownerAction === 'cancel_invitation' ? 'Withdraw invitation' : 'Cancel enrollment'}
                      </Button>
                    ))}
                  </div>
                </div>
                {isExpanded ? (
                  <TrainingEnrollmentRecordsPanel
                    trainingEvidenceService={trainingEvidenceService}
                    rosterEntry={rosterEntry}
                    sessions={programSessions}
                    assessmentChecklist={program.assessmentChecklist}
                    onEvidenceChanged={(): void => { void refreshRoster() }}
                  />
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      <ReasonConfirmModal
        isOpen={entryToCancel !== null}
        title={entryToCancel?.enrollmentStatus === 'invited' ? 'Withdraw this invitation?' : 'Cancel this enrollment?'}
        subjectText={entryToCancel?.displayName ?? ''}
        message={
          entryToCancel?.enrollmentStatus === 'invited'
            ? 'The worker can no longer accept it. This cannot be undone.'
            : 'The worker leaves this training. Their records stay. This cannot be undone.'
        }
        confirmButtonLabel={entryToCancel?.enrollmentStatus === 'invited' ? 'Withdraw invitation' : 'Cancel enrollment'}
        isDestructive
        isReasonRequired={entryToCancel !== null && isCancelReasonRequired(entryToCancel.enrollmentStatus)}
        reasonLabel={
          entryToCancel !== null && isCancelReasonRequired(entryToCancel.enrollmentStatus)
            ? 'Reason (required, 10 to 300 characters)'
            : 'Reason (optional, 10 to 300 characters)'
        }
        isSubmitting={entryToCancel !== null && pendingEnrollmentId === entryToCancel.enrollmentId}
        onConfirm={(reason): void => {
          if (entryToCancel !== null) {
            void cancelEnrollment(entryToCancel, reason).then((didCancel) => {
              if (didCancel) {
                setEntryToCancel(null)
              }
            })
          }
        }}
        onCancel={(): void => { setEntryToCancel(null) }}
      />
    </section>
  )
}
