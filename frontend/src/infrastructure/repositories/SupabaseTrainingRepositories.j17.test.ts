import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  testAttendanceIdentifier,
  testTrainingEnrollmentIdentifier,
  testTrainingProgramIdentifier,
  testTrainingSessionIdentifier,
} from '../../test/trainingFixtures'
import { testShopIdentifier, testWorkerRowIdentifier } from '../../test/fixtures'
import {
  jobOpeningSupabaseDouble as supabaseDouble,
  recordedArgumentsOf,
  resetJobOpeningSupabaseDouble,
} from '../../test/jobOpeningSupabaseDouble'
import { SupabaseTrainingEnrollmentRepository } from './SupabaseTrainingEnrollmentRepository'
import { SupabaseTrainingEvidenceRepository } from './SupabaseTrainingEvidenceRepository'
import { SupabaseTrainingProgramRepository } from './SupabaseTrainingProgramRepository'

vi.mock('../supabase/supabaseClient', async () => {
  const { createJobOpeningSupabaseClientDouble } = await import('../../test/jobOpeningSupabaseDouble')
  return { isSupabaseConfigured: true, getSupabaseClient: createJobOpeningSupabaseClientDouble }
})

describe('Training repositories (J17 authorization)', () => {
  beforeEach(() => {
    resetJobOpeningSupabaseDouble()
  })

  it('j17_training_repositories_write_only_through_rpcs', async () => {
    // Every RPC answers with a row id, so each write resolves.
    supabaseDouble.rpcResult = { data: { id: testTrainingProgramIdentifier }, error: null }
    const programRepository = new SupabaseTrainingProgramRepository()
    const enrollmentRepository = new SupabaseTrainingEnrollmentRepository()
    const evidenceRepository = new SupabaseTrainingEvidenceRepository()

    await programRepository.createProgram(testShopIdentifier, 'Hand wash basics')
    await programRepository.transition(testTrainingProgramIdentifier, 'draft', 'open', 'w6_owner_v1')
    await programRepository.addSession(testTrainingProgramIdentifier, {
      sessionDate: '2026-11-02', sessionKind: 'supervised_training', startTime: null, endTime: null, location: null,
    })
    await programRepository.cancelSession(testTrainingSessionIdentifier, 'Bay closed for repairs.')
    await programRepository.designateTrainer(testTrainingProgramIdentifier, testWorkerRowIdentifier)
    await enrollmentRepository.invite(testTrainingProgramIdentifier, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    await enrollmentRepository.respond({
      enrollmentId: testTrainingEnrollmentIdentifier, accept: true, noticeVersion: 'w6_v1', expectedScheduleChangedAt: null,
    })
    await enrollmentRepository.withdraw(testTrainingEnrollmentIdentifier)
    await enrollmentRepository.cancel(testTrainingEnrollmentIdentifier, null)
    await evidenceRepository.recordAttendance({
      enrollmentId: testTrainingEnrollmentIdentifier, sessionId: testTrainingSessionIdentifier, attendanceStatus: 'present', progressNote: null,
    })
    await evidenceRepository.correctAttendance({
      attendanceId: testAttendanceIdentifier, attendanceStatus: 'absent', progressNote: null, correctionReason: 'Recorded on the wrong day.',
    })
    await evidenceRepository.recordAssessment({
      enrollmentId: testTrainingEnrollmentIdentifier, itemsMet: [true, true], result: 'passed', assessorComment: null, failureReason: null,
    })

    // No table write at all: the training tables are read-only for clients.
    expect(recordedArgumentsOf('insert')).toEqual([])
    expect(recordedArgumentsOf('update')).toEqual([])
    expect(recordedArgumentsOf('delete')).toEqual([])
    expect(recordedArgumentsOf('from')).toEqual([])
    const rpcCalls = recordedArgumentsOf('rpc') as [string, Record<string, unknown>][]
    expect(rpcCalls.map(([rpcName]) => rpcName)).toEqual([
      'create_training_program',
      'transition_training_program',
      'add_training_session',
      'cancel_training_session',
      'designate_training_trainer',
      'invite_to_training',
      'respond_to_training_invitation',
      'withdraw_from_training',
      'cancel_training_enrollment',
      'record_training_attendance',
      'correct_training_attendance',
      'record_training_assessment',
    ])
    // No argument names a status column, the owner, the worker, the recorder, the fee or a
    // stamp; the only timestamp sent is an expected version the database compares.
    for (const [, rpcArguments] of rpcCalls) {
      for (const argumentName of Object.keys(rpcArguments)) {
        expect(argumentName).not.toMatch(/^p_(status|owner_id|worker_id|trainer_id|recorded_by)$|fee/)
        if (argumentName.endsWith('_at')) {
          expect(argumentName.startsWith('p_expected_')).toBe(true)
        }
      }
    }
  })

  it('j17_training_rpc_without_a_row_is_a_failure', async () => {
    supabaseDouble.rpcResult = { data: { id: null }, error: null }
    await expect(new SupabaseTrainingEnrollmentRepository().withdraw(testTrainingEnrollmentIdentifier)).rejects.toThrow(
      'This training record changed or is no longer available. Refresh and try again.',
    )
  })
})
