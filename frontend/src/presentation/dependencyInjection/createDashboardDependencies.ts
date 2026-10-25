import { ApplicantPipelineService } from '../../application/services/ApplicantPipelineService'
import { BookingService } from '../../application/services/BookingService'
import { JobOpeningService } from '../../application/services/JobOpeningService'
import { RosterLinkService } from '../../application/services/RosterLinkService'
import { ShopService } from '../../application/services/ShopService'
import { ShopVerificationService } from '../../application/services/ShopVerificationService'
import { WorkerService } from '../../application/services/WorkerService'
import { SupabaseApplicantPipelineRepository } from '../../infrastructure/repositories/SupabaseApplicantPipelineRepository'
import { SupabaseBookingRepository } from '../../infrastructure/repositories/SupabaseBookingRepository'
import { SupabaseJobOpeningRepository } from '../../infrastructure/repositories/SupabaseJobOpeningRepository'
import { SupabaseRosterLinkRepository } from '../../infrastructure/repositories/SupabaseRosterLinkRepository'
import { SupabaseShopRepository } from '../../infrastructure/repositories/SupabaseShopRepository'
import { SupabaseShopVerificationRepository } from '../../infrastructure/repositories/SupabaseShopVerificationRepository'
import { SupabaseWorkerRepository } from '../../infrastructure/repositories/SupabaseWorkerRepository'
import { createTrainingDependencies, type TrainingDependencies } from './createTrainingDependencies'

interface DashboardDependencies {
  bookingService: BookingService
  workerService: WorkerService
  shopService: ShopService
  shopVerificationService: ShopVerificationService
  rosterLinkService: RosterLinkService
  jobOpeningService: JobOpeningService
  applicantPipelineService: ApplicantPipelineService
  trainingDependencies: TrainingDependencies
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
  const jobOpeningService = new JobOpeningService(
    new SupabaseJobOpeningRepository(),
  )
  const applicantPipelineService = new ApplicantPipelineService(
    new SupabaseApplicantPipelineRepository(),
  )

  return {
    bookingService,
    workerService,
    shopService,
    shopVerificationService,
    rosterLinkService,
    jobOpeningService,
    applicantPipelineService,
    trainingDependencies: createTrainingDependencies(),
    ownerIdentifier,
  }
}
