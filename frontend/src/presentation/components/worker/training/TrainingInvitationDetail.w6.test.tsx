import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { buildMyTraining, createTrainingTestHarness } from '../../../../test/trainingFixtures'
import { TrainingInvitationDetail } from './TrainingInvitationDetail'

describe('Training invitation (W6 stale schedule)', () => {
  it('w6_stale_schedule_error_refreshes_invitation', async () => {
    const user = userEvent.setup()
    const harness = createTrainingTestHarness()
    harness.enrollmentRepository.respond.mockRejectedValue(new Error('This training program changed. Review it again.'))
    const refreshTrainings = vi.fn().mockResolvedValue(undefined)
    const onAccepted = vi.fn()
    render(
      <TrainingInvitationDetail
        trainingEnrollmentService={harness.trainingDependencies.trainingEnrollmentService}
        myTraining={buildMyTraining()}
        isDeclinePending={false}
        refreshTrainings={refreshTrainings}
        onDeclineRequested={vi.fn()}
        onAccepted={onAccepted}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: /I have read the free training notice/ }))
    await user.click(screen.getByRole('button', { name: 'Accept and enroll' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The shop changed the training schedule.')
    // The program and sessions are re-read, and the worker must acknowledge again.
    expect(refreshTrainings).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('checkbox', { name: /I have read the free training notice/ })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Accept and enroll' })).toBeDisabled()
    await waitFor(() => {
      expect(onAccepted).not.toHaveBeenCalled()
    })
  })
})
