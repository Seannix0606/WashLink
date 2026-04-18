import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Booking } from '../models/Booking'
import type { CreateWorkerInput, Worker } from '../models/Worker'

export interface WorkerRepository {
  fetchWorkersByOwner(ownerIdentifier: string): Promise<Worker[]>
  fetchWorkerByIdentifier(workerIdentifier: string): Promise<Worker>
  fetchWorkerByUserIdentifier(workerUserIdentifier: string): Promise<Worker>
  createWorkerForOwner(
    ownerIdentifier: string,
    createWorkerInput: CreateWorkerInput,
  ): Promise<Worker>
  deleteWorker(workerIdentifier: string): Promise<void>
  updateWorkerAvailability(
    workerIdentifier: string,
    isAvailableForNewJobs: boolean,
  ): Promise<Worker>
  assignWorkerToBooking(
    bookingIdentifier: string,
    workerIdentifier: string,
  ): Promise<Booking>
  subscribeToWorkerRowUpdatesForOwner(
    ownerIdentifier: string,
    onWorkerRowUpdated: (worker: Worker) => void,
  ): RealtimeChannel
  unsubscribeFromWorkerRealtimeChannel(
    workerRealtimeChannel: RealtimeChannel,
  ): Promise<void>
}
