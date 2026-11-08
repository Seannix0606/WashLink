import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
  buildMyTraining,
  buildTrainingEnrollment,
  buildTrainingProgram,
  buildTrainingProgress,
  createTrainingTestHarness,
} from '../../../../test/trainingFixtures'
import { failedTrainingExplanation, shopRemovedExplanation } from '../../../utilities/trainingDisplay'
import { failedAfterShopRemovedExplanation, leaveTrainingConfirmationText, leaveTrainingLocationText } from '../../../utilities/trainingNoticeCopy'
import { MyTrainingProgress } from './MyTrainingProgress'
import { MyTrainingsPanel } from './MyTrainingsPanel'

describe('My training progress holds (W16 D-84, D-85)', () => {
  it('w16_failed_training_explains_hold_and_leave_option', async () => {
    expect(failedTrainingExplanation).toBe(
      'Your assessment is recorded as not passed. This training stays open until the shop records a passing correction or cancels it, or you leave it. While it stays open, WashLink refuses this owner\'s requests to assign you to their customer bookings through a linked roster entry. You can leave at any time: close this window and press "Leave training" on this training in your list.',
    )
    const user = userEvent.setup()
    const harness = createTrainingTestHarness()
    const enrollment = buildTrainingEnrollment({ status: 'accepted', acceptedAt: '2026-10-18T01:00:00+00:00' })
    harness.enrollmentRepository.listMyEnrollments.mockResolvedValue([enrollment])
    harness.enrollmentRepository.listProgress.mockResolvedValue([
      buildTrainingProgress({ enrollmentStatus: 'accepted', attendedTrainingDays: 3, hasRecordedAttendance: true, currentAssessmentId: 'assessment', currentAssessmentResult: 'failed', progressStatus: 'failed' }),
    ])
    harness.programRepository.listProgramsByIds.mockResolvedValue([buildTrainingProgram({ status: 'open' })])

    render(<MyTrainingsPanel trainingDependencies={harness.trainingDependencies} />)
    const trainingList = await screen.findByRole('list', { name: 'My training list' })
    // The release path is reachable from the list, next to the records.
    expect(within(trainingList).getByRole('button', { name: 'Leave training' })).toBeInTheDocument()
    await user.click(within(trainingList).getByRole('button', { name: 'View progress and records' }))
    expect(within(screen.getByRole('dialog')).getByText(failedTrainingExplanation)).toHaveAttribute('role', 'status')
  })

  it('w16_failed_then_shop_removed_says_only_leaving_ends_it', async () => {
    expect(failedAfterShopRemovedExplanation).toBe(
      'Your assessment is recorded as not passed and the shop is no longer on WashLink. This training stays open until you leave it. While it stays open, WashLink refuses this owner\'s requests to assign you to their customer bookings through a linked roster entry. You can leave at any time: close this window and press "Leave training" on this training in your list.',
    )
    const user = userEvent.setup()
    const harness = createTrainingTestHarness()
    // The server keeps progress `failed` after the shop is deleted (w6d); only the enrollment's shop is null.
    harness.enrollmentRepository.listMyEnrollments.mockResolvedValue([
      buildTrainingEnrollment({ status: 'accepted', acceptedAt: '2026-10-18T01:00:00+00:00', shopId: null }),
    ])
    harness.enrollmentRepository.listProgress.mockResolvedValue([
      buildTrainingProgress({ enrollmentStatus: 'accepted', attendedTrainingDays: 3, hasRecordedAttendance: true, currentAssessmentId: 'assessment', currentAssessmentResult: 'failed', progressStatus: 'failed' }),
    ])

    render(<MyTrainingsPanel trainingDependencies={harness.trainingDependencies} />)
    const trainingList = await screen.findByRole('list', { name: 'My training list' })
    expect(within(trainingList).getByRole('button', { name: 'Leave training' })).toBeInTheDocument()
    await user.click(within(trainingList).getByRole('button', { name: 'View progress and records' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(failedAfterShopRemovedExplanation)).toHaveAttribute('role', 'status')
    // No text may promise a correction or cancel that nobody can record any more.
    expect(within(dialog).queryByText(failedTrainingExplanation)).toBeNull()
    expect(dialog).not.toHaveTextContent('records a correction')
  })

  it('w16_shop_removed_explains_hold', () => {
    expect(shopRemovedExplanation).toBe(
      'This shop is no longer on WashLink. Your training records are kept for you; nobody can add new records. This training stays open until you leave it. While it stays open, WashLink refuses this owner\'s requests to assign you to their customer bookings through a linked roster entry. You can leave at any time: close this window and press "Leave training" on this training in your list.',
    )
    const harness = createTrainingTestHarness()
    render(
      <MyTrainingProgress
        trainingEvidenceService={harness.trainingDependencies.trainingEvidenceService}
        myTraining={buildMyTraining({
          enrollment: buildTrainingEnrollment({ status: 'accepted', shopId: null }),
          progress: buildTrainingProgress({ enrollmentStatus: 'accepted', progressStatus: 'shop_removed' }),
          program: null,
          sessions: [],
        })}
      />,
    )
    expect(screen.getByText(shopRemovedExplanation)).toHaveAttribute('role', 'status')
    expect(screen.queryByText(failedTrainingExplanation)).toBeNull()
  })

  it('w16_hold_explanations_name_the_leave_button', () => {
    expect(leaveTrainingLocationText).toContain('"Leave training"')
    for (const explanation of [failedTrainingExplanation, failedAfterShopRemovedExplanation, shopRemovedExplanation]) {
      expect(explanation.endsWith(leaveTrainingLocationText)).toBe(true)
    }
  })

  it('w16_leave_confirm_states_the_facts_of_leaving', async () => {
    const user = userEvent.setup()
    const harness = createTrainingTestHarness()
    harness.enrollmentRepository.listMyEnrollments.mockResolvedValue([buildTrainingEnrollment({ status: 'accepted', acceptedAt: '2026-10-18T01:00:00+00:00' })])
    harness.enrollmentRepository.listProgress.mockResolvedValue([buildTrainingProgress({ enrollmentStatus: 'accepted', progressStatus: 'failed' })])
    render(<MyTrainingsPanel trainingDependencies={harness.trainingDependencies} />)
    await user.click(await screen.findByRole('button', { name: 'Leave training' }))
    expect(within(screen.getByRole('dialog', { name: 'Leave this training?' })).getByText(leaveTrainingConfirmationText)).toBeInTheDocument()

    for (const fact of [
      "This training's owner may then be able to assign you to their customer bookings.",
      'If a not-passed assessment is recorded, it can no longer be corrected once you leave.',
      'A new invitation starts again at 0 attended days.',
      'Your records stay visible to you.',
    ]) {
      expect(leaveTrainingConfirmationText).toContain(fact)
    }
    expect(leaveTrainingConfirmationText).not.toMatch(/your choice|legal|\bright/i)
  })

  it('w16_free_training_wording_is_a_washlink_rule', async () => {
    const harness = createTrainingTestHarness()
    render(<MyTrainingsPanel trainingDependencies={harness.trainingDependencies} />)
    expect(await screen.findByText(/WashLink rule: it is free for you\./)).toBeInTheDocument()
    expect(screen.queryByText(/always free/i)).toBeNull()
  })
})
