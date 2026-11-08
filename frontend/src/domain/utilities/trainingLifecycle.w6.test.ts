import { describe, expect, it } from 'vitest'
import { trainingEnrollmentNoticeVersion } from '../models/TrainingEnrollment'
import { trainingProgramStatuses } from '../models/TrainingProgram'
import {
  canRecordTrainingAssessment,
  ownerTrainingEnrollmentActions,
  workerTrainingActions,
} from './trainingEnrollmentLifecycle'
import { allowedTrainingProgramTransitions, isTrainingProgramTransitionAllowed } from './trainingProgramLifecycle'
import { trainingEnrollmentNoticeVersion as noticeCopyVersion } from '../../presentation/utilities/trainingNoticeCopy'

describe('Training lifecycles (W6)', () => {
  it('w6_program_lifecycle_offers_only_allowed_transitions', () => {
    expect(allowedTrainingProgramTransitions('draft')).toEqual(['open'])
    expect(allowedTrainingProgramTransitions('open')).toEqual(['closed'])
    expect(allowedTrainingProgramTransitions('closed')).toEqual(['archived'])
    expect(allowedTrainingProgramTransitions('archived')).toEqual([])
    // No reopening, no skipping, no same-status moves.
    for (const fromStatus of trainingProgramStatuses) {
      expect(isTrainingProgramTransitionAllowed(fromStatus, fromStatus)).toBe(false)
    }
    expect(isTrainingProgramTransitionAllowed('closed', 'open')).toBe(false)
    expect(isTrainingProgramTransitionAllowed('draft', 'closed')).toBe(false)
    expect(isTrainingProgramTransitionAllowed('draft', 'archived')).toBe(false)
  })

  it('w6_enrollment_lifecycle_offers_only_allowed_actions', () => {
    // Worker: accept only while the program is open and the shop exists; decline always for invitations.
    expect(workerTrainingActions('invited', 'invited', 'open')).toEqual(['accept', 'decline'])
    expect(workerTrainingActions('invited', 'invited', 'closed')).toEqual(['decline'])
    expect(workerTrainingActions('invited', 'shop_removed', null)).toEqual(['decline'])
    // A worker may always leave unfinished training, also after the shop was removed (D-18).
    expect(workerTrainingActions('accepted', 'in_progress', 'open')).toEqual(['leave'])
    expect(workerTrainingActions('accepted', 'shop_removed', null)).toEqual(['leave'])
    expect(workerTrainingActions('accepted', 'completed', 'open')).toEqual([])
    expect(workerTrainingActions('accepted', 'failed', 'open')).toEqual(['leave']) // W16 D-84
    expect(workerTrainingActions('declined', 'declined', 'open')).toEqual([])
    expect(workerTrainingActions('withdrawn', 'withdrawn', 'open')).toEqual([])
    // Owner: withdraw an invitation, cancel unfinished accepted training; nothing else.
    expect(ownerTrainingEnrollmentActions('invited', 'invited')).toEqual(['cancel_invitation'])
    expect(ownerTrainingEnrollmentActions('accepted', 'awaiting_assessment')).toEqual(['cancel_enrollment'])
    expect(ownerTrainingEnrollmentActions('accepted', 'completed')).toEqual([])
    expect(ownerTrainingEnrollmentActions('cancelled', 'cancelled')).toEqual([])
    // The first assessment is offered only when the server says the days are attended.
    expect(canRecordTrainingAssessment('accepted', 'in_progress')).toBe(false)
    expect(canRecordTrainingAssessment('accepted', 'awaiting_assessment')).toBe(true)
  })

  it('w6_notice_version_constant_is_w6_v1', () => {
    expect(trainingEnrollmentNoticeVersion).toBe('w6_v1')
    expect(noticeCopyVersion).toBe('w6_v1')
  })
})
