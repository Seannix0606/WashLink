import { AdminOversightService } from '../../application/services/AdminOversightService'
import { ContractTemplateService } from '../../application/services/ContractTemplateService'
import { JobOpeningModerationService } from '../../application/services/JobOpeningModerationService'
import { PlatformContractTemplateService } from '../../application/services/PlatformContractTemplateService'
import { WorkforceActivityService } from '../../application/services/WorkforceActivityService'
import { SupabaseAdminOversightRepository } from '../../infrastructure/repositories/SupabaseAdminOversightRepository'
import { SupabaseContractTemplateActionRepository } from '../../infrastructure/repositories/SupabaseContractTemplateActionRepository'
import { SupabaseContractTemplateRepository } from '../../infrastructure/repositories/SupabaseContractTemplateRepository'
import { SupabaseJobOpeningModerationRepository } from '../../infrastructure/repositories/SupabaseJobOpeningModerationRepository'
import { SupabasePlatformContractTemplateRepository } from '../../infrastructure/repositories/SupabasePlatformContractTemplateRepository'
import { SupabaseWorkforceActivityRepository } from '../../infrastructure/repositories/SupabaseWorkforceActivityRepository'

/**
 * W14 moderation, oversight reads, "Your activity" and standard template publishing. Every role
 * gets the same services; the database decides what each account may read or do.
 */
export interface ModerationDependencies {
  readonly jobOpeningModerationService: JobOpeningModerationService
  readonly workforceActivityService: WorkforceActivityService
  readonly adminOversightService: AdminOversightService
  readonly platformContractTemplateService: PlatformContractTemplateService
  /** W8 reads reused for the standard template preview. */
  readonly contractTemplateService: ContractTemplateService
}

export function createModerationDependencies(): ModerationDependencies {
  return {
    jobOpeningModerationService: new JobOpeningModerationService(new SupabaseJobOpeningModerationRepository()),
    workforceActivityService: new WorkforceActivityService(new SupabaseWorkforceActivityRepository()),
    adminOversightService: new AdminOversightService(new SupabaseAdminOversightRepository()),
    platformContractTemplateService: new PlatformContractTemplateService(new SupabasePlatformContractTemplateRepository()),
    contractTemplateService: new ContractTemplateService(new SupabaseContractTemplateRepository(), new SupabaseContractTemplateActionRepository()),
  }
}
