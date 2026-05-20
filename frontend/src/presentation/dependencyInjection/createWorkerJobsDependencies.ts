import { BookingService } from '../../application/services/BookingService'
import { WorkerService } from '../../application/services/WorkerService'
import { SupabaseBookingRepository } from '../../infrastructure/repositories/SupabaseBookingRepository'
import { SupabaseWorkerRepository } from '../../infrastructure/repositories/SupabaseWorkerRepository'

interface WorkerJobsDependencies {
  bookingService: BookingService
  workerService: WorkerService
  workerUserIdentifier: string
}

export function createWorkerJobsDependencies(
  workerUserIdentifier: string,
): WorkerJobsDependencies {
  const supabaseBookingRepository = new SupabaseBookingRepository()
  const supabaseWorkerRepository = new SupabaseWorkerRepository()
  const bookingService = new BookingService(
    supabaseBookingRepository,
    supabaseWorkerRepository,
  )
  const workerService = new WorkerService(supabaseWorkerRepository)

  return { bookingService, workerService, workerUserIdentifier }
}
