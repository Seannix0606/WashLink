import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { JobApplicationService } from '../../../../application/services/JobApplicationService'
import { MarketplaceService } from '../../../../application/services/MarketplaceService'
import {
  certificationWorkflowStatus,
  currentWorkerVerifiedCertificationState,
} from '../../../../domain/models/VerifiedCertification'
import { buildJobOpening, testJobOpeningIdentifier } from '../../../../test/fixtures'
import {
  buildMarketplaceJobOpening,
  createMockJobApplicationRepository,
  createMockMarketplaceRepository,
} from '../../../../test/jobApplicationFixtures'
import { describeNoVerifiedCertifications } from '../../../utilities/jobApplicationDisplay'
import {
  certificationsNotAvailableYetWarning,
  describeWorkerCertificationWarning,
  noVerifiedCertificationWarning,
} from '../../../utilities/workforceNoticeCopy'
import { ApplyToOpeningModal } from './ApplyToOpeningModal'
import { WorkerMarketplacePanel } from './WorkerMarketplacePanel'

describe('Apply flow shows qualifications and required training (W5 spec C)', () => {
  it('w5_apply_flow_shows_qualifications_and_required_training_before_submit', async () => {
    const user = userEvent.setup()
    const marketplaceRepository = createMockMarketplaceRepository()
    marketplaceRepository.searchJobOpenings.mockResolvedValue([
      buildMarketplaceJobOpening({ title: 'Detailer' }),
    ])
    marketplaceRepository.fetchJobOpening.mockResolvedValue(
      buildJobOpening({
        status: 'published',
        title: 'Detailer',
        minimumQualifications: ['Can lift 10 kg'],
        preferredQualifications: ['Interior detailing experience'],
        requiredTraining: '3-day shop orientation, free for the worker.',
      }),
    )
    const jobApplicationRepository = createMockJobApplicationRepository()
    render(
      <WorkerMarketplacePanel
        marketplaceService={new MarketplaceService(marketplaceRepository)}
        jobApplicationService={new JobApplicationService(jobApplicationRepository)}
        hasWorkerProfile
        onCreateProfileRequested={(): void => undefined}
      />,
    )

    // "Apply" on the card opens the full details, not the apply dialog directly.
    await user.click(await screen.findByRole('button', { name: 'Apply: Detailer' }))
    const detailDialog = await screen.findByRole('dialog', { name: 'Job opening details' })
    expect(await within(detailDialog).findByText('Can lift 10 kg')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Apply to this job opening' })).toBeNull()

    await user.click(within(detailDialog).getByRole('button', { name: 'Apply' }))
    const applyDialog = await screen.findByRole('dialog', { name: 'Apply to this job opening' })
    const requirements = within(applyDialog).getByRole('region', {
      name: 'Qualifications and required training',
    })
    expect(within(requirements).getByRole('list', { name: 'Minimum qualifications' })).toHaveTextContent(
      'Can lift 10 kg',
    )
    expect(within(requirements).getByRole('list', { name: 'Preferred qualifications' })).toHaveTextContent(
      'Interior detailing experience',
    )
    expect(requirements).toHaveTextContent('3-day shop orientation, free for the worker.')
    // The requirements come before the send button, and nothing was sent yet.
    const sendButton = within(applyDialog).getByRole('button', { name: 'Send application' })
    expect(requirements.compareDocumentPosition(sendButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(jobApplicationRepository.createApplication).not.toHaveBeenCalled()
  })

  it('w5_apply_dialog_blocks_send_until_requirements_are_shown', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ApplyToOpeningModal
        applyTarget={{
          jobOpeningId: testJobOpeningIdentifier,
          title: 'Car wash attendant',
          shopName: '',
          applicantRequirement: null,
          openingRequirements: { kind: 'loading' },
          initialCoverNote: 'Draft note',
        }}
        hasWorkerProfile
        isSubmitting={false}
        errorMessage={null}
        onSubmit={onSubmit}
        onCreateProfileRequested={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const applyDialog = screen.getByRole('dialog', { name: 'Apply to this job opening' })
    expect(within(applyDialog).getByLabelText('Loading qualifications and required training')).toBeInTheDocument()
    await user.click(within(applyDialog).getByRole('checkbox', { name: /I have read the training and work notice/ }))
    expect(within(applyDialog).getByRole('button', { name: 'Send application' })).toBeDisabled()
  })

  it('w5_certification_copy_depends_on_certification_state', () => {
    // Until W7 the workflow is unavailable for everyone, and the copy says exactly that.
    expect(certificationWorkflowStatus.isAvailable).toBe(false)
    expect(describeWorkerCertificationWarning(currentWorkerVerifiedCertificationState)).toBe(
      certificationsNotAvailableYetWarning,
    )
    expect(certificationsNotAvailableYetWarning).toBe(
      'WashLink certifications are not available yet, so shops will not see any verified certifications for any applicant.',
    )
    // Once W7 supplies the real state.
    expect(
      describeWorkerCertificationWarning({ isWorkflowAvailable: true, hasVerifiedCertifications: false }),
    ).toBe(noVerifiedCertificationWarning)
    expect(
      describeWorkerCertificationWarning({ isWorkflowAvailable: true, hasVerifiedCertifications: true }),
    ).toBeNull()
    // The owner side mirrors it.
    expect(describeNoVerifiedCertifications(false).title).toBe('Verified certifications: not available yet')
    expect(describeNoVerifiedCertifications(true).title).toBe('Verified certifications: none yet')
  })
})
