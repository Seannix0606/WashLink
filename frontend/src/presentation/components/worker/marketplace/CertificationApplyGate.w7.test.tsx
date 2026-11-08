import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApplicantPipelineService } from '../../../../application/services/ApplicantPipelineService'
import { createCertificationTestHarness, buildMyCertification } from '../../../../test/certificationFixtures'
import { testJobOpeningIdentifier } from '../../../../test/fixtures'
import {
  buildApplicantProfile,
  buildJobApplication,
  createMockApplicantPipelineRepository,
} from '../../../../test/jobApplicationFixtures'
import { certificationRequiredApplyBlockedText } from '../../../utilities/certificationCopy'
import { ApplicantProfileDrawer } from '../../owner/applicants/ApplicantProfileDrawer'
import { ApplyToOpeningModal } from './ApplyToOpeningModal'

function renderApply(hasCurrentCertification: boolean, applicantRequirement: 'certification_required' | 'trainees_welcome'): HTMLElement {
  render(
    <ApplyToOpeningModal
      applyTarget={{
        jobOpeningId: testJobOpeningIdentifier,
        title: 'Detailer',
        shopName: 'Test Shop',
        applicantRequirement,
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
      workerCertificationState={{ kind: 'loaded', hasCurrentCertification }}
    />,
  )
  return screen.getByRole('dialog', { name: 'Apply to this job opening' })
}

describe('D-20 apply gate and the applicant certification list (W7)', () => {
  it('w7_apply_blocked_for_certification_required_without_current_certificate', async () => {
    const user = userEvent.setup()
    const blockedDialog = renderApply(false, 'certification_required')
    await user.click(within(blockedDialog).getByRole('checkbox', { name: /I have read the training and work notice/ }))
    expect(within(blockedDialog).getByText(certificationRequiredApplyBlockedText)).toBeInTheDocument()
    expect(within(blockedDialog).getByRole('button', { name: 'Send application' })).toBeDisabled()
  })

  it('w7_worker_certification_warning_uses_real_state', async () => {
    const harness = createCertificationTestHarness()
    harness.certificationRepository.listMyCertifications.mockResolvedValue([
      buildMyCertification({ effectiveStatus: 'expired' }),
      buildMyCertification({ certificationId: 'cert-2', effectiveStatus: 'active' }),
    ])
    expect(await harness.certificationDependencies.certificationService.loadWorkerCertificationState()).toEqual({
      kind: 'loaded',
      hasCurrentCertification: true,
    })
    harness.certificationRepository.listMyCertifications.mockResolvedValue([buildMyCertification({ status: 'suspended', effectiveStatus: 'suspended' })])
    expect(await harness.certificationDependencies.certificationService.loadWorkerCertificationState()).toEqual({
      kind: 'loaded',
      hasCurrentCertification: false,
    })

    const allowedDialog = renderApply(true, 'certification_required')
    expect(within(allowedDialog).queryByText(certificationRequiredApplyBlockedText)).toBeNull()
  })

  it('w7_applicant_section_lists_current_certifications', async () => {
    const applicantPipelineRepository = createMockApplicantPipelineRepository()
    applicantPipelineRepository.listVerifiedCertifications.mockResolvedValue([
      {
        certificationId: 'cert-1',
        certificationTitle: 'Hand wash basics',
        issuingShopName: 'Other Test Shop',
        issuedAt: '2026-06-01T02:00:00Z',
        expiresAt: '2027-06-01T02:00:00Z',
      },
    ])
    render(
      <ApplicantProfileDrawer
        applicantPipelineService={new ApplicantPipelineService(applicantPipelineRepository)}
        application={buildJobApplication({ status: 'under_review' })}
        applicantProfile={buildApplicantProfile()}
        openingStatus="published"
        isShopVerified
        isActionPending={false}
        onTransitionRequested={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const section = screen.getByRole('region', { name: 'Shop-issued certifications' })
    const list = await within(section).findByRole('list', { name: 'Current shop-issued certifications' })
    expect(list).toHaveTextContent('Hand wash basics (shop-issued by Other Test Shop)')
    expect(section).toHaveTextContent('Shop-issued: not a government-recognized credential.')
  })
})
