import type { ReactElement } from 'react'
import { useState } from 'react'
import { Check, PencilLine, X } from 'lucide-react'
import {
  trainingEvidenceLimits,
  type TrainingAttendanceEvidence,
  type TrainingAttendanceStatus,
} from '../../../domain/models/TrainingEvidence'
import type { TrainingSession } from '../../../domain/models/TrainingSession'
import { describeSessionRecordability } from '../../../domain/utilities/trainingEnrollmentLifecycle'
import { Badge, Button, Input } from '../../design/ui'
import { formatCalendarDate } from '../../utilities/jobOpeningDisplay'
import { trainingAttendanceLabels, trainingSessionKindLabels } from '../../utilities/trainingDisplay'

interface AttendanceSheetProps {
  /** Scheduled sessions of the program. */
  readonly sessions: readonly TrainingSession[]
  readonly acceptedAt: string | null
  /** Current (not superseded) attendance records of the enrollment. */
  readonly currentAttendance: readonly TrainingAttendanceEvidence[]
  readonly canRecord: boolean
  readonly canCorrect: boolean
  readonly isRecording: boolean
  readonly evaluatedAt: Date
  readonly onRecord: (sessionId: string, attendanceStatus: TrainingAttendanceStatus, progressNote: string) => void
  readonly onCorrectRequested: (currentRecord: TrainingAttendanceEvidence) => void
}

interface AttendanceRowProps extends Omit<AttendanceSheetProps, 'sessions' | 'currentAttendance'> {
  readonly session: TrainingSession
  readonly currentRecord: TrainingAttendanceEvidence | null
}

function AttendanceRow({
  session,
  currentRecord,
  acceptedAt,
  canRecord,
  canCorrect,
  isRecording,
  evaluatedAt,
  onRecord,
  onCorrectRequested,
}: AttendanceRowProps): ReactElement {
  const [progressNote, setProgressNote] = useState<string>('')
  const recordability = describeSessionRecordability(session.sessionDate, acceptedAt, evaluatedAt)
  const noteFieldId = `attendance-note-${session.id}`
  const sessionLabel = `${formatCalendarDate(session.sessionDate)}, ${trainingSessionKindLabels[session.sessionKind]}`

  return (
    <li className="space-y-2 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] p-3" aria-label={sessionLabel}>
      <p className="text-sm font-medium text-[var(--color-ink-900)]">{sessionLabel}</p>
      {currentRecord !== null ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={currentRecord.attendanceStatus === 'present' ? 'success' : 'neutral'}>
            {trainingAttendanceLabels[currentRecord.attendanceStatus]}
          </Badge>
          {currentRecord.progressNote === null ? null : (
            <span className="text-xs break-words text-[var(--color-ink-700)]">{currentRecord.progressNote}</span>
          )}
          {canCorrect ? (
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={<PencilLine className="h-4 w-4" />}
              disabled={isRecording}
              onClick={(): void => {
                onCorrectRequested(currentRecord)
              }}
            >
              Correct
            </Button>
          ) : null}
        </div>
      ) : recordability === 'not_yet' ? (
        <p className="text-xs text-[var(--color-ink-500)]">Attendance can be taken on or after this day.</p>
      ) : recordability === 'before_enrollment' ? (
        <p className="text-xs text-[var(--color-ink-500)]">This day was before the worker enrolled.</p>
      ) : canRecord ? (
        <div className="space-y-2">
          <Input
            id={noteFieldId}
            label="Progress note (optional)"
            value={progressNote}
            maxLength={trainingEvidenceLimits.progressNoteMaxLength}
            onChange={(changeEvent): void => {
              setProgressNote(changeEvent.target.value)
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              leadingIcon={<Check className="h-4 w-4" />}
              disabled={isRecording}
              onClick={(): void => {
                onRecord(session.id, 'present', progressNote)
              }}
            >
              Present
            </Button>
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={<X className="h-4 w-4" />}
              disabled={isRecording}
              onClick={(): void => {
                onRecord(session.id, 'absent', progressNote)
              }}
            >
              Absent
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-[var(--color-ink-500)]">Not recorded.</p>
      )}
    </li>
  )
}

/** Attendance per training day. Recorded days can only be corrected, never edited. */
export function AttendanceSheet({ sessions, currentAttendance, ...rowProps }: AttendanceSheetProps): ReactElement {
  const recordBySession = new Map(currentAttendance.map((attendanceRecord) => [attendanceRecord.sessionId, attendanceRecord]))
  const scheduledSessions = sessions.filter((session) => session.status === 'scheduled')
  return (
    <section aria-label="Attendance" className="space-y-2">
      <h4 className="text-sm font-semibold text-[var(--color-ink-900)]">Attendance</h4>
      {scheduledSessions.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-500)]">No scheduled training days.</p>
      ) : (
        <ul className="space-y-2">
          {scheduledSessions.map((session) => (
            <AttendanceRow
              key={session.id}
              session={session}
              currentRecord={recordBySession.get(session.id) ?? null}
              {...rowProps}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
