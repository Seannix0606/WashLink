import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { JobApplicationService } from '../../../../application/services/JobApplicationService'
import { testJobOpeningIdentifier } from '../../../../test/fixtures'
import {
  buildMarketplaceJobOpening,
  createMockJobApplicationRepository,
} from '../../../../test/jobApplicationFixtures'
import { ApplyToOpeningModal, type ApplyTarget } from './ApplyToOpeningModal'
import { MarketplaceOpeningCard } from './MarketplaceOpeningCard'

const applyTarget: ApplyTarget = {
  jobOpeningId: testJobOpeningIdentifier,
  title: 'Car wash attendant',
  shopName: 'Test Shop',
  applicantRequirement: 'trainees_welcome',
  openingRequirements: {
    kind: 'loaded',
    requirements: { minimumQualifications: [], preferredQualifications: [], requiredTraining: null },
  },
  initialCoverNote: '',
}

describe('Apply flow (J4 browse and apply)', () => {
  it('j4_apply_disabled_until_notice_acknowledged', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ApplyToOpeningModal
        applyTarget={applyTarget}
        hasWorkerProfile
        isSubmitting={false}
        errorMessage={null}
        onSubmit={onSubmit}
        onCreateProfileRequested={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const dialog = screen.getByRole('dialog', { name: 'Apply to this job opening' })
    const sendButton = within(dialog).getByRole('button', { name: 'Send application' })
    expect(sendButton).toBeDisabled()
    await user.click(sendButton)
    expect(onSubmit).not.toHaveBeenCalled()

    await user.type(within(dialog).getByLabelText('Cover note (optional)'), 'I can start next week.')
    expect(sendButton).toBeDisabled()
    await user.click(within(dialog).getByRole('checkbox', { name: /I have read the training and work notice/ }))
    expect(sendButton).toBeEnabled()
    await user.click(sendButton)
    expect(onSubmit).toHaveBeenCalledWith('I can start next week.', true)

    // The service refuses an unacknowledged notice before any request is made.
    const jobApplicationRepository = createMockJobApplicationRepository()
    const jobApplicationService = new JobApplicationService(jobApplicationRepository)
    await expect(jobApplicationService.apply(testJobOpeningIdentifier, '', false)).rejects.toThrow(
      'Review the training and work notice before applying.',
    )
    expect(jobApplicationRepository.createApplication).not.toHaveBeenCalled()
  })

  it('j4_opening_with_live_application_shows_status_not_apply_button', async () => {
    const user = userEvent.setup()
    const onViewDetailsRequested = vi.fn()
    render(
      <ul>
        <MarketplaceOpeningCard
          jobOpening={buildMarketplaceJobOpening({
            jobOpeningId: 'applied-opening',
            title: 'Applied opening',
            myApplicationStatus: 'under_review',
          })}
          onViewDetailsRequested={onViewDetailsRequested}
        />
        <MarketplaceOpeningCard
          jobOpening={buildMarketplaceJobOpening({ jobOpeningId: 'open-opening', title: 'Open opening' })}
          onViewDetailsRequested={onViewDetailsRequested}
        />
      </ul>,
    )
    const appliedCard = screen.getByText('Applied opening').closest('li') as HTMLElement
    expect(within(appliedCard).getByText('Your application: Under review')).toBeInTheDocument()
    expect(within(appliedCard).queryByRole('button', { name: /^Apply/ })).toBeNull()
    expect(within(appliedCard).getByRole('button', { name: 'View details: Applied opening' })).toBeInTheDocument()

    const openCard = screen.getByText('Open opening').closest('li') as HTMLElement
    expect(within(openCard).getByRole('button', { name: 'Apply: Open opening' })).toBeInTheDocument()
    expect(within(openCard).queryByText(/Your application/)).toBeNull()
    // "Apply" on a card opens the full details first (qualifications and required training).
    await user.click(within(openCard).getByRole('button', { name: 'Apply: Open opening' }))
    expect(onViewDetailsRequested).toHaveBeenCalledWith(expect.objectContaining({ jobOpeningId: 'open-opening' }))
  })
})
