import type { ReactElement } from 'react'
import { useState } from 'react'
import { GraduationCap, Send } from 'lucide-react'
import type { JobApplication } from '../../../../domain/models/JobApplication'
import type { TrainingDependencies } from '../../../dependencyInjection/createTrainingDependencies'
import { Button, EmptyState, Modal, Skeleton } from '../../../design/ui'
import { useInviteToTraining } from '../../../hooks/useInviteToTraining'
import { enrollmentIsNotContractText } from '../../../utilities/trainingNoticeCopy'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'

interface InviteToTrainingModalProps {
  readonly trainingDependencies: TrainingDependencies
  /** An accepted application; null closes the modal. */
  readonly jobApplication: JobApplication | null
  readonly applicantName: string
  readonly onClose: () => void
}

interface InviteFormProps extends Omit<InviteToTrainingModalProps, 'jobApplication'> {
  readonly jobApplication: JobApplication
}

function InviteForm({ trainingDependencies, jobApplication, applicantName, onClose }: InviteFormProps): ReactElement {
  const { invitablePrograms, isLoadingPrograms, programsErrorMessage, isInviting, reloadPrograms, inviteToProgram } = useInviteToTraining(
    trainingDependencies.trainingProgramService,
    trainingDependencies.trainingEnrollmentService,
    jobApplication,
  )
  const [selectedProgramId, setSelectedProgramId] = useState<string>('')
  const selectedProgram = invitablePrograms.find((program) => program.id === selectedProgramId) ?? null

  if (isLoadingPrograms) {
    return <Skeleton heightClassName="h-24" />
  }
  if (programsErrorMessage !== null) {
    return <LoadErrorNotice title="Programs could not be loaded" errorMessage={programsErrorMessage} onRetry={(): void => { void reloadPrograms() }} />
  }
  if (invitablePrograms.length === 0) {
    return (
      <EmptyState
        icon={<GraduationCap className="h-5 w-5" />}
        title="No open training program for this shop"
        description="Open a training program for this shop in the Training tab, then invite the applicant."
      />
    )
  }
  return (
    <div className="space-y-4 text-sm">
      <p className="text-[var(--color-ink-700)]">
        Invite {applicantName} to required initial training. They read the free training notice and the agreed terms
        before they decide. {enrollmentIsNotContractText}
      </p>
      <fieldset className="space-y-2">
        <legend className="font-medium text-[var(--color-ink-900)]">Open programs</legend>
        {invitablePrograms.map((program) => (
          <label key={program.id} className="flex items-start gap-2">
            <input
              type="radio"
              name="invite-training-program"
              className="mt-0.5"
              checked={selectedProgramId === program.id}
              onChange={(): void => { setSelectedProgramId(program.id) }}
            />
            <span className="break-words">
              {program.title} ({String(program.minTrainingDays)} training days)
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={isInviting}>
          Cancel
        </Button>
        <Button
          leadingIcon={<Send className="h-4 w-4" />}
          disabled={selectedProgram === null}
          isLoading={isInviting}
          onClick={(): void => {
            if (selectedProgram !== null) {
              void inviteToProgram(selectedProgram).then((didInvite) => {
                if (didInvite) {
                  onClose()
                }
              })
            }
          }}
        >
          Send invitation
        </Button>
      </div>
    </div>
  )
}

/** D-15: invitations come only from an accepted application of the same shop. */
export function InviteToTrainingModal({ jobApplication, ...formProps }: InviteToTrainingModalProps): ReactElement {
  return (
    <Modal isOpen={jobApplication !== null} onClose={formProps.onClose} title="Invite to training">
      {jobApplication === null ? null : <InviteForm key={jobApplication.id} jobApplication={jobApplication} {...formProps} />}
    </Modal>
  )
}
