import { useCallback } from 'react'
import type { ContractTemplateService } from '../../application/services/ContractTemplateService'
import type { ContractTemplatePreviewClause } from '../../domain/models/ContractTemplate'
import { useLatestResource, type UseLatestResourceResult } from './useLatestResource'

const noPreviewClauses: readonly ContractTemplatePreviewClause[] = []

/** One version rendered by the server, with placeholders shown as bracketed labels. */
export function useContractTemplatePreview(
  contractTemplateService: ContractTemplateService,
  versionId: string,
): UseLatestResourceResult<readonly ContractTemplatePreviewClause[]> {
  const loadPreview = useCallback(
    async (): Promise<readonly ContractTemplatePreviewClause[]> => contractTemplateService.previewVersion(versionId),
    [contractTemplateService, versionId],
  )
  return useLatestResource({ load: loadPreview, initialResource: noPreviewClauses, loadFailedMessage: 'Could not load the preview.' })
}
