import { BookingService } from '../../application/services/BookingService'
import { ShopService } from '../../application/services/ShopService'
import { WorkerService } from '../../application/services/WorkerService'
import { SupabaseBookingRepository } from '../../infrastructure/repositories/SupabaseBookingRepository'
import { SupabaseShopRepository } from '../../infrastructure/repositories/SupabaseShopRepository'
import { SupabaseWorkerRepository } from '../../infrastructure/repositories/SupabaseWorkerRepository'

interface DashboardDependencies {
  bookingService: BookingService
  workerService: WorkerService
  shopService: ShopService
  ownerIdentifier: string
}

export function createDashboardDependencies(
  ownerIdentifier: string,
): DashboardDependencies {
  const supabaseBookingRepository = new SupabaseBookingRepository()
  const supabaseWorkerRepository = new SupabaseWorkerRepository()
  const supabaseShopRepository = new SupabaseShopRepository()
  const bookingService = new BookingService(
    supabaseBookingRepository,
    supabaseWorkerRepository,
  )
  const workerService = new WorkerService(supabaseWorkerRepository)
  const shopService = new ShopService(supabaseShopRepository)

  return { bookingService, workerService, shopService, ownerIdentifier }
}
