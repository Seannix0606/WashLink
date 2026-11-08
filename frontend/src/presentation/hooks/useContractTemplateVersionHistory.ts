import { useCallback } from 'react'
import type { ContractTemplateService } from '../../application/services/ContractTemplateService'
import type { ContractTemplateVersionSummary } from '../../domain/models/ContractTemplate'
import { useLatestResource, type UseLatestResourceResult } from './useLatestResource'

const noVersions: readonly ContractTemplateVersionSummary[] = []

/** Every saved version of one template, newest first; earlier versions never change. */
export function useContractTemplateVersionHistory(
  contractTemplateService: ContractTemplateService,
  templateId: string,
): UseLatestResourceResult<readonly ContractTemplateVersionSummary[]> {
  const loadHistory = useCallback(
    async (): Promise<readonly ContractTemplateVersionSummary[]> => contractTemplateService.listVersionHistory(templateId),
    [contractTemplateService, templateId],
  )
  return useLatestResource({ load: loadHistory, initialResource: noVersions, loadFailedMessage: 'Could not load the version history.' })
}
