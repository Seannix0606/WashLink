import type { JobApplication } from '../../domain/models/JobApplication'
import {
  trainingEnrollmentNoticeVersion,
  type MyTraining,
  type TrainingEnrollment,
  type TrainingRosterEntry,
} from '../../domain/models/TrainingEnrollment'
import type { TrainingProgram } from '../../domain/models/TrainingProgram'
import type { TrainingEnrollmentRepository } from '../../domain/repositories/TrainingEnrollmentRepository'
import type { TrainingProgramRepository } from '../../domain/repositories/TrainingProgramRepository'
import { canInviteToTrainingProgram } from '../../domain/utilities/trainingProgramLifecycle'
import {
  isCancelReasonRequired,
  ownerTrainingEnrollmentActions,
  workerTrainingActions,
} from '../../domain/utilities/trainingEnrollmentLifecycle'
import { cancelReasonSchema } from '../validation/trainingProgramSchemas'
import { parseOrThrow } from './TrainingProgramService'

const notAllowedMessage = 'This training enrollment change is not allowed.'

/** Invitations first, then live training, then ended ones; newest first within each. */
function enrollmentSortRank(myTraining: MyTraining): number {
  if (myTraining.enrollment.status === 'invited') {
    return 0
  }
  return myTraining.enrollment.status === 'accepted' ? 1 : 2
}

/**
 * Enrollment rules per actor (W6f). Progress always comes from the server view. The
 * database repeats every check and stays the authority.
 */
export class TrainingEnrollmentService {
  public constructor(
    private readonly trainingEnrollmentRepository: TrainingEnrollmentRepository,
    private readonly trainingProgramRepository: TrainingProgramRepository,
  ) {}

  /** The worker's enrollments with server progress and, while readable, program and sessions. */
  public async listMyTrainings(): Promise<MyTraining[]> {
    const enrollments = await this.trainingEnrollmentRepository.listMyEnrollments()
    const programIds = [...new Set(enrollments.map((enrollment) => enrollment.programId))]
    const [progressRows, programs, sessions] = await Promise.all([
      this.trainingEnrollmentRepository.listProgress(enrollments.map((enrollment) => enrollment.id)),
      this.trainingProgramRepository.listProgramsByIds(programIds),
      this.trainingProgramRepository.listSessions(programIds),
    ])
    const progressByEnrollment = new Map(progressRows.map((progressRow) => [progressRow.enrollmentId, progressRow]))
    const programById = new Map(programs.map((program) => [program.id, program]))
    const myTrainings = enrollments.map(
      (enrollment): MyTraining => ({
        enrollment,
        progress: progressByEnrollment.get(enrollment.id) ?? null,
        program: programById.get(enrollment.programId) ?? null,
        sessions: sessions.filter((session) => session.programId === enrollment.programId),
      }),
    )
    return myTrainings
      .map((myTraining, listIndex) => ({ myTraining, listIndex }))
      .sort(
        (left, right) =>
          enrollmentSortRank(left.myTraining) - enrollmentSortRank(right.myTraining) || left.listIndex - right.listIndex,
      )
      .map(({ myTraining }) => myTraining)
  }

  public async listRoster(programId: string): Promise<TrainingRosterEntry[]> {
    return this.trainingEnrollmentRepository.listRoster(programId)
  }

  /** D-15: an accepted application of the same shop, into an open program. */
  public async invite(program: TrainingProgram, jobApplication: JobApplication): Promise<TrainingEnrollment> {
    if (!canInviteToTrainingProgram(program.status)) {
      throw new Error('Invitations can be sent only while the program is open.')
    }
    if (jobApplication.status !== 'accepted' || jobApplication.shopId !== program.shopId) {
      throw new Error('Invite only an applicant you accepted for this shop.')
    }
    return this.trainingEnrollmentRepository.invite(program.id, jobApplication.id)
  }

  /** Accepting sends the notice version and the schedule version the worker reviewed. */
  public async accept(myTraining: MyTraining, hasAcknowledgedNotice: boolean): Promise<TrainingEnrollment> {
    const { enrollment, progress, program } = myTraining
    if (!hasAcknowledgedNotice) {
      throw new Error('Review the free-training notice before enrolling.')
    }
    const actions = workerTrainingActions(enrollment.status, progress?.progressStatus ?? null, program?.status ?? null)
    if (program === null || !actions.includes('accept')) {
      throw new Error('This training program is not open.')
    }
    return this.trainingEnrollmentRepository.respond({
      enrollmentId: enrollment.id,
      accept: true,
      noticeVersion: trainingEnrollmentNoticeVersion,
      expectedScheduleChangedAt: program.scheduleChangedAt,
    })
  }

  public async decline(myTraining: MyTraining): Promise<TrainingEnrollment> {
    const { enrollment, progress, program } = myTraining
    if (!workerTrainingActions(enrollment.status, progress?.progressStatus ?? null, program?.status ?? null).includes('decline')) {
      throw new Error(notAllowedMessage)
    }
    return this.trainingEnrollmentRepository.respond({
      enrollmentId: enrollment.id,
      accept: false,
      noticeVersion: null,
      expectedScheduleChangedAt: null,
    })
  }

  public async leave(myTraining: MyTraining): Promise<TrainingEnrollment> {
    const { enrollment, progress, program } = myTraining
    if (!workerTrainingActions(enrollment.status, progress?.progressStatus ?? null, program?.status ?? null).includes('leave')) {
      throw new Error(notAllowedMessage)
    }
    return this.trainingEnrollmentRepository.withdraw(enrollment.id)
  }

  public async cancel(rosterEntry: TrainingRosterEntry, reason: string): Promise<TrainingEnrollment> {
    if (ownerTrainingEnrollmentActions(rosterEntry.enrollmentStatus, rosterEntry.progressStatus).length === 0) {
      throw new Error(notAllowedMessage)
    }
    const trimmedReason = reason.trim()
    const validReason = isCancelReasonRequired(rosterEntry.enrollmentStatus) || trimmedReason.length > 0
      ? parseOrThrow(cancelReasonSchema, trimmedReason)
      : null
    return this.trainingEnrollmentRepository.cancel(rosterEntry.enrollmentId, validReason)
  }
}
