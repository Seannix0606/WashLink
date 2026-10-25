import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { JobApplicationService } from '../../../../application/services/JobApplicationService'
import { MarketplaceService } from '../../../../application/services/MarketplaceService'
import {
  buildCurrentOpeningVersion,
  buildJobApplication,
  buildOpeningSnapshot,
  createMockJobApplicationRepository,
  createMockMarketplaceRepository,
  testSecondJobApplicationIdentifier,
} from '../../../../test/jobApplicationFixtures'
import { MyApplicationsPanel } from './MyApplicationsPanel'

function renderPanel(jobApplicationRepository: ReturnType<typeof createMockJobApplicationRepository>): void {
  render(
    <MyApplicationsPanel
      jobApplicationService={new JobApplicationService(jobApplicationRepository)}
      marketplaceService={new MarketplaceService(createMockMarketplaceRepository())}
      hasWorkerProfile
      onCreateProfileRequested={(): void => undefined}
    />,
  )
}

function listItemFor(title: string): HTMLElement {
  return within(screen.getByRole('list', { name: 'My applications' })).getByText(title).closest('li') as HTMLElement
}

describe('My applications panel (W5)', () => {
  it('w5_my_applications_shows_snapshot_and_edited_since_notice', async () => {
    const user = userEvent.setup()
    const jobApplicationRepository = createMockJobApplicationRepository()
    jobApplicationRepository.listMyApplications.mockResolvedValue([
      buildJobApplication({
        openingSnapshot: buildOpeningSnapshot({
          title: 'Original title',
          compensationDetails: 'PHP 600 per day as first posted',
          jobOpeningUpdatedAt: '2026-10-24T00:00:00.123456+00:00',
        }),
      }),
    ])
    // The shop edited the opening later: newer updated_at and a new title.
    jobApplicationRepository.listCurrentOpeningVersions.mockResolvedValue([
      buildCurrentOpeningVersion({ title: 'Edited title', updatedAt: '2026-10-26T00:00:00.000001+00:00' }),
    ])
    renderPanel(jobApplicationRepository)

    const listItem = await waitFor(() => listItemFor('Original title'))
    expect(within(listItem).getByText('The shop edited this opening after you applied.')).toBeInTheDocument()
    expect(within(listItem).getByText('Submitted')).toBeInTheDocument()

    await user.click(within(listItem).getByRole('button', { name: 'What you applied to' }))
    const snapshotDialog = screen.getByRole('dialog', { name: 'What you applied to' })
    expect(within(snapshotDialog).getByText(/^As you applied on /)).toBeInTheDocument()
    expect(within(snapshotDialog).getByRole('note')).toHaveTextContent('The shop edited this opening after you applied.')
    // The frozen version is shown, not the current one.
    expect(within(snapshotDialog).getByText('PHP 600 per day as first posted')).toBeInTheDocument()
    expect(within(snapshotDialog).queryByText('Edited title')).toBeNull()

    await user.click(within(snapshotDialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    // Without a later edit there is no notice (the list refreshes on window focus).
    jobApplicationRepository.listCurrentOpeningVersions.mockResolvedValue([buildCurrentOpeningVersion()])
    jobApplicationRepository.listMyApplications.mockResolvedValue([buildJobApplication()])
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => {
      expect(screen.queryByText('The shop edited this opening after you applied.')).toBeNull()
    })
  })

  it('w5_withdraw_requires_confirmation', async () => {
    const user = userEvent.setup()
    const jobApplicationRepository = createMockJobApplicationRepository()
    const submittedApplication = buildJobApplication({
      openingSnapshot: buildOpeningSnapshot({ title: 'Submitted opening' }),
    })
    const acceptedApplication = buildJobApplication({
      id: testSecondJobApplicationIdentifier,
      status: 'accepted',
      decidedAt: '2026-10-26T00:00:00+00:00',
      openingSnapshot: buildOpeningSnapshot({ title: 'Accepted opening' }),
    })
    jobApplicationRepository.listMyApplications.mockResolvedValue([submittedApplication, acceptedApplication])
    jobApplicationRepository.listCurrentOpeningVersions.mockResolvedValue([])
    jobApplicationRepository.transition.mockResolvedValue(buildJobApplication({ status: 'withdrawn' }))
    renderPanel(jobApplicationRepository)

    const acceptedItem = await waitFor(() => listItemFor('Accepted opening'))
    expect(within(acceptedItem).getByText(/This is not a contract or a job guarantee\./)).toBeInTheDocument()
    expect(within(acceptedItem).getByRole('button', { name: 'Decline' })).toBeInTheDocument()

    await user.click(within(listItemFor('Submitted opening')).getByRole('button', { name: 'Withdraw' }))
    const confirmDialog = screen.getByRole('dialog', { name: 'Withdraw this application?' })
    expect(within(confirmDialog).getByText('Submitted opening')).toBeInTheDocument()
    expect(jobApplicationRepository.transition).not.toHaveBeenCalled()
    await user.click(within(confirmDialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(jobApplicationRepository.transition).not.toHaveBeenCalled()

    await user.click(within(listItemFor('Submitted opening')).getByRole('button', { name: 'Withdraw' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Withdraw this application?' })).getByRole('button', {
        name: 'Withdraw application',
      }),
    )
    await waitFor(() => {
      expect(jobApplicationRepository.transition).toHaveBeenCalledWith(
        submittedApplication.id,
        'submitted',
        'withdrawn',
        null,
      )
    })
    expect(jobApplicationRepository.transition).toHaveBeenCalledTimes(1)
  })
})
