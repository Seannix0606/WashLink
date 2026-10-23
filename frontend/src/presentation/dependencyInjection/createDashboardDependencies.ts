import { BookingService } from '../../application/services/BookingService'
import { RosterLinkService } from '../../application/services/RosterLinkService'
import { ShopService } from '../../application/services/ShopService'
import { ShopVerificationService } from '../../application/services/ShopVerificationService'
import { WorkerService } from '../../application/services/WorkerService'
import { SupabaseBookingRepository } from '../../infrastructure/repositories/SupabaseBookingRepository'
import { SupabaseRosterLinkRepository } from '../../infrastructure/repositories/SupabaseRosterLinkRepository'
import { SupabaseShopRepository } from '../../infrastructure/repositories/SupabaseShopRepository'
import { SupabaseShopVerificationRepository } from '../../infrastructure/repositories/SupabaseShopVerificationRepository'
import { SupabaseWorkerRepository } from '../../infrastructure/repositories/SupabaseWorkerRepository'

interface DashboardDependencies {
  bookingService: BookingService
  workerService: WorkerService
  shopService: ShopService
  shopVerificationService: ShopVerificationService
  rosterLinkService: RosterLinkService
  ownerIdentifier: string
}

export function createDashboardDependencies(
  ownerIdentifier: string,
): DashboardDependencies {
  const supabaseBookingRepository = new SupabaseBookingRepository()
  const supabaseWorkerRepository = new SupabaseWorkerRepository()
  const supabaseShopRepository = new SupabaseShopRepository()
  const supabaseShopVerificationRepository =
    new SupabaseShopVerificationRepository()
  const bookingService = new BookingService(
    supabaseBookingRepository,
    supabaseWorkerRepository,
  )
  const workerService = new WorkerService(supabaseWorkerRepository)
  const shopService = new ShopService(supabaseShopRepository)
  const shopVerificationService = new ShopVerificationService(
    supabaseShopVerificationRepository,
  )
  const rosterLinkService = new RosterLinkService(
    new SupabaseRosterLinkRepository(),
  )

  return {
    bookingService,
    workerService,
    shopService,
    shopVerificationService,
    rosterLinkService,
    ownerIdentifier,
  }
}
