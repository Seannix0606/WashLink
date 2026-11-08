import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { JobApplicationService } from '../../../../application/services/JobApplicationService'
import { MarketplaceService } from '../../../../application/services/MarketplaceService'
import {
  buildJobApplication,
  createMockJobApplicationRepository,
  createMockMarketplaceRepository,
} from '../../../../test/jobApplicationFixtures'
import { MyApplicationsPanel } from './MyApplicationsPanel'

describe('My applications: closed draft (W5 fix cycle 1)', () => {
  it('w5_closed_draft_shows_never_sent_and_can_only_be_deleted', async () => {
    const user = userEvent.setup()
    const jobApplicationRepository = createMockJobApplicationRepository()
    // The opening closed while the draft was unsent: closed, no submitted_at, no snapshot.
    const closedDraft = buildJobApplication({
      status: 'closed',
      submittedAt: null,
      noticeVersion: null,
      noticeAcknowledgedAt: null,
      openingSnapshot: null,
      openingSnapshotTakenAt: null,
      coverNote: 'Unsent note',
    })
    jobApplicationRepository.listMyApplications.mockResolvedValue([closedDraft])
    jobApplicationRepository.listCurrentOpeningVersions.mockResolvedValue([])
    jobApplicationRepository.deleteDraft.mockResolvedValue(undefined)
    const jobApplicationService = new JobApplicationService(jobApplicationRepository)
    render(
      <MyApplicationsPanel
        jobApplicationService={jobApplicationService}
        marketplaceService={new MarketplaceService(createMockMarketplaceRepository())}
        hasWorkerProfile
        onCreateProfileRequested={(): void => undefined}
      />,
    )

    const listItem = (await screen.findByText('Closed (never sent)')).closest('li') as HTMLElement
    expect(within(listItem).getByText(/The shop never received it\./)).toBeInTheDocument()
    expect(within(listItem).getByText(/Not sent yet/)).toBeInTheDocument()
    // No snapshot is expected and nothing can be sent.
    expect(within(listItem).queryByRole('button', { name: 'What you applied to' })).toBeNull()
    expect(within(listItem).queryByRole('button', { name: 'Review and send' })).toBeNull()
    expect(within(listItem).queryByRole('button', { name: /Withdraw|Decline/ })).toBeNull()
    await expect(jobApplicationService.submitDraft(closedDraft, '', true)).rejects.toThrow(
      'This application status change is not allowed.',
    )

    // Delete asks for confirmation first.
    await user.click(within(listItem).getByRole('button', { name: 'Delete draft' }))
    const confirmDialog = screen.getByRole('dialog', { name: 'Delete this draft?' })
    expect(jobApplicationRepository.deleteDraft).not.toHaveBeenCalled()
    jobApplicationRepository.listMyApplications.mockResolvedValue([])
    await user.click(within(confirmDialog).getByRole('button', { name: 'Delete draft' }))
    await waitFor(() => {
      expect(jobApplicationRepository.deleteDraft).toHaveBeenCalledWith(closedDraft.id)
    })
    expect(jobApplicationRepository.transition).not.toHaveBeenCalled()
  })
})
