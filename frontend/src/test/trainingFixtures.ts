import { vi, type Mock } from 'vitest'
import { TrainingEnrollmentService } from '../application/services/TrainingEnrollmentService'
import { TrainingEvidenceService } from '../application/services/TrainingEvidenceService'
import { TrainingProgramService } from '../application/services/TrainingProgramService'
import type {
  MyTraining,
  TrainingEnrollment,
  TrainingEnrollmentProgress,
  TrainingRosterEntry,
} from '../domain/models/TrainingEnrollment'
import type { TrainingAssessmentEvidence, TrainingAttendanceEvidence } from '../domain/models/TrainingEvidence'
import type { TrainingProgram } from '../domain/models/TrainingProgram'
import type { TrainingSession } from '../domain/models/TrainingSession'
import type { TrainingEnrollmentRepository } from '../domain/repositories/TrainingEnrollmentRepository'
import type { TrainingEvidenceRepository } from '../domain/repositories/TrainingEvidenceRepository'
import type { TrainingProgramRepository } from '../domain/repositories/TrainingProgramRepository'
import type { TrainingDependencies } from '../presentation/dependencyInjection/createTrainingDependencies'
import { testShopIdentifier } from './fixtures'

// Synthetic W6 test data only; no real person, shop or contact detail.
export const testTrainingProgramIdentifier = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
export const testTrainingEnrollmentIdentifier = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
export const testTrainingSessionIdentifier = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
export const testAttendanceIdentifier = '12121212-1212-4121-8121-121212121212'

type MockedRepository<RepositoryContract> = {
  [MethodName in keyof RepositoryContract]: RepositoryContract[MethodName] extends (
    ...methodArguments: never[]
  ) => unknown
    ? Mock<RepositoryContract[MethodName]>
    : never
}

export function buildTrainingProgram(overrides: Partial<TrainingProgram> = {}): TrainingProgram {
  return {
    id: testTrainingProgramIdentifier,
    shopId: testShopIdentifier,
    title: 'Hand wash basics',
    objectives: 'Learn safe hand washing.',
    skillsToLearn: ['Pre-rinse', 'Two-bucket wash'],
    terms: 'Three supervised mornings, then an assessment.',
    trainingKind: 'required_initial',
    minTrainingDays: 3,
    assessmentChecklist: ['Pre-rinses the whole car', 'Uses two buckets'],
    workerFee: 0,
    trainingPayAmount: null,
    trainingPayCurrency: null,
    trainingPayPeriod: null,
    trainingPayDetails: null,
    reimbursementDetails: null,
    status: 'open',
    ownerAttestationVersion: 'w6_owner_v1',
    ownerAttestedAt: '2026-10-25T01:00:00+00:00',
    scheduleChangedAt: '2026-10-25T01:00:00.123456+00:00',
    statusChangedAt: '2026-10-25T01:00:00+00:00',
    openedAt: '2026-10-25T01:00:00+00:00',
    createdAt: '2026-10-24T01:00:00+00:00',
    updatedAt: '2026-10-25T01:00:00.654321+00:00',
    ...overrides,
  }
}

export function buildTrainingSession(overrides: Partial<TrainingSession> = {}): TrainingSession {
  return {
    id: testTrainingSessionIdentifier,
    programId: testTrainingProgramIdentifier,
    sessionDate: '2026-10-20',
    startTime: '08:00:00',
    endTime: '11:00:00',
    location: 'Test bay 1',
    sessionKind: 'supervised_training',
    status: 'scheduled',
    cancelReason: null,
    cancelledAt: null,
    createdAt: '2026-10-19T01:00:00+00:00',
    ...overrides,
  }
}

export function buildTrainingEnrollment(overrides: Partial<TrainingEnrollment> = {}): TrainingEnrollment {
  return {
    id: testTrainingEnrollmentIdentifier,
    programId: testTrainingProgramIdentifier,
    shopId: testShopIdentifier,
    shopNameSnapshot: 'Test Shop',
    programTitleSnapshot: 'Hand wash basics',
    ownerDisplayNameSnapshot: 'Test Owner',
    status: 'invited',
    invitedAt: '2026-10-25T01:00:00+00:00',
    respondedAt: null,
    acceptedAt: null,
    endedAt: null,
    noticeVersion: null,
    noticeAcknowledgedAt: null,
    termsSnapshot: null,
    termsSnapshotTakenAt: null,
    cancelReason: null,
    ...overrides,
  }
}

export function buildTrainingProgress(overrides: Partial<TrainingEnrollmentProgress> = {}): TrainingEnrollmentProgress {
  return {
    enrollmentId: testTrainingEnrollmentIdentifier,
    programId: testTrainingProgramIdentifier,
    enrollmentStatus: 'invited',
    requiredTrainingDays: 3,
    attendedTrainingDays: 0,
    hasRecordedAttendance: false,
    currentAssessmentId: null,
    currentAssessmentResult: null,
    progressStatus: 'invited',
    ...overrides,
  }
}

export function buildRosterEntry(overrides: Partial<TrainingRosterEntry> = {}): TrainingRosterEntry {
  return {
    enrollmentId: testTrainingEnrollmentIdentifier,
    displayName: 'Test Trainee',
    enrollmentStatus: 'accepted',
    acceptedAt: '2026-10-18T01:00:00+00:00',
    requiredTrainingDays: 3,
    attendedTrainingDays: 1,
    hasRecordedAttendance: true,
    currentAssessmentId: null,
    currentAssessmentResult: null,
    progressStatus: 'in_progress',
    ...overrides,
  }
}

export function buildAttendanceEvidence(overrides: Partial<TrainingAttendanceEvidence> = {}): TrainingAttendanceEvidence {
  return {
    evidenceKind: 'attendance',
    evidenceId: testAttendanceIdentifier,
    supersedesId: null,
    isCurrent: true,
    recorderRole: 'owner',
    recordedByDisplayName: 'Test Owner',
    recordedAt: '2026-10-20T04:00:00+00:00',
    correctionReason: null,
    sessionId: testTrainingSessionIdentifier,
    sessionDate: '2026-10-20',
    sessionKind: 'supervised_training',
    attendanceStatus: 'present',
    progressNote: null,
    ...overrides,
  }
}

export function buildAssessmentEvidence(overrides: Partial<TrainingAssessmentEvidence> = {}): TrainingAssessmentEvidence {
  return {
    evidenceKind: 'assessment',
    evidenceId: '34343434-3434-4343-8343-343434343434',
    supersedesId: null,
    isCurrent: true,
    recorderRole: 'trainer',
    recordedByDisplayName: 'Test Trainer',
    recordedAt: '2026-10-23T04:00:00+00:00',
    correctionReason: null,
    checklistSnapshot: ['Pre-rinses the whole car', 'Uses two buckets'],
    itemsMet: [true, false],
    result: 'failed',
    assessorComment: null,
    failureReason: 'Skipped the second bucket rinse.',
    ...overrides,
  }
}

export function buildMyTraining(overrides: Partial<MyTraining> = {}): MyTraining {
  return {
    enrollment: buildTrainingEnrollment(),
    progress: buildTrainingProgress(),
    program: buildTrainingProgram(),
    sessions: [buildTrainingSession({ sessionDate: '2026-11-02' })],
    ...overrides,
  }
}

export function createMockTrainingProgramRepository(): MockedRepository<TrainingProgramRepository> {
  return {
    listOwnPrograms: vi.fn().mockResolvedValue([]),
    listDesignatedPrograms: vi.fn().mockResolvedValue([]),
    listProgramsByIds: vi.fn().mockResolvedValue([]),
    createProgram: vi.fn(),
    updateDraft: vi.fn(),
    deleteDraft: vi.fn(),
    transition: vi.fn(),
    isShopVerified: vi.fn().mockResolvedValue(true),
    listSessions: vi.fn().mockResolvedValue([]),
    addSession: vi.fn(),
    cancelSession: vi.fn(),
    deleteSessionDraft: vi.fn(),
    listTrainers: vi.fn().mockResolvedValue([]),
    designateTrainer: vi.fn(),
    revokeTrainer: vi.fn(),
  }
}

export function createMockTrainingEnrollmentRepository(): MockedRepository<TrainingEnrollmentRepository> {
  return {
    listMyEnrollments: vi.fn().mockResolvedValue([]),
    listProgress: vi.fn().mockResolvedValue([]),
    listRoster: vi.fn().mockResolvedValue([]),
    invite: vi.fn(),
    respond: vi.fn(),
    withdraw: vi.fn(),
    cancel: vi.fn(),
  }
}

export function createMockTrainingEvidenceRepository(): MockedRepository<TrainingEvidenceRepository> {
  return {
    listEvidence: vi.fn().mockResolvedValue([]),
    recordAttendance: vi.fn().mockResolvedValue(undefined),
    correctAttendance: vi.fn().mockResolvedValue(undefined),
    recordAssessment: vi.fn().mockResolvedValue(undefined),
    correctAssessment: vi.fn().mockResolvedValue(undefined),
  }
}

export interface TrainingTestHarness {
  readonly programRepository: ReturnType<typeof createMockTrainingProgramRepository>
  readonly enrollmentRepository: ReturnType<typeof createMockTrainingEnrollmentRepository>
  readonly evidenceRepository: ReturnType<typeof createMockTrainingEvidenceRepository>
  readonly trainingDependencies: TrainingDependencies
}

/** Real services over mocked repositories (no network). */
export function createTrainingTestHarness(): TrainingTestHarness {
  const programRepository = createMockTrainingProgramRepository()
  const enrollmentRepository = createMockTrainingEnrollmentRepository()
  const evidenceRepository = createMockTrainingEvidenceRepository()
  return {
    programRepository,
    enrollmentRepository,
    evidenceRepository,
    trainingDependencies: {
      trainingProgramService: new TrainingProgramService(programRepository),
      trainingEnrollmentService: new TrainingEnrollmentService(enrollmentRepository, programRepository),
      trainingEvidenceService: new TrainingEvidenceService(evidenceRepository),
    },
  }
}
