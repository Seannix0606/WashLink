import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  buildTrainingEnrollment,
  buildTrainingProgram,
  buildTrainingProgress,
  buildTrainingSession,
  createTrainingTestHarness,
} from '../../../../test/trainingFixtures'
import { MyTrainingsPanel } from './MyTrainingsPanel'

function acceptedEnrollment(): ReturnType<typeof buildTrainingEnrollment> {
  return buildTrainingEnrollment({
    status: 'accepted',
    acceptedAt: '2026-10-01T01:00:00+00:00',
    noticeVersion: 'w6_v1',
    noticeAcknowledgedAt: '2026-10-01T01:00:00+00:00',
  })
}

describe('My training (J6 progress from evidence)', () => {
  it('j6_progress_view_uses_server_progress_not_dates', async () => {
    const harness = createTrainingTestHarness()
    harness.enrollmentRepository.listMyEnrollments.mockResolvedValue([acceptedEnrollment()])
    harness.programRepository.listProgramsByIds.mockResolvedValue([buildTrainingProgram()])
    // Every training day is in the past, but no attendance was recorded: the server says "scheduled".
    harness.programRepository.listSessions.mockResolvedValue([
      buildTrainingSession({ id: 's1', sessionDate: '2026-10-02' }),
      buildTrainingSession({ id: 's2', sessionDate: '2026-10-03' }),
      buildTrainingSession({ id: 's3', sessionDate: '2026-10-04' }),
    ])
    harness.enrollmentRepository.listProgress.mockResolvedValue([
      buildTrainingProgress({ enrollmentStatus: 'accepted', progressStatus: 'scheduled', attendedTrainingDays: 0 }),
    ])
    render(<MyTrainingsPanel trainingDependencies={harness.trainingDependencies} />)

    const listItem = (await screen.findByText('Hand wash basics')).closest('li') as HTMLElement
    expect(within(listItem).getByText('Scheduled')).toBeInTheDocument()
    expect(within(listItem).getByText('0 of 3 training days attended')).toBeInTheDocument()
    expect(within(listItem).queryByText('Completed')).toBeNull()
    expect(harness.enrollmentRepository.listProgress).toHaveBeenCalledWith([acceptedEnrollment().id])
  })

  it('j6_my_training_shows_days_attended_of_required', async () => {
    const harness = createTrainingTestHarness()
    harness.enrollmentRepository.listMyEnrollments.mockResolvedValue([acceptedEnrollment()])
    harness.programRepository.listProgramsByIds.mockResolvedValue([buildTrainingProgram()])
    harness.enrollmentRepository.listProgress.mockResolvedValue([
      buildTrainingProgress({ enrollmentStatus: 'accepted', progressStatus: 'in_progress', attendedTrainingDays: 2, hasRecordedAttendance: true }),
    ])
    render(<MyTrainingsPanel trainingDependencies={harness.trainingDependencies} />)

    const listItem = (await screen.findByText('Hand wash basics')).closest('li') as HTMLElement
    expect(within(listItem).getByText('In progress')).toBeInTheDocument()
    expect(within(listItem).getByText('2 of 3 training days attended')).toBeInTheDocument()
    expect(within(listItem).getByText('Assessment: after the required training days')).toBeInTheDocument()
    expect(within(listItem).getByRole('button', { name: 'Leave training' })).toBeInTheDocument()
  })
})
