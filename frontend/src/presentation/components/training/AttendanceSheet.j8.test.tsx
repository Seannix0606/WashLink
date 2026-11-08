import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  buildAttendanceEvidence,
  buildRosterEntry,
  buildTrainingSession,
  createTrainingTestHarness,
  testAttendanceIdentifier,
} from '../../../test/trainingFixtures'
import { TrainingEnrollmentRecordsPanel } from './TrainingEnrollmentRecordsPanel'

describe('Attendance sheet (J8 append-only evidence)', () => {
  it('j8_attendance_sheet_correction_requires_reason', async () => {
    const user = userEvent.setup()
    const harness = createTrainingTestHarness()
    harness.evidenceRepository.listEvidence.mockResolvedValue([buildAttendanceEvidence()])
    render(
      <TrainingEnrollmentRecordsPanel
        trainingEvidenceService={harness.trainingDependencies.trainingEvidenceService}
        rosterEntry={buildRosterEntry()}
        sessions={[buildTrainingSession()]}
        assessmentChecklist={['Pre-rinses the whole car']}
        onEvidenceChanged={vi.fn()}
      />,
    )

    const attendance = await screen.findByRole('region', { name: 'Attendance' })
    // A recorded day offers only a correction: no Present / Absent buttons, no edit or delete.
    expect(within(attendance).queryByRole('button', { name: 'Present' })).toBeNull()
    expect(within(attendance).queryByRole('button', { name: /delete|edit/i })).toBeNull()
    await user.click(within(attendance).getByRole('button', { name: 'Correct' }))

    const dialog = screen.getByRole('dialog', { name: 'Correct attendance' })
    await user.click(within(dialog).getByRole('radio', { name: 'Absent' }))
    await user.click(within(dialog).getByRole('button', { name: 'Record correction' }))
    expect(await within(dialog).findByText('Give a correction reason of 10 to 300 characters.')).toBeInTheDocument()
    expect(harness.evidenceRepository.correctAttendance).not.toHaveBeenCalled()

    await user.type(within(dialog).getByLabelText(/Reason for the correction/), 'Marked present by mistake.')
    await user.click(within(dialog).getByRole('button', { name: 'Record correction' }))
    await waitFor(() => {
      expect(harness.evidenceRepository.correctAttendance).toHaveBeenCalledWith({
        attendanceId: testAttendanceIdentifier,
        attendanceStatus: 'absent',
        progressNote: null,
        correctionReason: 'Marked present by mistake.',
      })
    })
    expect(harness.evidenceRepository.recordAttendance).not.toHaveBeenCalled()
  })
})
