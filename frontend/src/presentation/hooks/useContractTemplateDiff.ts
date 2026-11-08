import { useCallback } from 'react'
import type { ContractTemplateService } from '../../application/services/ContractTemplateService'
import type { ContractTemplateDiffRow } from '../../domain/models/ContractTemplate'
import { useLatestResource, type UseLatestResourceResult } from './useLatestResource'

const noDiffRows: readonly ContractTemplateDiffRow[] = []

/** One version compared with the standard version it is based on (unchanged / edited / added). */
export function useContractTemplateDiff(
  contractTemplateService: ContractTemplateService,
  versionId: string,
): UseLatestResourceResult<readonly ContractTemplateDiffRow[]> {
  const loadDiff = useCallback(
    async (): Promise<readonly ContractTemplateDiffRow[]> => contractTemplateService.diffVersion(versionId),
    [contractTemplateService, versionId],
  )
  return useLatestResource({
    load: loadDiff,
    initialResource: noDiffRows,
    loadFailedMessage: 'Could not load the comparison with the standard.',
  })
}
