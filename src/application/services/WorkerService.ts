import type { RealtimeChannel } from '@supabase/supabase-js'
import type { CreateWorkerInput, Worker } from '../../domain/models/Worker'
import type { WorkerRepository } from '../../domain/repositories/WorkerRepository'
import { CreateWorkerInputSchema } from '../validation/schemas'

export class WorkerService {
  public constructor(private readonly workerRepository: WorkerRepository) {}

  public async fetchWorkersForOwner(ownerIdentifier: string): Promise<Worker[]> {
    return this.workerRepository.fetchWorkersByOwner(ownerIdentifier)
  }

  public async createWorkerForOwner(
    ownerIdentifier: string,
    createWorkerInput: CreateWorkerInput,
  ): Promise<Worker> {
    const validatedWorkerInput = CreateWorkerInputSchema.parse(createWorkerInput)
    return this.workerRepository.createWorkerForOwner(
      ownerIdentifier,
      validatedWorkerInput,
    )
  }

  public async deleteWorker(workerIdentifier: string): Promise<void> {
    await this.workerRepository.deleteWorker(workerIdentifier)
  }

  public async fetchWorkerByIdentifier(workerIdentifier: string): Promise<Worker> {
    return this.workerRepository.fetchWorkerByIdentifier(workerIdentifier)
  }

  public async fetchWorkerByUserIdentifier(workerUserIdentifier: string): Promise<Worker> {
    return this.workerRepository.fetchWorkerByUserIdentifier(workerUserIdentifier)
  }

  public async updateAvailability(
    workerIdentifier: string,
    isAvailableForNewJobs: boolean,
  ): Promise<Worker> {
    return this.workerRepository.updateWorkerAvailability(
      workerIdentifier,
      isAvailableForNewJobs,
    )
  }

  public subscribeToWorkerRowUpdatesForOwner(
    ownerIdentifier: string,
    onWorkerRowUpdated: (worker: Worker) => void,
  ): RealtimeChannel {
    return this.workerRepository.subscribeToWorkerRowUpdatesForOwner(
      ownerIdentifier,
      onWorkerRowUpdated,
    )
  }

  public async removeWorkerRealtimeSubscription(
    workerRealtimeChannel: RealtimeChannel,
  ): Promise<void> {
    await this.workerRepository.unsubscribeFromWorkerRealtimeChannel(
      workerRealtimeChannel,
    )
  }
}
