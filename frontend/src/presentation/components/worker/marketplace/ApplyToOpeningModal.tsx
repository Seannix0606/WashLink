import type { ReactElement } from 'react'
import { useState } from 'react'
import { AlertTriangle, Lock, Send, UserPlus } from 'lucide-react'
import { coverNoteTooLongMessage } from '../../../../application/validation/jobApplicationSchemas'
import { jobApplicationLimits } from '../../../../domain/models/JobApplication'
import type { JobOpeningApplicantRequirement } from '../../../../domain/models/JobOpening'
import { currentWorkerVerifiedCertificationState } from '../../../../domain/models/VerifiedCertification'
import { Button, Modal } from '../../../design/ui'
import {
  contactsNotSharedNotice,
  coverNoteGuidanceText,
  describeWorkerCertificationWarning,
  trainingAndWorkNoticeAcknowledgementLabel,
} from '../../../utilities/workforceNoticeCopy'
import { WorkerProfileTextArea } from '../../workerProfile/WorkerProfileTextArea'
import type { ApplyOpeningRequirementsState } from '../../../utilities/applyOpeningRequirements'
import { ApplyOpeningRequirementsSection } from './ApplyOpeningRequirements'
import { TrainingAndWorkNotice } from './TrainingAndWorkNotice'

export interface ApplyTarget {
  readonly jobOpeningId: string
  readonly title: string
  readonly shopName: string
  readonly applicantRequirement: JobOpeningApplicantRequirement | null
  /** Qualifications and required training; the worker must see them before sending. */
  readonly openingRequirements: ApplyOpeningRequirementsState
  /** Cover note of an existing draft being submitted; '' for a new application. */
  readonly initialCoverNote: string
}

interface ApplyToOpeningModalProps {
  readonly applyTarget: ApplyTarget | null
  readonly hasWorkerProfile: boolean
  readonly isSubmitting: boolean
  readonly errorMessage: string | null
  readonly onSubmit: (coverNoteInput: string, hasAcknowledgedNotice: boolean) => void
  readonly onCreateProfileRequested: () => void
  readonly onClose: () => void
  /** Retries loading the opening requirements when they could not be shown. */
  readonly onReloadOpeningRequirements?: () => void
}

/**
 * Apply dialog: shows the opening's qualifications and required training, and "Send
 * application" stays disabled until they are shown and the notice is acknowledged.
 */
export function ApplyToOpeningModal({
  applyTarget,
  hasWorkerProfile,
  isSubmitting,
  errorMessage,
  onSubmit,
  onCreateProfileRequested,
  onClose,
  onReloadOpeningRequirements,
}: ApplyToOpeningModalProps): ReactElement {
  const [coverNoteInput, setCoverNoteInput] = useState<string>(applyTarget?.initialCoverNote ?? '')
  const [hasAcknowledgedNotice, setHasAcknowledgedNotice] = useState<boolean>(false)
  const isCoverNoteTooLong = coverNoteInput.trim().length > jobApplicationLimits.coverNoteMaxLength
  const isRequirementsShown = applyTarget?.openingRequirements.kind === 'loaded'
  const canSubmit = hasWorkerProfile && isRequirementsShown && hasAcknowledgedNotice && !isCoverNoteTooLong
  const certificationWarning = describeWorkerCertificationWarning(currentWorkerVerifiedCertificationState)

  return (
    <Modal
      isOpen={applyTarget !== null}
      onClose={onClose}
      title="Apply to this job opening"
      maxWidthClassName="max-w-lg"
      footer={
        hasWorkerProfile ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              leadingIcon={<Send className="h-4 w-4" />}
              isLoading={isSubmitting}
              disabled={!canSubmit || isSubmitting}
              onClick={(): void => {
                onSubmit(coverNoteInput, hasAcknowledgedNotice)
              }}
            >
              Send application
            </Button>
          </div>
        ) : null
      }
    >
      {applyTarget === null ? null : (
        <div className="max-h-[65dvh] space-y-4 overflow-y-auto pr-1 text-sm">
          <div>
            <p className="font-semibold break-words text-[var(--color-ink-900)]">{applyTarget.title}</p>
            <p className="break-words text-[var(--color-ink-500)]">{applyTarget.shopName}</p>
          </div>

          <ApplyOpeningRequirementsSection
            requirementsState={applyTarget.openingRequirements}
            onReload={onReloadOpeningRequirements}
          />

          {!hasWorkerProfile ? (
            <div className="space-y-3">
              <p role="alert" className="text-[var(--color-ink-700)]">
                Create your worker profile before applying. Shops see your profile while your
                application is active or accepted.
              </p>
              <Button leadingIcon={<UserPlus className="h-4 w-4" />} onClick={onCreateProfileRequested}>
                Create your profile
              </Button>
            </div>
          ) : (
            <>
              <TrainingAndWorkNotice>
                <label className="flex items-start gap-2 text-sm font-medium text-[var(--color-ink-900)]">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand-700)]"
                    checked={hasAcknowledgedNotice}
                    onChange={(changeEvent): void => {
                      setHasAcknowledgedNotice(changeEvent.target.checked)
                    }}
                  />
                  <span>{trainingAndWorkNoticeAcknowledgementLabel}</span>
                </label>
              </TrainingAndWorkNotice>

              {applyTarget.applicantRequirement === 'certification_required' && certificationWarning !== null ? (
                <p
                  role="note"
                  className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-warning-50)] px-3 py-2 text-[var(--color-warning-600)]"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {certificationWarning}
                </p>
              ) : null}

              <div className="space-y-1">
                <WorkerProfileTextArea
                  fieldName="application-cover-note"
                  label="Cover note (optional)"
                  value={coverNoteInput}
                  maximumLength={jobApplicationLimits.coverNoteMaxLength}
                  errorText={isCoverNoteTooLong ? coverNoteTooLongMessage : undefined}
                  onValueChange={setCoverNoteInput}
                />
                <p className="text-xs text-[var(--color-ink-500)]">{coverNoteGuidanceText}</p>
              </div>

              <p className="flex items-start gap-2 text-[var(--color-ink-700)]">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ink-500)]" aria-hidden="true" />
                <span>
                  {contactsNotSharedNotice} The shop sees your name and worker profile while your
                  application is active or accepted.
                </span>
              </p>

              {!hasAcknowledgedNotice ? (
                <p className="text-xs text-[var(--color-ink-500)]">
                  Tick the notice above to send your application.
                </p>
              ) : null}
              {errorMessage !== null ? (
                <p role="alert" className="text-sm text-[var(--color-danger-500)]">
                  {errorMessage}
                </p>
              ) : null}
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
