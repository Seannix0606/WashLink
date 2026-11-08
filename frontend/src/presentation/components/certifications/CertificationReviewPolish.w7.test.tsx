import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApplicantPipelineService } from '../../../application/services/ApplicantPipelineService'
import { mapVerifiedCertificationRow } from '../../../infrastructure/supabase/supabaseJobApplicationRow'
import { buildMyCertification, createCertificationTestHarness, testCurrentInstant } from '../../../test/certificationFixtures'
import { buildApplicantProfile, buildJobApplication, createMockApplicantPipelineRepository } from '../../../test/jobApplicationFixtures'
import {
  applicantIssuingShopNoLongerVerifiedText,
  workerExpiredCertificateNoticeText,
  workerRenewalGuidanceText,
} from '../../utilities/certificationCopy'
import { ApplicantProfileDrawer } from '../owner/applicants/ApplicantProfileDrawer'
import { MyCertificationsPanel } from '../worker/certifications/MyCertificationsPanel'

const baseRow = {
  certification_id: 'cert-1',
  certification_title: 'Hand wash basics',
  issuing_shop_name: 'Other Test Shop',
  issued_at: '2026-06-01T02:00:00Z',
  expires_at: '2027-06-01T02:00:00Z',
}

async function renderApplicantSection(isIssuingShopCurrentlyVerified: boolean | null | undefined): Promise<HTMLElement> {
  const applicantPipelineRepository = createMockApplicantPipelineRepository()
  applicantPipelineRepository.listVerifiedCertifications.mockResolvedValue([
    { ...mapVerifiedCertificationRow(baseRow), isIssuingShopCurrentlyVerified },
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
  await within(section).findByRole('list', { name: 'Current shop-issued certifications' })
  return section
}

describe('W7 review polish (frontend)', () => {
  it('w7p_applicant_section_heading_is_shop_issued', async () => {
    const section = await renderApplicantSection(true)
    expect(within(section).getByRole('heading', { name: 'Shop-issued certifications' })).toBeInTheDocument()
    expect(section).not.toHaveTextContent(applicantIssuingShopNoLongerVerifiedText)
  })

  it('w7p_applicant_section_shows_issuer_no_longer_verified_line', async () => {
    const section = await renderApplicantSection(false)
    expect(section).toHaveTextContent(applicantIssuingShopNoLongerVerifiedText)
  })

  it('w7p_applicant_section_hides_issuer_line_when_flag_absent', async () => {
    const section = await renderApplicantSection(undefined)
    expect(section).not.toHaveTextContent(applicantIssuingShopNoLongerVerifiedText)
  })

  it('w7p_row_mapping_keeps_optional_issuer_flag_as_stored', () => {
    expect(mapVerifiedCertificationRow(baseRow).isIssuingShopCurrentlyVerified).toBeNull()
    expect(mapVerifiedCertificationRow({ ...baseRow, issuing_shop_currently_verified: false }).isIssuingShopCurrentlyVerified).toBe(false)
  })

  it('w7p_worker_card_shows_renewal_guidance_for_active_certificate', async () => {
    const harness = createCertificationTestHarness()
    harness.certificationRepository.listMyCertifications.mockResolvedValue([buildMyCertification()])
    render(<MyCertificationsPanel certificationDependencies={harness.certificationDependencies} currentInstant={testCurrentInstant} />)
    const list = await screen.findByRole('list', { name: 'My certifications' })
    expect(list).toHaveTextContent(workerRenewalGuidanceText)
    expect(list).not.toHaveTextContent(workerExpiredCertificateNoticeText)
    expect(workerRenewalGuidanceText).toMatch(/60 days before expiry to 90 days after/)
  })

  it('w7p_worker_card_states_expired_certificate_no_longer_counts', async () => {
    const harness = createCertificationTestHarness()
    harness.certificationRepository.listMyCertifications.mockResolvedValue([
      buildMyCertification({ effectiveStatus: 'expired', expiresAt: '2026-01-01T02:00:00Z' }),
    ])
    render(<MyCertificationsPanel certificationDependencies={harness.certificationDependencies} currentInstant={testCurrentInstant} />)
    const list = await screen.findByRole('list', { name: 'My certifications' })
    expect(list).toHaveTextContent(/Expired/)
    expect(list).toHaveTextContent(workerExpiredCertificateNoticeText)
    expect(list).toHaveTextContent(workerRenewalGuidanceText)
  })

  it('w7p_worker_reads_use_my_certifications_rpc_only', async () => {
    const repositorySource = await import('../../../infrastructure/repositories/SupabaseCertificationRepository.ts?raw')
    const source = repositorySource.default
    expect(source).toContain("'my_certifications'")
    expect(source).not.toMatch(/\.from\(\s*'certifications'/)
  })
})
