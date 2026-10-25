import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApplicantPipelineService } from '../../../../application/services/ApplicantPipelineService'
import type { JobApplicationStatus } from '../../../../domain/models/JobApplication'
import {
  buildApplicantProfile,
  buildJobApplication,
  createMockApplicantPipelineRepository,
} from '../../../../test/jobApplicationFixtures'
import { buildTrainingProgram, createTrainingTestHarness } from '../../../../test/trainingFixtures'
import { ApplicantProfileDrawer } from './ApplicantProfileDrawer'

function renderDrawer(status: JobApplicationStatus, onInviteToTrainingRequested: (() => void) | undefined): void {
  const applicantPipelineRepository = createMockApplicantPipelineRepository()
  applicantPipelineRepository.listVerifiedCertifications.mockResolvedValue([])
  render(
    <ApplicantProfileDrawer
      applicantPipelineService={new ApplicantPipelineService(applicantPipelineRepository)}
      application={buildJobApplication({ status, decidedAt: status === 'accepted' ? '2026-10-25T02:00:00+00:00' : null })}
      applicantProfile={buildApplicantProfile()}
      openingStatus="published"
      isShopVerified
      isActionPending={false}
      onTransitionRequested={vi.fn()}
      onInviteToTrainingRequested={onInviteToTrainingRequested}
      onClose={vi.fn()}
    />,
  )
}

describe('Invite to training (W6, D-15)', () => {
  it('w6_invite_offered_only_for_accepted_applicants', async () => {
    const user = userEvent.setup()
    for (const status of ['submitted', 'under_review', 'shortlisted', 'rejected', 'withdrawn'] as const) {
      renderDrawer(status, vi.fn())
      expect(screen.queryByRole('button', { name: 'Invite to training' })).toBeNull()
      cleanup()
    }
    const onInvite = vi.fn()
    renderDrawer('accepted', onInvite)
    await user.click(screen.getByRole('button', { name: 'Invite to training' }))
    expect(onInvite).toHaveBeenCalledTimes(1)

    // The service refuses anything but an accepted application of the same shop.
    const harness = createTrainingTestHarness()
    const { trainingEnrollmentService } = harness.trainingDependencies
    await expect(trainingEnrollmentService.invite(buildTrainingProgram(), buildJobApplication({ status: 'shortlisted' }))).rejects.toThrow(
      'Invite only an applicant you accepted for this shop.',
    )
    await expect(
      trainingEnrollmentService.invite(buildTrainingProgram({ shopId: '99999999-0000-4000-8000-000000000000' }), buildJobApplication({ status: 'accepted' })),
    ).rejects.toThrow('Invite only an applicant you accepted for this shop.')
    expect(harness.enrollmentRepository.invite).not.toHaveBeenCalled()
  })
})
