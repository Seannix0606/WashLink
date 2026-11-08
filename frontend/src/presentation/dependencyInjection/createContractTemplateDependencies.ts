import { ContractTemplateService } from '../../application/services/ContractTemplateService'
import { SupabaseContractTemplateActionRepository } from '../../infrastructure/repositories/SupabaseContractTemplateActionRepository'
import { SupabaseContractTemplateRepository } from '../../infrastructure/repositories/SupabaseContractTemplateRepository'

export interface ContractTemplateDependencies {
  readonly contractTemplateService: ContractTemplateService
}

export function createContractTemplateDependencies(): ContractTemplateDependencies {
  return {
    contractTemplateService: new ContractTemplateService(
      new SupabaseContractTemplateRepository(),
      new SupabaseContractTemplateActionRepository(),
    ),
  }
}
