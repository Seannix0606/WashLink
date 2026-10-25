import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarketplaceService } from '../../../../application/services/MarketplaceService'
import { buildJobOpening, testJobOpeningIdentifier } from '../../../../test/fixtures'
import {
  buildMarketplaceJobOpening,
  createMockMarketplaceRepository,
} from '../../../../test/jobApplicationFixtures'
import { ApplyToOpeningModal } from './ApplyToOpeningModal'
import { MarketplaceOpeningDetail } from './MarketplaceOpeningDetail'

const disclaimer = 'Details as entered by the shop. WashLink does not verify pay or employment terms.'
const certificationWarning =
  'WashLink certifications are not available yet, so shops will not see any verified certifications for any applicant.'

function renderDetail(applicantRequirement: 'certification_required' | 'trainees_welcome'): void {
  const marketplaceRepository = createMockMarketplaceRepository()
  marketplaceRepository.fetchJobOpening.mockResolvedValue(
    buildJobOpening({
      status: 'published',
      applicantRequirement,
      compensationDetails: 'Daily rate plus tips, as discussed.',
    }),
  )
  render(
    <MarketplaceOpeningDetail
      marketplaceService={new MarketplaceService(marketplaceRepository)}
      selectedJobOpening={buildMarketplaceJobOpening({ applicantRequirement })}
      onApplyRequested={vi.fn()}
      onClose={vi.fn()}
    />,
  )
}

describe('Marketplace opening detail (W5)', () => {
  it('w5_opening_detail_shows_details_as_entered_disclaimer', async () => {
    renderDetail('trainees_welcome')
    const dialog = screen.getByRole('dialog', { name: 'Job opening details' })
    const disclaimerNote = await within(dialog).findByRole('note')
    expect(disclaimerNote).toHaveTextContent(disclaimer)
    // Pay shows the owner's own words only; no amount is invented.
    expect(within(dialog).getByText('Daily rate plus tips, as discussed.')).toBeInTheDocument()
    expect(within(dialog).queryByText(/PHP/)).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Apply' })).toBeInTheDocument()
    expect(within(dialog).queryByText(certificationWarning)).toBeNull()
  })

  it('w5_certification_required_opening_warns_no_verified_certification', async () => {
    renderDetail('certification_required')
    const dialog = screen.getByRole('dialog', { name: 'Job opening details' })
    expect(await within(dialog).findByText(certificationWarning)).toBeInTheDocument()
    expect(within(dialog).getByText('Shop-issued certification required')).toBeInTheDocument()

    // The apply dialog repeats the warning before the worker sends anything.
    render(
      <ApplyToOpeningModal
        applyTarget={{
          jobOpeningId: testJobOpeningIdentifier,
          title: 'Car wash attendant',
          shopName: 'Test Shop',
          applicantRequirement: 'certification_required',
          openingRequirements: {
            kind: 'loaded',
            requirements: { minimumQualifications: [], preferredQualifications: [], requiredTraining: null },
          },
          initialCoverNote: '',
        }}
        hasWorkerProfile
        isSubmitting={false}
        errorMessage={null}
        onSubmit={vi.fn()}
        onCreateProfileRequested={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const applyDialog = screen.getByRole('dialog', { name: 'Apply to this job opening' })
    expect(within(applyDialog).getByText(certificationWarning)).toBeInTheDocument()
  })
})
