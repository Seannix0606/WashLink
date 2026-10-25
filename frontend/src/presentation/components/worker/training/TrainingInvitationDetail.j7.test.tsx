import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { buildMyTraining, buildTrainingEnrollment, buildTrainingProgram, createTrainingTestHarness } from '../../../../test/trainingFixtures'
import { trainingNoticeText } from '../../../utilities/trainingNoticeCopy'
import { TrainingInvitationDetail } from './TrainingInvitationDetail'

function renderInvitation(harness = createTrainingTestHarness(), myTraining = buildMyTraining()): ReturnType<typeof createTrainingTestHarness> {
  render(
    <TrainingInvitationDetail
      trainingEnrollmentService={harness.trainingDependencies.trainingEnrollmentService}
      myTraining={myTraining}
      isDeclinePending={false}
      refreshTrainings={vi.fn().mockResolvedValue(undefined)}
      onDeclineRequested={vi.fn()}
      onAccepted={vi.fn()}
    />,
  )
  return harness
}

describe('Training invitation (J7 free training)', () => {
  it('j7_training_invitation_shows_free_training_notice_before_accept', () => {
    renderInvitation(createTrainingTestHarness(), buildMyTraining({
      program: buildTrainingProgram({ trainingPayDetails: 'Lunch provided on training days' }),
    }))
    const notice = screen.getByText(trainingNoticeText)
    const objectives = screen.getByText('Learn safe hand washing.')
    // The notice comes before every program detail.
    expect(notice.compareDocumentPosition(objectives) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('Training fee: none. Required initial training is free for you.')).toBeInTheDocument()
    expect(screen.getByText('Lunch provided on training days')).toBeInTheDocument()
    expect(screen.getByText(/these details and dates are recorded with your enrollment as the agreed training terms/)).toBeInTheDocument()
    expect(screen.getByText(/not a contract, a job offer or a certification/)).toBeInTheDocument()
  })

  it('j7_accept_disabled_until_notice_acknowledged', async () => {
    const user = userEvent.setup()
    const harness = createTrainingTestHarness()
    harness.enrollmentRepository.respond.mockResolvedValue(buildTrainingEnrollment({ status: 'accepted' }))
    renderInvitation(harness)

    const acceptButton = screen.getByRole('button', { name: 'Accept and enroll' })
    expect(acceptButton).toBeDisabled()
    const acknowledgement = screen.getByRole('checkbox', { name: /I have read the free training notice/ })
    expect(acknowledgement).not.toBeChecked()
    await user.click(acknowledgement)
    expect(acceptButton).toBeEnabled()
    await user.click(acceptButton)

    await waitFor(() => {
      expect(harness.enrollmentRepository.respond).toHaveBeenCalledWith({
        enrollmentId: buildTrainingEnrollment().id,
        accept: true,
        noticeVersion: 'w6_v1',
        expectedScheduleChangedAt: buildTrainingProgram().scheduleChangedAt,
      })
    })
  })
})
