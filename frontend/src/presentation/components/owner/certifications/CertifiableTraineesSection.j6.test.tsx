import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { buildCertifiableEnrollment, createCertificationTestHarness, testAssessmentIdentifier } from '../../../../test/certificationFixtures'
import { buildAssessmentEvidence, buildTrainingProgram, testTrainingEnrollmentIdentifier } from '../../../../test/trainingFixtures'
import { CertifiableTraineesSection } from './CertifiableTraineesSection'

const passedAssessment = buildAssessmentEvidence({
  evidenceId: testAssessmentIdentifier,
  result: 'passed',
  itemsMet: [true, true],
  failureReason: null,
})

function renderSection(harness: ReturnType<typeof createCertificationTestHarness>, isShopVerified = true): void {
  render(
    <CertifiableTraineesSection
      certificationDependencies={harness.certificationDependencies}
      program={buildTrainingProgram()}
      isShopVerified={isShopVerified}
    />,
  )
}

describe('Issuing certifications from completed enrollments (J6)', () => {
  it('j6_issue_button_only_for_completed_enrollments_without_certificate', async () => {
    const harness = createCertificationTestHarness()
    // The server lists only completed enrollments without an original certificate.
    harness.certificationRepository.listCertifiableEnrollments.mockResolvedValue([buildCertifiableEnrollment()])
    renderSection(harness)
    const list = await screen.findByRole('list', { name: 'Trainees ready for certification' })
    expect(within(list).getAllByRole('button', { name: 'Issue certification' })).toHaveLength(1)
    expect(harness.certificationRepository.listCertifiableEnrollments).toHaveBeenCalledTimes(1)

    const emptyHarness = createCertificationTestHarness()
    emptyHarness.certificationRepository.listCertifiableEnrollments.mockResolvedValue([])
    renderSection(emptyHarness)
    expect(await screen.findByText(/No trainee is ready/)).toBeInTheDocument()

    // An unverified shop is not offered the button.
    const unverifiedHarness = createCertificationTestHarness()
    unverifiedHarness.certificationRepository.listCertifiableEnrollments.mockResolvedValue([buildCertifiableEnrollment()])
    renderSection(unverifiedHarness, false)
    expect(await screen.findByText('Only a verified shop can issue certifications.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Issue certification' })).toHaveLength(1)
  })

  it('j6_issue_modal_shows_evidence_summary_and_requires_attestation', async () => {
    const user = userEvent.setup()
    const harness = createCertificationTestHarness()
    harness.certificationRepository.listCertifiableEnrollments.mockResolvedValue([buildCertifiableEnrollment()])
    harness.evidenceRepository.listEvidence.mockResolvedValue([passedAssessment])
    harness.actionRepository.issue.mockResolvedValue({
      certificationId: 'cert-1', status: 'active', issuedAt: '2026-10-26T04:00:00Z', expiresAt: '2027-10-26T04:00:00Z',
    })
    renderSection(harness)
    await user.click(await screen.findByRole('button', { name: 'Issue certification' }))
    const dialog = screen.getByRole('dialog', { name: 'Issue a shop certification' })
    expect(within(dialog).getByText('3 of 3 required training days attended')).toBeInTheDocument()
    expect(await within(dialog).findByText(/Assessment: Passed, by Test Trainer/)).toBeInTheDocument()
    expect(within(dialog).getByRole('list', { name: 'Assessment checklist' })).toHaveTextContent('Uses two buckets')
    expect(within(dialog).getByText(/Validity that applies: 12 months/)).toBeInTheDocument()

    const issueButton = within(dialog).getByRole('button', { name: 'Issue certification' })
    const attestation = within(dialog).getByRole('checkbox', { name: /I reviewed this worker's training record/ })
    expect(attestation).not.toBeChecked()
    expect(issueButton).toBeDisabled()
    await user.click(attestation)
    await user.click(issueButton)
    await waitFor(() => {
      expect(harness.actionRepository.issue).toHaveBeenCalledWith(testTrainingEnrollmentIdentifier, testAssessmentIdentifier, 'w7_issuer_v1')
    })
  })

  it('j6_stale_record_error_reloads_enrollment', async () => {
    const user = userEvent.setup()
    const harness = createCertificationTestHarness()
    const newerAssessmentId = '12341234-1234-4123-8123-123412341234'
    harness.certificationRepository.listCertifiableEnrollments
      .mockResolvedValueOnce([buildCertifiableEnrollment()])
      .mockResolvedValue([buildCertifiableEnrollment({ currentAssessmentId: newerAssessmentId })])
    harness.evidenceRepository.listEvidence.mockResolvedValue([
      passedAssessment,
      buildAssessmentEvidence({ evidenceId: newerAssessmentId, result: 'passed', itemsMet: [true, true], failureReason: null }),
    ])
    harness.actionRepository.issue.mockRejectedValue(new Error('The training record changed. Review it again.'))
    renderSection(harness)
    await user.click(await screen.findByRole('button', { name: 'Issue certification' }))
    const dialog = screen.getByRole('dialog', { name: 'Issue a shop certification' })
    await within(dialog).findByText(/Assessment: Passed/)
    await user.click(within(dialog).getByRole('checkbox', { name: /I reviewed this worker's training record/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Issue certification' }))

    // The list is re-read, the attestation resets and the owner is asked to review again.
    expect(await within(dialog).findByText(/The training record changed since you opened it/)).toBeInTheDocument()
    expect(harness.certificationRepository.listCertifiableEnrollments).toHaveBeenCalledTimes(2)
    await within(dialog).findByText(/Assessment: Passed/)
    expect(within(dialog).getByRole('checkbox', { name: /I reviewed this worker's training record/ })).not.toBeChecked()

    await user.click(within(dialog).getByRole('checkbox', { name: /I reviewed this worker's training record/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Issue certification' }))
    await waitFor(() => {
      expect(harness.actionRepository.issue).toHaveBeenLastCalledWith(testTrainingEnrollmentIdentifier, newerAssessmentId, 'w7_issuer_v1')
    })
  })
})
