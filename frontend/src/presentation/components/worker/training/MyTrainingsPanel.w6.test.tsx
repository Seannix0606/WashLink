import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
  buildTrainingEnrollment,
  buildTrainingProgram,
  buildTrainingProgress,
  createTrainingTestHarness,
} from '../../../../test/trainingFixtures'
import { MyTrainingsPanel } from './MyTrainingsPanel'

describe('My training panel (W6)', () => {
  it('w6_training_panels_loading_empty_error_states', async () => {
    const user = userEvent.setup()
    const harness = createTrainingTestHarness()
    let resolveEnrollments: (enrollments: []) => void = () => undefined
    harness.enrollmentRepository.listMyEnrollments.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveEnrollments = resolve
      }),
    )
    render(<MyTrainingsPanel trainingDependencies={harness.trainingDependencies} />)
    expect(screen.getByLabelText('Loading your training')).toHaveAttribute('aria-busy', 'true')
    resolveEnrollments([])
    expect(await screen.findByText('Not enrolled')).toBeInTheDocument()

    harness.enrollmentRepository.listMyEnrollments.mockRejectedValueOnce(new Error('Could not load your training.'))
    window.dispatchEvent(new Event('focus'))
    const errorNotice = await screen.findByRole('alert')
    expect(errorNotice).toHaveTextContent('Your training could not be loaded')
    harness.enrollmentRepository.listMyEnrollments.mockResolvedValueOnce([])
    await user.click(within(errorNotice).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Not enrolled')).toBeInTheDocument()
  })

  it('w6_shop_removed_training_shows_snapshot_names_and_leave', async () => {
    const user = userEvent.setup()
    const harness = createTrainingTestHarness()
    // D-18: the shop is gone (shop_id null); the enrollment keeps its snapshot names.
    harness.enrollmentRepository.listMyEnrollments.mockResolvedValue([
      buildTrainingEnrollment({
        status: 'accepted',
        shopId: null,
        shopNameSnapshot: 'Removed Test Shop',
        programTitleSnapshot: 'Snapshot program title',
        acceptedAt: '2026-10-01T01:00:00+00:00',
      }),
    ])
    harness.programRepository.listProgramsByIds.mockResolvedValue([buildTrainingProgram({ shopId: null, title: 'Changed title' })])
    harness.enrollmentRepository.listProgress.mockResolvedValue([
      buildTrainingProgress({ enrollmentStatus: 'accepted', progressStatus: 'shop_removed', attendedTrainingDays: 1 }),
    ])
    render(<MyTrainingsPanel trainingDependencies={harness.trainingDependencies} />)

    const listItem = (await screen.findByText('Snapshot program title')).closest('li') as HTMLElement
    expect(within(listItem).getByText(/Removed Test Shop/)).toBeInTheDocument()
    expect(within(listItem).getByText('Shop no longer on WashLink')).toBeInTheDocument()
    await user.click(within(listItem).getByRole('button', { name: 'View progress and records' }))
    expect(await screen.findByText(/This shop is no longer on WashLink/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    // Leaving needs a confirmation, then calls the withdraw RPC once.
    harness.enrollmentRepository.withdraw.mockResolvedValue(buildTrainingEnrollment({ status: 'withdrawn' }))
    await user.click(within(listItem).getByRole('button', { name: 'Leave training' }))
    const confirmDialog = screen.getByRole('dialog', { name: 'Leave this training?' })
    expect(harness.enrollmentRepository.withdraw).not.toHaveBeenCalled()
    await user.click(within(confirmDialog).getByRole('button', { name: 'Leave training' }))
    await waitFor(() => {
      expect(harness.enrollmentRepository.withdraw).toHaveBeenCalledTimes(1)
    })
  })
})
