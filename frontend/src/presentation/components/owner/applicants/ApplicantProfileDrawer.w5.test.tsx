import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApplicantPipelineService } from '../../../../application/services/ApplicantPipelineService'
import type { ApplicantProfile } from '../../../../domain/models/ApplicantProfile'
import {
  mapApplicantProfileRow,
  type SupabaseApplicantProfileRow,
} from '../../../../infrastructure/supabase/supabaseJobApplicationRow'
import {
  buildApplicantProfile,
  buildJobApplication,
  createMockApplicantPipelineRepository,
} from '../../../../test/jobApplicationFixtures'
import { ApplicantProfileDrawer } from './ApplicantProfileDrawer'

function renderDrawer(applicantProfile: ApplicantProfile, isShopVerified = true): HTMLElement {
  const applicantPipelineRepository = createMockApplicantPipelineRepository()
  applicantPipelineRepository.listVerifiedCertifications.mockResolvedValue([])
  render(
    <ApplicantProfileDrawer
      applicantPipelineService={new ApplicantPipelineService(applicantPipelineRepository)}
      application={buildJobApplication({ status: 'under_review', coverNote: 'I can work weekends.' })}
      applicantProfile={applicantProfile}
      openingStatus="published"
      isShopVerified={isShopVerified}
      isActionPending={false}
      onTransitionRequested={vi.fn()}
      onClose={vi.fn()}
    />,
  )
  return screen.getByRole('dialog', { name: applicantProfile.displayName })
}

describe('Applicant profile drawer (W5)', () => {
  it('w5_applicant_profile_labels_skills_self_reported', () => {
    const drawer = renderDrawer(buildApplicantProfile())
    const profileSection = within(drawer).getByRole('region', { name: 'Applicant profile' })
    expect(within(profileSection).getByText('Self-reported by the worker, not verified by WashLink')).toBeInTheDocument()
    expect(within(profileSection).getByText('Skills (self-reported, not verified)')).toBeInTheDocument()
    expect(within(profileSection).getByText('Hand washing, Interior vacuuming')).toBeInTheDocument()
    expect(within(profileSection).getByText('Experience (self-reported)')).toBeInTheDocument()
    // The cover note is plain text.
    expect(within(drawer).getByRole('region', { name: 'Cover note' })).toHaveTextContent('I can work weekends.')
    // Owner decisions for under_review, with accept blocked while the shop is unverified elsewhere.
    expect(within(drawer).getByRole('button', { name: 'Shortlist' })).toBeEnabled()
    expect(within(drawer).getByRole('button', { name: 'Accept' })).toBeEnabled()
    expect(within(drawer).getByRole('button', { name: 'Not selected' })).toBeEnabled()
  })

  it('w5_applicant_verified_certifications_shows_none_yet', async () => {
    const drawer = renderDrawer(buildApplicantProfile(), false)
    const certificationsSection = within(drawer).getByRole('region', { name: 'Shop-issued certifications' })
    expect(await within(certificationsSection).findByText('Verified certifications: none')).toBeInTheDocument()
    // W7 real state: no current shop-issued certificate is recorded, and skills stay self-reported.
    expect(certificationsSection).toHaveTextContent(
      'No current shop-issued certification is recorded on WashLink for this applicant. Skills above are self-reported.',
    )
    // Accept is unavailable for an unverified shop, with the database's reason.
    expect(within(drawer).getByRole('button', { name: 'Accept' })).toBeDisabled()
    expect(within(drawer).getByText(/Only a verified shop can accept applications\./)).toBeInTheDocument()
  })

  it('w5_applicant_view_never_renders_private_contact_fields', () => {
    // Even if a row arrived with contact columns, the mapper keeps the named fields only.
    const rowWithUnexpectedContacts = {
      application_id: 'application-1',
      display_name: 'Test Applicant',
      headline: 'Detailing helper',
      experience_summary: null,
      years_of_experience: null,
      skills: ['Hand washing'],
      preferred_locations: null,
      availability_status: 'flexible',
      availability_notes: null,
      profile_updated_at: null,
      contact_phone: '+63 900 000 0000',
      contact_email: 'applicant@local.test',
      preferred_contact_method: 'phone',
    } as SupabaseApplicantProfileRow
    const mappedProfile = mapApplicantProfileRow(rowWithUnexpectedContacts)
    expect(Object.keys(mappedProfile).some((fieldName) => /contact|phone|email/i.test(fieldName))).toBe(false)

    const drawer = renderDrawer(mappedProfile)
    expect(drawer).not.toHaveTextContent('+63 900 000 0000')
    expect(drawer).not.toHaveTextContent('applicant@local.test')
    expect(within(drawer).queryByText(/^(Phone|Email|Preferred contact)/i)).toBeNull()
    expect(drawer).toHaveTextContent('Contact details are not shared through WashLink.')
  })
})
