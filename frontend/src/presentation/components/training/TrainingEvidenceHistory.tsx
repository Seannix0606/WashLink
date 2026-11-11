import type { ReactElement } from 'react'
import { CheckCircle2, History, XCircle } from 'lucide-react'
import type { TrainingAssessmentEvidence, TrainingEvidenceEntry } from '../../../domain/models/TrainingEvidence'
import { Badge } from '../../design/ui'
import { formatShortDateTime } from '../../utilities/datetimeFormatting'
import { formatCalendarDate } from '../../utilities/jobOpeningDisplay'
import { trainingAttendanceLabels, trainingSessionKindLabels } from '../../utilities/trainingDisplay'
import { evidenceAppendOnlyNotice } from '../../utilities/trainingNoticeCopy'

interface TrainingEvidenceHistoryProps {
  readonly evidence: readonly TrainingEvidenceEntry[]
}

const recorderRoleLabels = { owner: 'shop owner', trainer: 'trainer' } as const

function describeEvidence(evidenceEntry: TrainingEvidenceEntry): string {
  if (evidenceEntry.evidenceKind === 'attendance') {
    return `${formatCalendarDate(evidenceEntry.sessionDate)} - ${trainingSessionKindLabels[evidenceEntry.sessionKind]}: ${trainingAttendanceLabels[evidenceEntry.attendanceStatus]}`
  }
  const metCount = evidenceEntry.itemsMet.filter((isItemMet) => isItemMet).length
  const resultLabel = evidenceEntry.result === 'passed' ? 'Passed' : 'Not passed'
  return `Assessment: ${resultLabel} (${String(metCount)} of ${String(evidenceEntry.itemsMet.length)} checklist items met)`
}

/** Each checklist item as recorded (snapshot at assessment time) and whether it was met. */
function AssessmentChecklistResults({ assessment }: { readonly assessment: TrainingAssessmentEvidence }): ReactElement | null {
  if (assessment.itemsMet.length === 0) {
    return null
  }
  return (
    <ul aria-label="Checklist results" className="space-y-1">
      {assessment.itemsMet.map((isItemMet, itemIndex) => {
        // The stored snapshot text; a missing entry is labelled by position, never invented.
        const itemText = assessment.checklistSnapshot[itemIndex] ?? `Item ${String(itemIndex + 1)}`
        const ResultIcon = isItemMet ? CheckCircle2 : XCircle
        return (
          <li key={`${String(itemIndex)}-${itemText}`} className="flex items-start gap-2 text-[var(--color-ink-700)]">
            <ResultIcon
              className={`mt-0.5 h-4 w-4 shrink-0 ${isItemMet ? 'text-[var(--color-brand-700)]' : 'text-[var(--color-danger-600)]'}`}
              aria-hidden="true"
            />
            <span className="break-words">
              {itemText}: <span className="font-medium">{isItemMet ? 'Met' : 'Not met'}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** Every record, newest first, superseded ones included with the correction reason. */
export function TrainingEvidenceHistory({ evidence }: TrainingEvidenceHistoryProps): ReactElement {
  const orderedEvidence = [...evidence].sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
  return (
    <section aria-label="Training record history" className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-ink-900)]">
        <History className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
        Record history
      </h4>
      <p className="text-xs text-[var(--color-ink-500)]">{evidenceAppendOnlyNotice}</p>
      {orderedEvidence.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-500)]">No training records yet.</p>
      ) : (
        <ul className="space-y-2">
          {orderedEvidence.map((evidenceEntry) => {
            const note =
              evidenceEntry.evidenceKind === 'attendance' ? evidenceEntry.progressNote : evidenceEntry.assessorComment
            return (
              <li
                key={evidenceEntry.evidenceId}
                className="space-y-1 rounded-[var(--radius-control)] border border-[var(--color-card-border)] p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium break-words text-[var(--color-ink-900)]">{describeEvidence(evidenceEntry)}</span>
                  {evidenceEntry.isCurrent ? null : <Badge tone="neutral">Superseded</Badge>}
                  {evidenceEntry.supersedesId === null ? null : <Badge tone="warning">Correction</Badge>}
                </div>
                {evidenceEntry.evidenceKind === 'assessment' ? <AssessmentChecklistResults assessment={evidenceEntry} /> : null}
                {evidenceEntry.evidenceKind === 'assessment' && evidenceEntry.failureReason !== null ? (
                  <p className="break-words whitespace-pre-line text-[var(--color-ink-700)]">
                    Reason for not passing: {evidenceEntry.failureReason}
                  </p>
                ) : null}
                {note === null ? null : (
                  <p className="break-words whitespace-pre-line text-[var(--color-ink-700)]">Note: {note}</p>
                )}
                {evidenceEntry.correctionReason === null ? null : (
                  <p className="break-words text-[var(--color-ink-700)]">Reason for correction: {evidenceEntry.correctionReason}</p>
                )}
                <p className="text-xs text-[var(--color-ink-500)]">
                  Recorded by {evidenceEntry.recordedByDisplayName} ({recorderRoleLabels[evidenceEntry.recorderRole]}),{' '}
                  {formatShortDateTime(evidenceEntry.recordedAt)}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
