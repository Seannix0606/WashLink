import { BookingService } from '../../application/services/BookingService'
import { ShopService } from '../../application/services/ShopService'
import { SupabaseBookingRepository } from '../../infrastructure/repositories/SupabaseBookingRepository'
import { SupabaseShopRepository } from '../../infrastructure/repositories/SupabaseShopRepository'
import { SupabaseWorkerRepository } from '../../infrastructure/repositories/SupabaseWorkerRepository'

interface CustomerBookingDependencies {
  bookingService: BookingService
  shopService: ShopService
  customerIdentifier: string
}

export function createCustomerBookingDependencies(
  customerIdentifier: string,
): CustomerBookingDependencies {
  const supabaseBookingRepository = new SupabaseBookingRepository()
  const supabaseWorkerRepository = new SupabaseWorkerRepository()
  const supabaseShopRepository = new SupabaseShopRepository()
  const bookingService = new BookingService(
    supabaseBookingRepository,
    supabaseWorkerRepository,
  )
  const shopService = new ShopService(supabaseShopRepository)

  return { bookingService, shopService, customerIdentifier }
}
