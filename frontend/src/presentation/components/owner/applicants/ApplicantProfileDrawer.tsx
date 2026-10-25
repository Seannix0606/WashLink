import type { ReactElement, ReactNode } from 'react'
import { GraduationCap, Info, UserRound } from 'lucide-react'
import type { ApplicantPipelineService } from '../../../../application/services/ApplicantPipelineService'
import type { ApplicantProfile } from '../../../../domain/models/ApplicantProfile'
import type { JobApplication } from '../../../../domain/models/JobApplication'
import type { JobOpeningStatus } from '../../../../domain/models/JobOpening'
import {
  isApplicantProfileShared,
  ownerJobApplicationTransitions,
  type OwnerJobApplicationTransition,
} from '../../../../domain/utilities/jobApplicationLifecycle'
import { Button, Drawer } from '../../../design/ui'
import { formatShortDateTime } from '../../../utilities/datetimeFormatting'
import {
  acceptRequiresVerifiedShopReason,
  ownerTransitionCopy,
  selfReportedProfileHeading,
} from '../../../utilities/jobApplicationDisplay'
import { workerAvailabilityStatusLabels } from '../../../utilities/workerProfileDisplay'
import { JobApplicationStatusBadge } from '../../jobOpenings/JobApplicationStatusBadge'
import { JobOpeningDetailsView } from '../../jobOpenings/JobOpeningDetailsView'
import { ApplicantVerifiedCertificationsSection } from './ApplicantVerifiedCertificationsSection'

interface ApplicantProfileDrawerProps {
  readonly applicantPipelineService: ApplicantPipelineService
  readonly application: JobApplication | null
  readonly applicantProfile: ApplicantProfile | null
  readonly openingStatus: JobOpeningStatus
  readonly isShopVerified: boolean
  readonly isActionPending: boolean
  readonly onTransitionRequested: (application: JobApplication, toStatus: OwnerJobApplicationTransition) => void
  /** W6 (D-15): offered for accepted applications when training is available. */
  readonly onInviteToTrainingRequested?: (application: JobApplication) => void
  readonly onClose: () => void
}

function ProfileField({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactElement {
  return (
    <div>
      <dt className="text-xs font-medium text-[var(--color-ink-500)]">{label}</dt>
      <dd className="text-sm break-words whitespace-pre-line text-[var(--color-ink-900)]">{children}</dd>
    </div>
  )
}

const notProvidedText = 'Not provided'

function joinedOrNotProvided(values: readonly string[]): string {
  return values.length === 0 ? notProvidedText : values.join(', ')
}

/** One application: self-reported profile, verified certifications, cover note, snapshot. No contacts. */
export function ApplicantProfileDrawer({
  applicantPipelineService,
  application,
  applicantProfile,
  openingStatus,
  isShopVerified,
  isActionPending,
  onTransitionRequested,
  onInviteToTrainingRequested,
  onClose,
}: ApplicantProfileDrawerProps): ReactElement {
  const transitions =
    application === null ? [] : ownerJobApplicationTransitions(application.status, openingStatus)
  const isAcceptBlocked = transitions.includes('accepted') && !isShopVerified

  return (
    <Drawer
      isOpen={application !== null}
      onClose={onClose}
      title={applicantProfile?.displayName ?? 'Applicant'}
      description={
        application?.submittedAt ? `Applied ${formatShortDateTime(application.submittedAt)}` : undefined
      }
      footer={
        application !== null && transitions.length > 0 ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {transitions.map((toStatus) => (
                <Button
                  key={toStatus}
                  size="sm"
                  variant={ownerTransitionCopy[toStatus].isDestructive ? 'ghost' : 'primary'}
                  disabled={isActionPending || (toStatus === 'accepted' && isAcceptBlocked)}
                  aria-describedby={toStatus === 'accepted' && isAcceptBlocked ? 'accept-blocked-reason' : undefined}
                  onClick={(): void => {
                    onTransitionRequested(application, toStatus)
                  }}
                >
                  {ownerTransitionCopy[toStatus].buttonLabel}
                </Button>
              ))}
            </div>
            {isAcceptBlocked ? (
              <p id="accept-blocked-reason" className="text-xs text-[var(--color-ink-500)]">
                Accept is unavailable: {acceptRequiresVerifiedShopReason}
              </p>
            ) : null}
          </div>
        ) : null
      }
    >
      {application === null ? null : (
        <div className="space-y-5">
          <div className="space-y-2">
            <JobApplicationStatusBadge status={application.status} />
            {application.status === 'accepted' ? (
              <p className="text-xs text-[var(--color-ink-700)]">
                You recorded acceptance. This is not a contract or a job guarantee.
              </p>
            ) : null}
            {application.status === 'accepted' && onInviteToTrainingRequested !== undefined ? (
              <Button
                size="sm"
                variant="secondary"
                leadingIcon={<GraduationCap className="h-4 w-4" />}
                onClick={(): void => {
                  onInviteToTrainingRequested(application)
                }}
              >
                Invite to training
              </Button>
            ) : null}
          </div>

          <section aria-label="Applicant profile" className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-ink-900)]">
              <UserRound className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
              Profile
            </h4>
            <p className="text-xs text-[var(--color-ink-500)]">{selfReportedProfileHeading}</p>
            {applicantProfile === null ? (
              <p className="text-sm text-[var(--color-ink-700)]">
                The worker profile is shared only while an application is submitted, under review,
                shortlisted or accepted.
              </p>
            ) : (
              <dl className="space-y-2">
                <ProfileField label="Headline">{applicantProfile.headline ?? notProvidedText}</ProfileField>
                <ProfileField label="Experience (self-reported)">
                  {applicantProfile.experienceSummary ?? notProvidedText}
                </ProfileField>
                <ProfileField label="Years of experience (self-reported)">
                  {applicantProfile.yearsOfExperience === null
                    ? notProvidedText
                    : String(applicantProfile.yearsOfExperience)}
                </ProfileField>
                <ProfileField label="Skills (self-reported, not verified)">
                  {joinedOrNotProvided(applicantProfile.skills)}
                </ProfileField>
                <ProfileField label="Preferred locations">
                  {joinedOrNotProvided(applicantProfile.preferredLocations)}
                </ProfileField>
                <ProfileField label="Availability">
                  {applicantProfile.availabilityStatus === null
                    ? notProvidedText
                    : workerAvailabilityStatusLabels[applicantProfile.availabilityStatus]}
                  {applicantProfile.availabilityNotes === null ? null : ` - ${applicantProfile.availabilityNotes}`}
                </ProfileField>
              </dl>
            )}
          </section>

          {isApplicantProfileShared(application.status) ? (
            <ApplicantVerifiedCertificationsSection
              applicantPipelineService={applicantPipelineService}
              applicationId={application.id}
            />
          ) : null}

          <section aria-label="Cover note" className="space-y-1">
            <h4 className="text-sm font-semibold text-[var(--color-ink-900)]">Cover note</h4>
            <p className="text-sm break-words whitespace-pre-line text-[var(--color-ink-700)]">
              {application.coverNote ?? 'No cover note.'}
            </p>
          </section>

          <p className="flex items-start gap-2 text-xs text-[var(--color-ink-500)]">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Contact details are not shared through WashLink. Use the application instructions of
            your opening and in-app updates for next steps.
          </p>

          {application.openingSnapshot !== null ? (
            <details className="rounded-[var(--radius-control)] border border-[var(--color-ink-200)] p-3">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink-900)]">
                Opening as the worker applied
              </summary>
              <div className="mt-3">
                <JobOpeningDetailsView
                  jobOpeningContent={application.openingSnapshot}
                  shopName={application.openingSnapshot.shopName ?? 'Your shop'}
                />
              </div>
            </details>
          ) : null}
        </div>
      )}
    </Drawer>
  )
}
