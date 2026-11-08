import type { ReactElement } from 'react'
import { useId, useState } from 'react'
import {
  trainingAttendanceStatuses,
  trainingEvidenceLimits as limits,
  type CorrectTrainingAttendanceInput,
  type TrainingAttendanceEvidence,
  type TrainingAttendanceStatus,
} from '../../../domain/models/TrainingEvidence'
import { correctAttendanceInputSchema } from '../../../application/validation/trainingEvidenceSchemas'
import { collectFieldErrors, type FormFieldErrors } from '../../../application/validation/formFieldSchemas'
import { Button, Modal } from '../../design/ui'
import { formatCalendarDate } from '../../utilities/jobOpeningDisplay'
import { trainingAttendanceLabels } from '../../utilities/trainingDisplay'
import { evidenceAppendOnlyNotice } from '../../utilities/trainingNoticeCopy'
import { WorkerProfileTextArea } from '../workerProfile/WorkerProfileTextArea'

interface AttendanceCorrectionModalProps {
  /** The current record being corrected; null closes the modal. */
  readonly currentRecord: TrainingAttendanceEvidence | null
  readonly isSubmitting: boolean
  readonly onSubmit: (currentRecord: TrainingAttendanceEvidence, correctInput: CorrectTrainingAttendanceInput) => Promise<boolean>
  readonly onClose: () => void
}

interface CorrectionFormProps extends Omit<AttendanceCorrectionModalProps, 'currentRecord'> {
  readonly currentRecord: TrainingAttendanceEvidence
}

function AttendanceCorrectionForm({ currentRecord, isSubmitting, onSubmit, onClose }: CorrectionFormProps): ReactElement {
  const statusGroupId = useId()
  const [attendanceStatus, setAttendanceStatus] = useState<TrainingAttendanceStatus>(currentRecord.attendanceStatus)
  const [progressNote, setProgressNote] = useState<string>(currentRecord.progressNote ?? '')
  const [correctionReason, setCorrectionReason] = useState<string>('')
  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors>({})

  const submitCorrection = async (): Promise<void> => {
    const candidateInput = {
      attendanceId: currentRecord.evidenceId,
      attendanceStatus,
      progressNote,
      correctionReason,
    }
    const parseResult = correctAttendanceInputSchema.safeParse(candidateInput)
    if (!parseResult.success) {
      setFieldErrors(collectFieldErrors(parseResult.error))
      return
    }
    setFieldErrors({})
    if (await onSubmit(currentRecord, parseResult.data)) {
      onClose()
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-ink-700)]">
        {formatCalendarDate(currentRecord.sessionDate)}: recorded as {trainingAttendanceLabels[currentRecord.attendanceStatus]}.
      </p>
      <fieldset className="space-y-2">
        <legend id={statusGroupId} className="text-sm font-medium text-[var(--color-ink-900)]">
          Corrected attendance
        </legend>
        <div className="flex gap-4">
          {trainingAttendanceStatuses.map((statusOption) => (
            <label key={statusOption} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${statusGroupId}-status`}
                checked={attendanceStatus === statusOption}
                onChange={(): void => {
                  setAttendanceStatus(statusOption)
                }}
              />
              {trainingAttendanceLabels[statusOption]}
            </label>
          ))}
        </div>
      </fieldset>
      <WorkerProfileTextArea
        fieldName="attendance-correction-note"
        label="Progress note (optional)"
        value={progressNote}
        maximumLength={limits.progressNoteMaxLength}
        errorText={fieldErrors.progressNote}
        rows={2}
        onValueChange={setProgressNote}
      />
      <WorkerProfileTextArea
        fieldName="attendance-correction-reason"
        label="Reason for the correction (required, 10 to 300 characters)"
        value={correctionReason}
        maximumLength={limits.correctionReasonMaxLength}
        errorText={fieldErrors.correctionReason}
        rows={2}
        onValueChange={setCorrectionReason}
      />
      <p className="text-xs text-[var(--color-ink-500)]">{evidenceAppendOnlyNotice}</p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          isLoading={isSubmitting}
          onClick={(): void => {
            void submitCorrection()
          }}
        >
          Record correction
        </Button>
      </div>
    </div>
  )
}

/** A correction adds a new record with a reason; the earlier record stays in the history. */
export function AttendanceCorrectionModal(modalProps: AttendanceCorrectionModalProps): ReactElement {
  const { currentRecord, onClose } = modalProps
  return (
    <Modal isOpen={currentRecord !== null} onClose={onClose} title="Correct attendance">
      {currentRecord === null ? null : (
        <AttendanceCorrectionForm key={currentRecord.evidenceId} {...modalProps} currentRecord={currentRecord} />
      )}
    </Modal>
  )
}
