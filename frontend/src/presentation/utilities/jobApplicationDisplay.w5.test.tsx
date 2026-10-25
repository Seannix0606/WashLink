import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { JobApplicationService } from '../../application/services/JobApplicationService'
import { jobApplicationNoticeVersion } from '../../domain/models/JobApplication'
import { applicantProfileSharingStatuses } from '../../domain/utilities/jobApplicationLifecycle'
import { testJobOpeningIdentifier } from '../../test/fixtures'
import { buildJobApplication, createMockJobApplicationRepository } from '../../test/jobApplicationFixtures'
import { ApplicantTransitionConfirmModal } from '../components/owner/applicants/ApplicantTransitionConfirmModal'
import {
  acceptedApplicationCopy,
  describeJobApplicationStatus,
  ownerTransitionCopy,
} from './jobApplicationDisplay'
import { workerProfileVisibilityNotice } from './workerProfileDisplay'
import { applicationNoticeVersion, trainingAndWorkNoticeText } from './workforceNoticeCopy'

describe('W5 application copy', () => {
  it('w5_accepted_status_copy_says_not_a_contract', () => {
    expect(acceptedApplicationCopy).toBe(
      'The shop wants to move forward. This is not a contract or a job guarantee.',
    )
    expect(describeJobApplicationStatus('accepted').workerHelperText).toBe(acceptedApplicationCopy)
    expect(describeJobApplicationStatus('rejected').displayLabel).toBe('Not selected')
    expect(ownerTransitionCopy.accepted.confirmMessage).toContain('This records your decision; it is not a contract')

    render(
      <ApplicantTransitionConfirmModal
        toStatus="accepted"
        applicantName="Test Applicant"
        isSubmitting={false}
        onConfirm={(): void => undefined}
        onCancel={(): void => undefined}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'Accept this application?' })).toBeInTheDocument()
    expect(screen.getByText(/it is not a contract/)).toBeInTheDocument()
  })

  it('w5_worker_profile_visibility_copy_matches_owner_access', () => {
    // D-13: shops see the profile while the application is active (submitted, under review,
    // shortlisted) or accepted; never private contacts (D-14).
    expect(workerProfileVisibilityNotice).toBe(
      'Who can see your profile: you and WashLink administrators, plus shops you apply to while your application is active or accepted. Your private contact details are not shared with shops.',
    )
    expect(workerProfileVisibilityNotice).not.toContain('once applications are available')
    expect(applicantProfileSharingStatuses).toEqual(['submitted', 'under_review', 'shortlisted', 'accepted'])
  })

  it('w5_notice_version_constant_is_w5_v1', async () => {
    expect(jobApplicationNoticeVersion).toBe('w5_v1')
    expect(applicationNoticeVersion).toBe('w5_v1')
    expect(trainingAndWorkNoticeText).toContain('not productive work for customers')

    // The service sends exactly this version with every submission.
    const jobApplicationRepository = createMockJobApplicationRepository()
    jobApplicationRepository.createApplication.mockResolvedValue(buildJobApplication())
    await new JobApplicationService(jobApplicationRepository).apply(testJobOpeningIdentifier, '', true)
    expect(jobApplicationRepository.createApplication).toHaveBeenCalledWith({
      jobOpeningId: testJobOpeningIdentifier,
      coverNote: null,
      submit: true,
      noticeVersion: 'w5_v1',
    })
  })
})
