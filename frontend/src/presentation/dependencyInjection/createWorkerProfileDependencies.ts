import { RosterLinkService } from '../../application/services/RosterLinkService'
import { WorkerProfileService } from '../../application/services/WorkerProfileService'
import { SupabaseRosterLinkRepository } from '../../infrastructure/repositories/SupabaseRosterLinkRepository'
import { SupabaseWorkerProfileRepository } from '../../infrastructure/repositories/SupabaseWorkerProfileRepository'

export interface WorkerProfileDependencies {
  readonly workerProfileService: WorkerProfileService
  readonly rosterLinkService: RosterLinkService
}

export function createWorkerProfileDependencies(): WorkerProfileDependencies {
  return {
    workerProfileService: new WorkerProfileService(
      new SupabaseWorkerProfileRepository(),
    ),
    rosterLinkService: new RosterLinkService(new SupabaseRosterLinkRepository()),
  }
}
